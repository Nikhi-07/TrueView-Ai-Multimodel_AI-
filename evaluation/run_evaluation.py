"""
TrueView AI – Model Evaluation Harness
======================================

Measures ACTUAL model performance over the local dataset in evaluation/dataset/.
Metrics are never fabricated: empty categories report "NOT MEASURED".

Usage:
    python run_evaluation.py --all
    python run_evaluation.py --face --liveness --voice --blink --perf

Output: console report + evaluation/results/evaluation_report.json
"""

import argparse
import base64
import json
import os
import statistics
import sys
import time
from collections import defaultdict

import numpy as np

# ── Make ai-service importable ──────────────────────────────────────
AI_SERVICE_DIR = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ai-service"))
if AI_SERVICE_DIR not in sys.path:
    sys.path.insert(0, AI_SERVICE_DIR)

DATASET_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dataset")
RESULTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
os.makedirs(RESULTS_DIR, exist_ok=True)

IMG_EXTS = {".jpg", ".jpeg", ".png"}
AUDIO_EXTS = {".wav", ".mp3", ".flac", ".ogg"}


def img_to_b64(path):
    with open(path, "rb") as f:
        return "data:image/jpeg;base64," + base64.b64encode(f.read()).decode()


def audio_to_b64(path):
    with open(path, "rb") as f:
        return "data:audio/wav;base64," + base64.b64encode(f.read()).decode()


def list_files(subdir, exts):
    base = os.path.join(DATASET_DIR, subdir)
    if not os.path.isdir(base):
        return []
    return [
        os.path.join(base, name)
        for name in sorted(os.listdir(base))
        if os.path.splitext(name)[1].lower() in exts
    ]


def not_measured(label):
    return {"status": "NOT MEASURED", "reason": f"No samples found for {label}. Add data under evaluation/dataset/"}


# ── Metrics helpers ─────────────────────────────────────────────────
def rate_stats(correct, total, label):
    if total == 0:
        return not_measured(label)
    return {"status": "MEASURED", "samples": total, "correct": correct, "accuracy": round(correct / total, 4)}


def far_frr(good, bad, classify):
    """classify(sample) -> accepted: bool. Returns (far, frr, n_good, n_bad)."""
    n_good = len(good)
    n_bad = len(bad)
    frr = sum(1 for g in good if not classify(g)) / n_good if n_good else None
    far = sum(1 for b in bad if classify(b)) / n_bad if n_bad else None
    return far, frr, n_good, n_bad


# ── 1. Face recognition (SFace) ─────────────────────────────────────
def evaluate_face():
    from face_recognition.recognizer import FaceRecognizer

    live_files = list_files("face/live", IMG_EXTS)
    attacks = {cat: list_files(f"face/{cat}", IMG_EXTS) for cat in ["printed_photo", "phone_photo", "monitor_photo", "video_replay"]}
    if not live_files:
        return {"face_recognition": not_measured("face/live")}

    recognizer = FaceRecognizer()

    # Enroll: first live image of each subject
    subjects = defaultdict(list)
    for p in live_files:
        subject = os.path.basename(p).split("__")[0]
        subjects[subject].append(p)

    gallery = []
    genuine_probes = []
    for subject, files in subjects.items():
        first = recognizer.extract_embedding(img_to_b64(files[0]))
        if "error" in first:
            continue
        gallery.append({"id": subject, "embedding": first["embedding"]})
        genuine_probes.extend(files[1:])

    if not gallery:
        return {"face_recognition": {"status": "NOT MEASURED", "reason": "No face detected in enrollment images"}}

    impostor_probes = []
    for subject, files in subjects.items():
        for other, other_files in subjects.items():
            if other != subject and other_files:
                impostor_probes.append(other_files[0])
    for files in attacks.values():
        impostor_probes.extend(files)

    def accept(probe):
        res = recognizer.verify(img_to_b64(probe), gallery)
        return bool(res.get("verified"))

    accepted_genuine = sum(1 for p in genuine_probes if accept(p))
    accepted_impostor = sum(1 for p in impostor_probes if accept(p))

    n_g = len(genuine_probes)
    n_i = len(impostor_probes)
    tar = accepted_genuine / n_g if n_g else None
    far = accepted_impostor / n_i if n_i else None
    frr = (1 - tar) if tar is not None else None
    accuracy = None
    if n_g and n_i:
        accuracy = (accepted_genuine + (n_i - accepted_impostor)) / (n_g + n_i)

    # Cross-sample similarity matrix (documented; reveals why PAD is required)
    similarity_matrix = {}
    all_keys = [g["id"] for g in gallery]
    for a in all_keys:
        sims = {}
        for b in all_keys:
            ea = np.array([g["embedding"] for g in gallery if g["id"] == a][0], dtype=np.float32)
            eb = np.array([g["embedding"] for g in gallery if g["id"] == b][0], dtype=np.float32)
            sims[b] = round(float(np.dot(ea / np.linalg.norm(ea), eb / np.linalg.norm(eb))), 3)
        similarity_matrix[a] = sims

    return {
        "face_recognition": {
            "status": "MEASURED" if (n_g or n_i) else "NOT MEASURED",
            "subjects": len(gallery),
            "genuine_probes": n_g,
            "impostor_probes": n_i,
            "true_acceptance_rate": round(tar, 4) if tar is not None else None,
            "false_acceptance_rate": round(far, 4) if far is not None else None,
            "false_rejection_rate": round(frr, 4) if frr is not None else None,
            "accuracy": round(accuracy, 4) if accuracy is not None else None,
            "per_category_impostor_accepts": {
                cat: sum(1 for p in files if accept(p)) for cat, files in attacks.items() if files
            },
            "similarity_matrix": similarity_matrix if similarity_matrix else None,
            "caveat": "Preliminary evaluation due to limited public sample dataset (model-author labeled images).",
        }
    }


# ── 2. Liveness / PAD (MiniFASNet) ──────────────────────────────────
def evaluate_liveness():
    from liveness_detection.mini_fasnet.anti_spoof import MiniFASNetAntiSpoof

    live_files = list_files("face/live", IMG_EXTS)
    attack_cats = ["printed_photo", "phone_photo", "monitor_photo", "video_replay"]
    attacks = {cat: list_files(f"face/{cat}", IMG_EXTS) for cat in attack_cats}

    engine = MiniFASNetAntiSpoof(threshold=0.50)
    all_attacks = [p for files in attacks.values() for p in files]

    if not live_files and not all_attacks:
        return {"liveness": not_measured("face/live or face/*")}

    def is_live(img_path):
        import cv2
        frame = cv2.imread(img_path)
        if frame is None:
            return None
        return engine.analyze_frame(frame).get("status") == "LIVE"

    live_flagged_spoof = 0
    live_total = 0
    for p in live_files:
        r = is_live(p)
        if r is None:
            continue
        live_total += 1
        if not r:
            live_flagged_spoof += 1

    per_attack = {}
    for cat, files in attacks.items():
        if not files:
            continue
        detected = sum(1 for p in files if is_live(p) is False)
        failed = sum(1 for p in files if is_live(p) is None)
        per_attack[cat] = {
            "samples": len(files) - failed,
            "detected": detected,
            "attack_detection_rate": round(detected / (len(files) - failed), 4) if (len(files) - failed) else None,
        }

    attack_total = sum(v["samples"] for v in per_attack.values())
    attack_detected = sum(v["detected"] for v in per_attack.values())

    return {
        "liveness": {
            "status": "MEASURED" if (live_total or attack_total) else "NOT MEASURED",
            "live_samples": live_total,
            "attack_samples": attack_total,
            "false_rejection_rate_live": round(live_flagged_spoof / live_total, 4) if live_total else None,
            "false_acceptance_rate_attack": round((attack_total - attack_detected) / attack_total, 4) if attack_total else None,
            "overall_attack_detection_rate": round(attack_detected / attack_total, 4) if attack_total else None,
            "per_attack": per_attack,
            "model": "MiniFASNetV2 (ONNX)",
        }
    }


# ── 3. Voice verification (ECAPA-TDNN) ──────────────────────────────
def evaluate_voice():
    from voice_detection.speaker_recognition.voice_identity_engine import VoiceIdentityEngine

    registered = list_files("voice/registered", AUDIO_EXTS)
    unknown = list_files("voice/unknown", AUDIO_EXTS)
    multi = list_files("voice/multiple_speakers", AUDIO_EXTS)
    noise = list_files("voice/noise", AUDIO_EXTS)

    engine = VoiceIdentityEngine()
    model = engine.get_active_model()["model"]

    if not registered:
        return {"voice": not_measured("voice/registered")}

    # Enroll one clip per subject; use the rest as genuine probes
    subjects = defaultdict(list)
    for p in registered:
        subject = os.path.basename(p).split("__")[0]
        subjects[subject].append(p)

    enrolled = {}
    genuine_scores = []
    for subject, files in subjects.items():
        emb = engine.extract_speaker_embedding(audio_to_b64(files[0]))
        if not emb.get("speech_detected") or not emb.get("embedding"):
            continue
        enrolled[subject] = emb["embedding"]
        for p in files[1:]:
            res = engine.verify_speaker(audio_to_b64(p), enrolled[subject], 0.75)
            if res.get("speech_detected"):
                genuine_scores.append(res.get("confidence", 0.0))

    impostor_pool = unknown + multi + noise
    impostor_scores = []
    for p in impostor_pool:
        for subject, cand in enrolled.items():
            res = engine.verify_speaker(audio_to_b64(p), cand, 0.75)
            if res.get("speech_detected"):
                impostor_scores.append(res.get("confidence", 0.0))

    def classify_score(score, threshold):
        return score >= threshold

    # Sweep thresholds for EER
    eer = None
    if genuine_scores and impostor_scores:
        all_thresholds = sorted(set(genuine_scores + impostor_scores) | {0.5})
        best = None
        for th in all_thresholds:
            frr = sum(1 for s in genuine_scores if not classify_score(s, th)) / len(genuine_scores)
            far = sum(1 for s in impostor_scores if classify_score(s, th)) / len(impostor_scores)
            diff = abs(frr - far)
            if best is None or diff < best[0]:
                best = (diff, th, frr, far)
        if best:
            eer = round((best[2] + best[3]) / 2, 4)

    return {
        "voice": {
            "status": "MEASURED" if (genuine_scores or impostor_scores) else "NOT MEASURED",
            "model": model,
            "enrolled_subjects": len(enrolled),
            "genuine_scores": len(genuine_scores),
            "impostor_scores": len(impostor_scores),
            "equal_error_rate": eer,
            "genuine_mean_similarity": round(statistics.mean(genuine_scores), 4) if genuine_scores else None,
            "impostor_mean_similarity": round(statistics.mean(impostor_scores), 4) if impostor_scores else None,
        }
    }


# ── 4. Blink detection (MediaPipe blendshape temporal detector) ─────
def evaluate_blink():
    from liveness_detection.blink_detector import MediaPipeBlendshapeBlinkDetector

    positive_seq = list_files("blink/blink", {".json"})
    negative_cats = {
        "no_blink": list_files("blink/no_blink", {".json"}),
        "head_movement": list_files("blink/head_movement", {".json"}),
        "laptop_tilt": list_files("blink/laptop_tilt", {".json"}),
        "camera_movement": list_files("blink/camera_movement", {".json"}),
    }
    negative_seq = [p for files in negative_cats.values() for p in files]

    def run_sequence(path):
        with open(path) as f:
            frames = json.load(f)
        detector = MediaPipeBlendshapeBlinkDetector()
        for fr in frames:
            detector.process_blendshapes(fr.get("left", 0.1), fr.get("right", 0.1), timestamp=fr.get("t", 0.0))
        return detector.blink_count

    true_pos = sum(1 for p in positive_seq if run_sequence(p) >= 1)
    false_neg = len(positive_seq) - true_pos
    false_pos = sum(1 for p in negative_seq if run_sequence(p) >= 1)
    true_neg = len(negative_seq) - false_pos

    tpr = true_pos / len(positive_seq) if positive_seq else None
    fpr = false_pos / len(negative_seq) if negative_seq else None
    accuracy = (true_pos + true_neg) / (len(positive_seq) + len(negative_seq)) if (positive_seq or negative_seq) else None

    per_category_fp = {
        cat: sum(1 for p in files if run_sequence(p) >= 1) for cat, files in negative_cats.items() if files
    }

    return {
        "blink": {
            "status": "MEASURED" if (positive_seq or negative_seq) else "NOT MEASURED",
            "positive_sequences": len(positive_seq),
            "negative_sequences": len(negative_seq),
            "confusion_matrix": {
                "true_positive": true_pos,
                "false_negative": false_neg,
                "false_positive": false_pos,
                "true_negative": true_neg,
            },
            "true_positive_rate": round(tpr, 4) if tpr is not None else None,
            "false_positive_rate": round(fpr, 4) if fpr is not None else None,
            "accuracy": round(accuracy, 4) if accuracy is not None else None,
            "false_positives_by_category": per_category_fp,
            "note": "Synthetic blendshape traces. Tilt/camera-motion categories verify that head motion does NOT count as a blink.",
        }
    }


# ── 4b. Alert engine severity mapping (deterministic policy logic) ──
def evaluate_alerts():
    """
    Evaluates whether the server-authoritative alert engine maps each event type
    to the severity prescribed by each session policy. This is a deterministic
    logic test (precision of the severity classifier), NOT a 'cheating detection'
    accuracy claim.
    """
    # The severity engine is server JavaScript — evaluate it through Node so we
    # test the ACTUAL production code path, not a Python re-implementation.
    import subprocess

    EVENT_LABELS = {
        "EXAM": {
            "CAMERA_INTERRUPTED": "CRITICAL", "MICROPHONE_INTERRUPTED": "CRITICAL",
            "MULTIPLE_FACES_DETECTED": "CRITICAL", "MULTIPLE_PERSONS": "CRITICAL",
            "PHONE_DETECTED": "HIGH", "UNAUTHORIZED_OBJECT": "HIGH",
            "UNKNOWN_SPEAKER": "HIGH", "MULTIPLE_SPEAKERS": "HIGH",
            "IDENTITY_MISMATCH": "CRITICAL", "GAZE_DEVIATION": "MEDIUM",
            "NO_FACE_DETECTED": "HIGH", "USER_ABSENT": "HIGH",
            "VOICE_DETECTED": "MEDIUM", "SPEECH_DETECTED": "MEDIUM",
            "HIGH_BACKGROUND_NOISE": "LOW", "AI_ENGINE_OFFLINE": "CRITICAL",
            "PARTICIPANT_JOINED": "INFO",
        },
        "INTERVIEW": {
            "CAMERA_INTERRUPTED": "HIGH", "MICROPHONE_INTERRUPTED": "HIGH",
            "MULTIPLE_FACES_DETECTED": "MEDIUM", "PHONE_DETECTED": "HIGH",
            "UNKNOWN_SPEAKER": "MEDIUM", "MULTIPLE_SPEAKERS": "MEDIUM",
            "IDENTITY_MISMATCH": "HIGH", "GAZE_DEVIATION": "LOW",
            "NO_FACE_DETECTED": "MEDIUM", "USER_ABSENT": "MEDIUM",
            "VOICE_DETECTED": "INFO", "AI_ENGINE_OFFLINE": "MEDIUM",
        },
        "CLASS": {
            "CAMERA_INTERRUPTED": "MEDIUM", "MICROPHONE_INTERRUPTED": "MEDIUM",
            "MULTIPLE_FACES_DETECTED": "INFO", "PHONE_DETECTED": "INFO",
            "UNKNOWN_SPEAKER": "INFO", "MULTIPLE_SPEAKERS": "INFO",
            "IDENTITY_MISMATCH": "INFO", "GAZE_DEVIATION": "INFO",
            "VOICE_DETECTED": "INFO", "AI_ENGINE_OFFLINE": "MEDIUM",
        },
        "MEETING": {
            "CAMERA_INTERRUPTED": "LOW", "MICROPHONE_INTERRUPTED": "LOW",
            "MULTIPLE_FACES_DETECTED": "INFO", "PHONE_DETECTED": "INFO",
            "UNKNOWN_SPEAKER": "INFO", "MULTIPLE_SPEAKERS": "INFO",
            "GAZE_DEVIATION": "INFO", "VOICE_DETECTED": "INFO",
            "AI_ENGINE_OFFLINE": "MEDIUM",
        },
    }

    server_dir = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "server"))
    node_script = (
        "const { evaluateEventSeverity } = require('./utils/sessionPolicies');"
        "const labels = " + json.dumps(EVENT_LABELS) + ";"
        "const out = [];"
        "for (const [mode, evts] of Object.entries(labels)) for (const [evt, expected] of Object.entries(evts))"
        "  out.push({ mode, evt, expected, actual: evaluateEventSeverity(evt, mode) });"
        "console.log(JSON.stringify(out));"
    )
    proc = subprocess.run(["node", "-e", node_script], cwd=server_dir, capture_output=True, text=True, timeout=30)
    results = json.loads(proc.stdout.strip().splitlines()[-1])

    total = len(results)
    correct = sum(1 for r in results if r["expected"] == r["actual"])
    mismatches = [r for r in results if r["expected"] != r["actual"]]

    precision = correct / total if total else None
    return {
        "alert_engine": {
            "status": "MEASURED" if total else "NOT MEASURED",
            "policy_mappings_tested": total,
            "modes_tested": list(EVENT_LABELS.keys()),
            "correct": correct,
            "severity_mapping_precision": round(precision, 4) if precision is not None else None,
            "mismatches": mismatches,
            "note": "Deterministic logic test of the severity classifier; NOT a claim about cheating detection accuracy.",
        }
    }


# ── 4c. Voice pipeline synthetic calibration (NOT a real-speaker EER) ──
def evaluate_voice_synthetic():
    """
    Exercises the FULL voice pipeline (decode -> VAD -> ECAPA-TDNN embedding ->
    cosine scoring -> threshold sweep) using synthetic tones. This validates the
    code path and produces a threshold curve, but the numbers are explicitly NOT
    real-speaker metrics — they are labelled SYNTHETIC PIPELINE CALIBRATION.
    """
    import base64 as b64mod
    import io
    import math
    import random as rnd
    import struct
    import wave

    def synth_wav_b64(seconds=2.5, freq=170, sr=16000, seed=1):
        r = rnd.Random(seed)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sr)
            frames = []
            for i in range(int(sr * seconds)):
                t = i / sr
                env = 0.5 + 0.5 * math.sin(2 * math.pi * 2.5 * t)
                sig = 0.28 * math.sin(2 * math.pi * freq * t) * env + 0.06 * r.uniform(-1, 1)
                frames.append(struct.pack("<h", int(max(-1.0, min(1.0, sig)) * 32767)))
            w.writeframes(b"".join(frames))
        return "data:audio/wav;base64," + b64mod.b64encode(buf.getvalue()).decode()

    from voice_detection.speaker_recognition.voice_identity_engine import VoiceIdentityEngine
    engine = VoiceIdentityEngine()

    # 3 synthetic "speakers" (different base frequencies) + 2 unknown variants
    enrolled = {}
    for i, freq in enumerate([150, 220, 300]):
        emb = engine.extract_speaker_embedding(synth_wav_b64(freq=freq, seed=i))
        if emb.get("embedding"):
            enrolled[f"SYNTH_{i}"] = emb["embedding"]

    genuine_scores = []
    impostor_scores = []
    for name, cand in enrolled.items():
        idx = int(name.split("_")[1])
        freq = [150, 220, 300][idx]
        res = engine.verify_speaker(synth_wav_b64(freq=freq, seed=100 + idx), cand, 0.5)
        if res.get("speech_detected"):
            genuine_scores.append(res.get("confidence", 0.0))
        for other in [0, 1, 2]:
            if other != idx:
                res2 = engine.verify_speaker(synth_wav_b64(freq=[150, 220, 300][other], seed=200 + other), cand, 0.5)
                if res2.get("speech_detected"):
                    impostor_scores.append(res2.get("confidence", 0.0))

    curve = []
    if genuine_scores and impostor_scores:
        for th in [x / 100 for x in range(10, 96, 5)]:
            frr = sum(1 for s in genuine_scores if s < th) / len(genuine_scores)
            far = sum(1 for s in impostor_scores if s >= th) / len(impostor_scores)
            curve.append({"threshold": th, "far": round(far, 4), "frr": round(frr, 4)})

    return {
        "voice_synthetic": {
            "status": "MEASURED" if (genuine_scores or impostor_scores) else "NOT MEASURED",
            "label": "SYNTHETIC PIPELINE CALIBRATION — NOT real-speaker FAR/FRR/EER",
            "synthetic_speakers": len(enrolled),
            "genuine_scores": len(genuine_scores),
            "impostor_scores": len(impostor_scores),
            "threshold_curve": curve,
            "note": "Real-speaker EER requires consenting speakers; see README ethics section.",
        }
    }


# ── 5. Performance (latency, synthetic inputs) ──────────────────────
def evaluate_performance():
    import cv2

    perf = {}
    n = 7

    try:
        from liveness_detection.mini_fasnet.anti_spoof import MiniFASNetAntiSpoof
        engine = MiniFASNetAntiSpoof(threshold=0.50)
        frame = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
        engine.analyze_frame(frame)  # warm-up
        times = []
        for _ in range(n):
            t0 = time.time()
            engine.analyze_frame(frame)
            times.append((time.time() - t0) * 1000)
        perf["liveness_pad"] = {"mean_ms": round(statistics.mean(times), 1), "p95_ms": round(sorted(times)[int(len(times) * 0.95) - 1], 1), "synthetic": True}
    except Exception as e:
        perf["liveness_pad"] = {"status": "NOT MEASURED", "reason": str(e)}

    try:
        from face_recognition.recognizer import FaceRecognizer
        rec = FaceRecognizer()
        probe = list_files("face/live", IMG_EXTS)
        if probe:
            emb = rec.extract_embedding(img_to_b64(probe[0]))
            if "embedding" in emb:
                gallery = [{"id": "x", "embedding": emb["embedding"]}]
                rec.verify(img_to_b64(probe[0]), gallery)  # warm-up
                times = []
                for _ in range(n):
                    t0 = time.time()
                    rec.verify(img_to_b64(probe[0]), gallery)
                    times.append((time.time() - t0) * 1000)
                perf["face_recognition"] = {"mean_ms": round(statistics.mean(times), 1), "p95_ms": round(sorted(times)[int(len(times) * 0.95) - 1], 1)}
        if "face_recognition" not in perf:
            perf["face_recognition"] = {"status": "NOT MEASURED", "reason": "No face image available."}
    except Exception as e:
        perf["face_recognition"] = {"status": "NOT MEASURED", "reason": str(e)}

    try:
        from voice_detection.speaker_recognition.voice_identity_engine import VoiceIdentityEngine
        ve = VoiceIdentityEngine()
        perf["voice_engine_loaded"] = {"model": ve.get_active_model()["model"]}
    except Exception as e:
        perf["voice_engine_loaded"] = {"status": "NOT MEASURED", "reason": str(e)}

    return {"performance": perf}


# ── Report assembly ─────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="TrueView AI Evaluation Harness")
    parser.add_argument("--face", action="store_true")
    parser.add_argument("--liveness", action="store_true")
    parser.add_argument("--voice", action="store_true")
    parser.add_argument("--blink", action="store_true")
    parser.add_argument("--alerts", action="store_true")
    parser.add_argument("--voice-synthetic", action="store_true")
    parser.add_argument("--perf", action="store_true")
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args()

    run_all = args.all or not any([args.face, args.liveness, args.voice, args.blink, args.alerts, args.voice_synthetic, args.perf])

    report = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "dataset": DATASET_DIR}
    if run_all or args.face:
        print("\n[Face Recognition]")
        report.update(evaluate_face())
    if run_all or args.liveness:
        print("\n[Liveness / PAD]")
        report.update(evaluate_liveness())
    if run_all or args.voice:
        print("\n[Voice Verification]")
        report.update(evaluate_voice())
    if run_all or args.blink:
        print("\n[Blink Detection]")
        report.update(evaluate_blink())
    if run_all or args.alerts:
        print("\n[Alert Engine]")
        report.update(evaluate_alerts())
    if run_all or args.voice_synthetic:
        print("\n[Voice Synthetic Calibration]")
        report.update(evaluate_voice_synthetic())
    if run_all or args.perf:
        print("\n[Performance]")
        report.update(evaluate_performance())

    out_path = os.path.join(RESULTS_DIR, "evaluation_report.json")
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2)

    print("\n" + "=" * 60)
    print(json.dumps(report, indent=2))
    print("=" * 60)
    print(f"Report written to {out_path}")
    print("NOTE: Accuracy values describe THIS local dataset only. Empty categories = NOT MEASURED.")


if __name__ == "__main__":
    main()
