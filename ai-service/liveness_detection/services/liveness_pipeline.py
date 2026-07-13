import cv2
import numpy as np
import base64
import time
import os

from ..blink_detection.detector import BlinkDetector
from ..motion_analysis.detector import MotionDetector
from ..texture_analysis.detector import TextureDetector

class LivenessPipeline:
    """
    Orchestrates the full liveness detection pipeline.
    
    Pipeline:
        Frame → YuNet Face Detection → Blink Check → Motion Check → Texture Check → Decision
    
    Decision Logic:
        - blink_score: High if blinks detected within session window (proves live person)
        - motion_score: Moderate micro-motion expected (proves not a static photo)
        - texture_score: High = rich skin texture (proves not flat/printed/screen)
        - Final = weighted average of all three
        - Threshold: >= 45 → Real, < 45 → Fake
    """

    def __init__(self):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        yunet_path = os.path.join(base_dir, "..", "..", "face_detection", "models", "face_detection_yunet_2023mar.onnx")

        self.face_detector = cv2.FaceDetectorYN.create(
            model=yunet_path,
            config="",
            input_size=(320, 320),
            score_threshold=0.6,
            nms_threshold=0.3,
            top_k=5000
        )

        self.blink_detector = BlinkDetector()
        self.motion_detector = MotionDetector()
        self.texture_detector = TextureDetector()

        # Decision threshold
        self.liveness_threshold = 45.0

        # Weights for final score
        self.weights = {
            "blink": 0.35,
            "motion": 0.30,
            "texture": 0.35,
        }

    def check(self, image_data: str, session_id: str = "default") -> dict:
        """
        Full liveness check on a single base64-encoded frame.
        """
        start_time = time.time()

        # --- Decode Image ---
        if ',' in image_data:
            image_data = image_data.split(',')[1]

        try:
            img_bytes = base64.b64decode(image_data)
            np_arr = np.frombuffer(img_bytes, np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        except Exception:
            return {"error": "Failed to decode image data"}

        if frame is None:
            return {"error": "Failed to decode image into frame"}

        h, w = frame.shape[:2]
        self.face_detector.setInputSize((w, h))

        # --- Detect Face ---
        _, faces = self.face_detector.detect(frame)

        if faces is None or len(faces) == 0:
            return {
                "error": "no_face",
                "liveness": "Unknown",
                "confidence": 0.0,
                "detail": "No face detected in the frame."
            }

        if len(faces) > 1:
            return {
                "error": "multiple_faces",
                "liveness": "Unknown",
                "confidence": 0.0,
                "detail": "Multiple faces detected. Please ensure only one face is in frame."
            }

        face = faces[0]
        face_box = {
            "x": int(face[0]),
            "y": int(face[1]),
            "width": int(face[2]),
            "height": int(face[3])
        }

        # --- Run Sub-Modules ---

        # 1. Blink Detection
        blink_result = self.blink_detector.process(session_id, frame, face)

        # 2. Motion Analysis
        motion_result = self.motion_detector.process(session_id, frame, face_box, face)

        # 3. Texture Analysis
        texture_result = self.texture_detector.process(frame, face_box)

        # --- Decision Logic ---
        # Blink score: scale blink_count into a 0-100 range
        # 2+ blinks in a session is strong evidence of liveness
        blink_count = blink_result.get("blink_count", 0)
        blink_score = min(100.0, blink_count * 40.0)  # 1 blink = 40, 2 = 80, 3+ = 100

        # Motion score: micro-movement expected. Scale motion_score into 0-100.
        raw_motion = motion_result.get("motion_score", 0.0)
        landmark_drift = motion_result.get("landmark_drift", 0.0)
        # motion_score of 1-5 is typical for a live person; <0.5 is suspicious (static)
        motion_norm = min(100.0, raw_motion * 20.0) if raw_motion > 0.3 else max(0.0, raw_motion * 10.0)
        # Bonus for landmark movement
        drift_bonus = min(30.0, landmark_drift * 5.0) if landmark_drift > 0.5 else 0.0
        motion_score_final = min(100.0, motion_norm + drift_bonus)

        # Texture score: directly from texture detector (already 0-100)
        texture_score = texture_result.get("texture_score", 0.0)

        # Weighted final score
        final_score = (
            self.weights["blink"] * blink_score +
            self.weights["motion"] * motion_score_final +
            self.weights["texture"] * texture_score
        )
        final_score = min(100.0, max(0.0, final_score))

        is_live = final_score >= self.liveness_threshold
        
        processing_time_ms = int((time.time() - start_time) * 1000)

        return {
            "liveness": "Real" if is_live else "Fake",
            "confidence": round(final_score, 2),
            "is_live": is_live,
            "blink_count": blink_count,
            "blink_score": round(blink_score, 2),
            "eye_closed": blink_result.get("eye_closed", False),
            "motion_score": round(motion_score_final, 2),
            "raw_motion": round(raw_motion, 4),
            "landmark_drift": round(landmark_drift, 4),
            "texture_score": round(texture_score, 2),
            "fft_energy": texture_result.get("fft_energy", 0.0),
            "lbp_variance": texture_result.get("lbp_variance", 0.0),
            "laplacian_variance": texture_result.get("laplacian_variance", 0.0),
            "processing_time_ms": processing_time_ms,
        }
