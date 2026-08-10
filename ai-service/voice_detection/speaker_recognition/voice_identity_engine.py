"""
Voice Identity Engine – TrueView AI

Unified speaker embedding / verification service.

Model selection (deterministic, honest):
  1. ECAPA-TDNN (SpeechBrain, pretrained on VoxCeleb)  -> 192-D embeddings
     used automatically when speechbrain + torchaudio are installed and the
     checkpoint is reachable.
  2. Custom lightweight acoustic extractor (MFCC + pitch + formant statistics)
     -> 128-D embeddings. This is a proprietary acoustic signature vector and is
     NEVER presented as ECAPA-TDNN.

The engine that produced a stored embedding is inferred from its dimensionality
(192 -> ecapa-tdnn, otherwise custom-acoustic-vector), so old registrations keep
verifying with the correct backend.
"""

import numpy as np

from voice_detection.speaker_recognition.speaker_recognizer import SpeakerRecognizer
from voice_detection.speaker_recognition.ecapa_recognizer import ECAPASpeakerRecognizer

MODEL_ECAPA = "ecapa-tdnn"
MODEL_CUSTOM = "custom-acoustic-vector"


class VoiceIdentityEngine:
    def __init__(self):
        self.custom = SpeakerRecognizer()
        self.ecapa = ECAPASpeakerRecognizer()
        self.preferred_model = MODEL_ECAPA if self.ecapa.available else MODEL_CUSTOM

    def get_active_model(self) -> dict:
        return {
            "model": self.preferred_model,
            "ecapa_available": self.ecapa.available,
            "embedding_dim": self.ecapa.EMBEDDING_DIM if self.ecapa.available else self.custom.embedding_dim,
        }

    # ── Helpers ──────────────────────────────────────────────────────
    def decode_audio(self, audio_data: str):
        """Reuse the shared custom decoder instance (single decode path)."""
        return self.custom.decode_audio(audio_data)

    @staticmethod
    def _infer_model(candidate: list) -> str:
        if candidate is not None and len(candidate) == ECAPASpeakerRecognizer.EMBEDDING_DIM:
            return MODEL_ECAPA
        return MODEL_CUSTOM

    # ── Extraction ───────────────────────────────────────────────────
    def extract_speaker_embedding(self, audio_data: str) -> dict:
        """Extract a speaker embedding using the preferred model."""
        samples, sr = self.decode_audio(audio_data)
        duration_sec = len(samples) / float(sr) if sr > 0 else 0.0

        if len(samples) < 1600:
            return {
                "embedding": [],
                "speech_detected": False,
                "quality": "Insufficient Audio Length",
                "duration_sec": round(duration_sec, 2),
                "model": self.preferred_model,
            }

        # Speech-presence gate (shared acoustic check)
        gate = self.custom.extract_speaker_embedding(audio_data)
        speech_detected = bool(gate.get("speech_detected", False))
        quality = gate.get("quality", "Good Speech Quality")

        if not speech_detected:
            return {
                "embedding": [],
                "speech_detected": False,
                "quality": quality,
                "duration_sec": round(duration_sec, 2),
                "model": self.preferred_model,
            }

        if self.preferred_model == MODEL_ECAPA:
            emb = self.ecapa.extract_embedding(samples)
            if emb is None:
                return {
                    "embedding": [],
                    "speech_detected": False,
                    "quality": "ECAPA-TDNN extraction failed",
                    "duration_sec": round(duration_sec, 2),
                    "model": MODEL_ECAPA,
                }
            return {
                "embedding": emb,
                "speech_detected": True,
                "f0_median": gate.get("f0_median", 0.0),
                "quality": quality,
                "duration_sec": round(duration_sec, 2),
                "volume_rms": gate.get("volume_rms", 0.0),
                "samples_count": len(samples),
                "model": MODEL_ECAPA,
                "embedding_dim": len(emb),
            }

        # Custom fallback
        custom_res = self.custom.extract_speaker_embedding(audio_data)
        if not custom_res.get("speech_detected") or not custom_res.get("embedding"):
            custom_res["model"] = MODEL_CUSTOM
            return custom_res
        custom_res["model"] = MODEL_CUSTOM
        custom_res["embedding_dim"] = len(custom_res["embedding"])
        return custom_res

    # ── Multiple speaker detection ───────────────────────────────────
    def analyze_speakers(self, audio_data: str, min_window_ms: int = 800, cluster_threshold: float = 0.70) -> dict:
        """
        Segment a recording into speech windows, embed each window, and cluster
        the embeddings to detect whether more than one distinct speaker is
        present. This is a conservative heuristic (not a gold-standard diarizer):
        it reports evidence, never accusations.

        Returns:
            {
                speech_detected: bool,
                segments: int,            # number of speech windows analyzed
                speaker_count: int,       # estimated distinct clusters
                multiple_speakers: bool,
                confidence: float,        # 0..1 cluster separation confidence
                model: str,
                message: str,
            }
        """
        samples, sr = self.decode_audio(audio_data)
        if sr <= 0 or len(samples) < 1600:
            return {
                "speech_detected": False,
                "segments": 0,
                "speaker_count": 1,
                "multiple_speakers": False,
                "confidence": 0.0,
                "model": self.preferred_model,
                "message": "Insufficient audio to analyze speakers.",
            }

        # Gate on the shared acoustic speech check first (no speech -> no analysis)
        gate = self.custom.extract_speaker_embedding(audio_data)
        if not gate.get("speech_detected", False):
            return {
                "speech_detected": False,
                "segments": 0,
                "speaker_count": 1,
                "multiple_speakers": False,
                "confidence": 0.0,
                "model": self.preferred_model,
                "quality": gate.get("quality", "No Speech Detected"),
                "message": "No clear speech detected; speaker analysis skipped.",
            }

        import numpy as np

        arr = np.asarray(samples, dtype=np.float32)
        window_len = int(sr * min_window_ms / 1000.0)
        embeddings = []
        energies = []

        # Speech windows with a simple energy gate
        for start in range(0, len(arr) - window_len + 1, window_len // 2):
            win = arr[start : start + window_len]
            rms = float(np.sqrt(np.mean(win ** 2)))
            if rms < 0.01:  # silence / near-silence window
                continue
            emb = None
            if self.preferred_model == MODEL_ECAPA and self.ecapa.available:
                emb = self.ecapa.extract_embedding(win)
            if emb is None:
                res = self.custom.extract_speaker_embedding_from_samples(win) if hasattr(self.custom, "extract_speaker_embedding_from_samples") else None
                emb = res
            if emb is None or len(emb) == 0:
                continue
            embeddings.append((start / float(sr), emb))
            energies.append(rms)

        if len(embeddings) < 2:
            return {
                "speech_detected": True,
                "segments": len(embeddings),
                "speaker_count": 1,
                "multiple_speakers": False,
                "confidence": 0.0,
                "model": self.preferred_model,
                "message": "Insufficient distinct speech windows to evaluate multiple speakers.",
            }

        def _cos(a, b):
            a, b = np.asarray(a, dtype=np.float32), np.asarray(b, dtype=np.float32)
            na, nb = float(np.linalg.norm(a)), float(np.linalg.norm(b))
            if na < 1e-6 or nb < 1e-6:
                return 0.0
            return float(np.dot(a, b) / (na * nb))

        # Greedy agglomerative clustering by cosine similarity
        clusters = []  # list of {centroid: np.ndarray, count: int, members: [emb]}
        for _, emb in embeddings:
            best_idx = -1
            best_sim = -1.0
            for i, c in enumerate(clusters):
                sim = _cos(emb, c["centroid"])
                if sim > best_sim:
                    best_sim = sim
                    best_idx = i
            if best_idx >= 0 and best_sim >= cluster_threshold:
                c = clusters[best_idx]
                c["members"].append(np.asarray(emb, dtype=np.float32))
                c["centroid"] = np.mean(c["members"], axis=0)
                c["count"] += 1
            else:
                clusters.append({"centroid": np.asarray(emb, dtype=np.float32), "count": 1, "members": [np.asarray(emb, dtype=np.float32)]})

        clusters = [c for c in clusters if c["count"] >= 1]
        speaker_count = len(clusters)
        multiple = speaker_count >= 2

        # Confidence = separation between the two largest clusters
        confidence = 0.0
        if speaker_count >= 2:
            sizes = sorted([c["count"] for c in clusters], reverse=True)
            top2 = [c for c in clusters if c["count"] == sizes[0] or c["count"] == sizes[1]][:2]
            if len(top2) == 2:
                intra = float(np.mean([_cos(c["centroid"], m) for c in top2 for m in c["members"]]))
                inter = _cos(top2[0]["centroid"], top2[1]["centroid"])
                confidence = round(max(0.0, min(1.0, (1.0 - inter) + intra * 0.25)), 3)

        return {
            "speech_detected": True,
            "segments": len(embeddings),
            "speaker_count": speaker_count,
            "multiple_speakers": multiple,
            "confidence": confidence,
            "model": self.preferred_model,
            "message": "Multiple distinct speakers detected in the monitored audio." if multiple
                       else "Single consistent speaker detected in the monitored audio.",
        }

    # ── Verification ─────────────────────────────────────────────────
    def verify_speaker(self, audio_data: str, candidate_embedding: list, threshold: float = 0.75) -> dict:
        """Verify audio against a stored candidate embedding using the backend
        that produced it (inferred from embedding dimensionality)."""
        target_model = self._infer_model(candidate_embedding)

        if target_model == MODEL_ECAPA:
            if not self.ecapa.available:
                return {
                    "verified": False,
                    "confidence": 0.0,
                    "threshold": threshold,
                    "speech_detected": False,
                    "message": "Registered voice profile uses ECAPA-TDNN but the ECAPA-TDNN engine is unavailable.",
                    "model": MODEL_ECAPA,
                }
            samples, sr = self.decode_audio(audio_data)
            result = self.ecapa.verify(samples, candidate_embedding, threshold)
            result["threshold"] = threshold
            return result

        # Custom backend
        result = self.custom.verify_speaker(audio_data, candidate_embedding, threshold)
        result["model"] = MODEL_CUSTOM
        return result
