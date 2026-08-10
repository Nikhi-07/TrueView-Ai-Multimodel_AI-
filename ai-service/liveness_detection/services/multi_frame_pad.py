"""
Multi-Frame Presentation Attack Detector (PAD) – TrueView AI

Integrates:
1. MiniFASNetV2 Anti-Spoofing Model (Printed Photo, Phone Screen, Monitor Display, Video Replay)
2. MediaPipe Face Landmarker Blendshape Temporal Blink Detector (eyeBlinkLeft, eyeBlinkRight)
"""

import cv2
import numpy as np
import base64
import time
import os
import random
from ..mini_fasnet.anti_spoof import MiniFASNetAntiSpoof
from ..blink_detector import MediaPipeBlendshapeBlinkDetector

class MultiFramePAD:
    def __init__(self, liveness_threshold: float = 0.50):
        self.liveness_threshold = liveness_threshold
        self.anti_spoof_engine = MiniFASNetAntiSpoof(threshold=liveness_threshold)
        
        base_dir = os.path.dirname(os.path.abspath(__file__))
        yunet_path = os.path.abspath(os.path.join(base_dir, "..", "..", "face_detection", "models", "face_detection_yunet_2023mar.onnx"))

        self.face_detector = cv2.FaceDetectorYN.create(
            model=yunet_path,
            config="",
            input_size=(320, 320),
            score_threshold=0.5,
            nms_threshold=0.3,
            top_k=5000
        )

    def generate_random_challenge(self) -> dict:
        challenges = [
            {"type": "BLINK", "instruction": "Blink naturally"},
            {"type": "LOOK_LEFT", "instruction": "Look directly at camera"},
            {"type": "LOOK_RIGHT", "instruction": "Look directly at camera"}
        ]
        chosen = random.choice(challenges)
        challenge_id = f"chal_{int(time.time()*1000)}_{random.randint(1000, 9999)}"
        return {
            "challenge_id": challenge_id,
            "challenge_type": chosen["type"],
            "instruction": chosen["instruction"],
            "expires_in_sec": 8
        }

    def decode_frame(self, image_data: str) -> np.ndarray:
        if not image_data:
            return None
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        try:
            img_bytes = base64.b64decode(image_data)
            np_arr = np.frombuffer(img_bytes, np.uint8)
            return cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        except Exception:
            return None

    def analyze_sequence(
        self,
        frames_b64: list[str],
        challenge_type: str = None,
        session_id: str = "default",
        eye_blink_left: list = None,
        eye_blink_right: list = None
    ) -> dict:
        """
        Analyze a temporal sequence of base64 frames for presentation attacks using MiniFASNetV2
        and MediaPipe blendshape blink detector (blendshape arrays are supplied by the client-side
        MediaPipe Face Landmarker when available).
        """
        start_time = time.time()

        if not frames_b64 or len(frames_b64) < 1:
            return {
                "status": "SPOOF",
                "livenessVerified": False,
                "reason": "insufficient_frames",
                "spoof_type": "INSUFFICIENT_FRAMES",
                "liveness_score": 0.0,
                "message": "Insufficient camera frames for anti-spoofing verification."
            }

        decoded_frames = []
        for b64_str in frames_b64:
            img = self.decode_frame(b64_str)
            if img is not None:
                decoded_frames.append(img)

        if len(decoded_frames) == 0:
            return {
                "status": "SPOOF",
                "livenessVerified": False,
                "reason": "frame_decoding_failed",
                "spoof_type": "DECODE_FAILED",
                "liveness_score": 0.0,
                "message": "Failed to decode camera frames for liveness verification."
            }

        anti_spoof_scores = []
        is_any_photo_spoof = False
        is_any_screen_spoof = False

        for frame in decoded_frames:
            res = self.anti_spoof_engine.analyze_frame(frame)
            score = res.get("score", 0.0)
            anti_spoof_scores.append(score)
            if res.get("status") == "SPOOF":
                msg_lower = res.get("message", "").lower()
                if "photo" in msg_lower or "paper" in msg_lower:
                    is_any_photo_spoof = True
                elif "screen" in msg_lower or "display" in msg_lower:
                    is_any_screen_spoof = True

        avg_anti_spoof_score = float(np.mean(anti_spoof_scores))
        is_live = bool(avg_anti_spoof_score >= self.liveness_threshold and not is_any_photo_spoof and not is_any_screen_spoof)

        # ── Temporal blink analysis from client MediaPipe blendshapes (supplementary, not the sole liveness signal) ──
        blink_stats = {"detected": False, "count": 0, "state": "OPEN"}
        try:
            if eye_blink_left and eye_blink_right and len(eye_blink_left) == len(eye_blink_right) and len(eye_blink_left) > 0:
                from ..blink_detector import MediaPipeBlendshapeBlinkDetector
                blink_detector = MediaPipeBlendshapeBlinkDetector()
                for bl, br in zip(eye_blink_left, eye_blink_right):
                    res = blink_detector.process_blendshapes(bl, br)
                    if res["detected"]:
                        blink_stats["detected"] = True
                blink_stats = {
                    "detected": blink_stats["detected"],
                    "count": blink_detector.blink_count,
                    "state": blink_detector.state
                }
        except Exception as e:
            print(f"[MultiFramePAD] Blink analysis skipped: {e}")

        spoof_type = "NONE"
        if not is_live:
            if is_any_photo_spoof:
                spoof_type = "PRINTED_PHOTO"
                message = "Presentation attack detected (Printed Photograph). Live human face required."
            elif is_any_screen_spoof:
                spoof_type = "PHONE_SCREEN"
                message = "Presentation attack detected (Phone / Monitor Display Replay). Live human face required."
            else:
                spoof_type = "SPOOF_ATTACK"
                message = "Face anti-spoofing verification failed. Presentation attack detected."
        else:
            message = "Face anti-spoofing verified successfully."

        processing_time_ms = int((time.time() - start_time) * 1000)

        return {
            "status": "LIVE" if is_live else "SPOOF",
            "livenessVerified": is_live,
            "spoof_type": spoof_type,
            "liveness_score": round(avg_anti_spoof_score, 4),
            "antiSpoof": {
                "status": "LIVE" if is_live else "SPOOF",
                "score": round(avg_anti_spoof_score, 4),
                "model": self.anti_spoof_engine.model_source or "unavailable"
            },
            "blink": blink_stats,
            "processing_time_ms": processing_time_ms,
            "message": message
        }
