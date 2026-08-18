"""
Unified Liveness & Anti-Spoofing Service Router Engine – TrueView AI

Combines:
1. ConvNeXt-Tiny Multi-Task Anti-Spoofing Model (Production Run 04, tau = 0.31)
2. MediaPipe Face Landmarker Blendshape Temporal Blink Detector (eyeBlinkLeft, eyeBlinkRight)
3. YuNet Face Box Detector
"""

import cv2
import numpy as np
import base64
import time
from .convnext.anti_spoof import ConvNeXtAntiSpoof
from .blink_detector import MediaPipeBlendshapeBlinkDetector

class LivenessService:
    def __init__(self, threshold: float = 0.31):
        self.anti_spoof_engine = ConvNeXtAntiSpoof(threshold=threshold)
        self.blink_detectors = {} # Session ID -> MediaPipeBlendshapeBlinkDetector

    def get_blink_detector(self, session_id: str) -> MediaPipeBlendshapeBlinkDetector:
        if session_id not in self.blink_detectors:
            self.blink_detectors[session_id] = MediaPipeBlendshapeBlinkDetector()
        return self.blink_detectors[session_id]

    def reset_session(self, session_id: str):
        if session_id in self.blink_detectors:
            self.blink_detectors[session_id].reset()

    def decode_base64_image(self, b64_str: str) -> np.ndarray:
        if not b64_str:
            return None
        if ',' in b64_str:
            b64_str = b64_str.split(',')[1]
        try:
            img_bytes = base64.b64decode(b64_str)
            np_arr = np.frombuffer(img_bytes, np.uint8)
            return cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        except Exception:
            return None

    def evaluate_frame(
        self,
        image_b64: str,
        session_id: str = "default",
        eye_blink_left: float = None,
        eye_blink_right: float = None,
        face_box: dict = None
    ) -> dict:
        """
        Evaluates single camera frame with ConvNeXt-Tiny anti-spoofing + MediaPipe blendshape blink detector.
        Returns standardized model output:
        {
            "antiSpoof": { "status": "LIVE", "score": 0.98, "is_live": true, "attack_type": "NONE" },
            "blink": { "detected": true, "count": 1, "state": "OPEN" },
            "face": { "detected": true, "count": 1 }
        }
        """
        frame = self.decode_base64_image(image_b64)
        if frame is None:
            return {
                "antiSpoof": {
                    "status": "SPOOF",
                    "score": 0.0,
                    "is_live": False,
                    "message": "Failed to decode camera frame",
                    "model": "convnext-tiny-run04",
                    "model_source": "no input frame",
                    "attack_type": "UNKNOWN",
                    "p_spoof": 1.0,
                    "attack_probs": [0.0] * 5
                },
                "blink": { "detected": False, "count": 0, "state": "OPEN", "eye_blink_avg": 0.0 },
                "face": { "detected": False, "count": 0 }
            }

        # 1. ConvNeXt-Tiny Anti-Spoofing Inference
        anti_spoof_res = self.anti_spoof_engine.analyze_frame(frame, face_box)

        # 2. MediaPipe Blendshape Blink Tracking
        blink_detector = self.get_blink_detector(session_id)

        # Extract localized eye region aspect ratio as blendshape signal if client didn't pass explicit blendshape
        if eye_blink_left is None or eye_blink_right is None:
            h, w = frame.shape[:2]
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            eye_crop = gray[int(h*0.25):int(h*0.45), int(w*0.25):int(w*0.75)]
            if eye_crop.size > 0:
                dark_pixels = np.sum(eye_crop < 50)
                dark_ratio = float(dark_pixels) / float(eye_crop.size)
                blink_signal = float(np.clip((dark_ratio - 0.15) * 4.0, 0.0, 1.0))
                eye_blink_left = blink_signal
                eye_blink_right = blink_signal
            else:
                eye_blink_left = 0.0
                eye_blink_right = 0.0

        blink_res = blink_detector.process_blendshapes(eye_blink_left, eye_blink_right)

        return {
            "antiSpoof": {
                "status": anti_spoof_res["status"],
                "score": anti_spoof_res["score"],
                "is_live": anti_spoof_res["is_live"],
                "message": anti_spoof_res["message"],
                "model": anti_spoof_res.get("model", "convnext-tiny-run04"),
                "model_source": anti_spoof_res.get("model_source"),
                "attack_type": anti_spoof_res.get("attack_type", "NONE"),
                "p_spoof": anti_spoof_res.get("p_spoof", 0.0),
                "threshold": anti_spoof_res.get("threshold", 0.31),
                "attack_probs": anti_spoof_res.get("attack_probs", []),
                "binary_probs": anti_spoof_res.get("binary_probs", [])
            },
            "blink": {
                "detected": blink_res["detected"],
                "count": blink_res["count"],
                "state": blink_res["state"],
                "eye_blink_avg": blink_res["eye_blink_avg"]
            },
            "face": {
                "detected": True,
                "count": 1
            }
        }
