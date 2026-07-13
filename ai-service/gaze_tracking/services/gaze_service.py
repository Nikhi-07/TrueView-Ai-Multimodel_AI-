"""
Eye Gaze Service – TrueView AI

Orchestrator that ties the complete eye gaze tracking pipeline together:
    1. Decode base64 frame
    2. Extract 68-point face landmarks (via Phase 7 LandmarkExtractor)
    3. Extract eye landmark contours
    4. Detect iris center & relative position
    5. Estimate gaze direction
    6. Analyze attention status
    7. Draw visualizations
    8. Return structured JSON response

This service is the single entry point consumed by the FastAPI router.
"""

import time
import cv2
import numpy as np
import base64

from face_mesh.landmarks.extractor import LandmarkExtractor
from ..eye_gaze.eye_landmark_extractor import EyeLandmarkExtractor
from ..iris_detection.iris_detector import IrisDetector
from ..eye_gaze.gaze_estimator import GazeEstimator
from ..attention.attention_analyzer import AttentionAnalyzer
from ..services.gaze_visualizer import GazeVisualizer


class EyeGazeService:
    """
    Production-ready eye gaze tracking pipeline orchestrator.

    Maintains a per-instance AttentionAnalyzer for stateful tracking
    across frames within a session.
    """

    def __init__(self):
        self.landmark_extractor = LandmarkExtractor()
        self.eye_extractor = EyeLandmarkExtractor()
        self.iris_detector = IrisDetector()
        self.gaze_estimator = GazeEstimator()
        self.attention_analyzer = AttentionAnalyzer()
        self.visualizer = GazeVisualizer()

    def process_frame(self, image_data: str, draw_overlay: bool = True) -> dict:
        """
        Process a single base64-encoded camera frame through the full pipeline.

        Args:
            image_data: Base64-encoded image (with or without data URI prefix).
            draw_overlay: Whether to draw gaze visualization on the frame.

        Returns:
            dict with gaze_direction, attention_status, attention_score,
            confidence, annotated_image, processing_time_ms, and detailed metrics.
        """
        start_time = time.time()

        # ── Step 0: Decode base64 image ──
        frame = self._decode_image(image_data)
        if frame is None:
            return {"error": "Failed to decode image data"}

        # ── Step 1: Extract 68-point face landmarks ──
        landmark_result = self.landmark_extractor.extract(frame)

        if not landmark_result.get("face_detected"):
            processing_time_ms = int((time.time() - start_time) * 1000)
            # Reset attention when face is lost
            return {
                "face_detected": False,
                "error": landmark_result.get("error", "no_face"),
                "gaze_direction": None,
                "attention_status": None,
                "attention_score": 0,
                "confidence": 0,
                "processing_time_ms": processing_time_ms,
            }

        landmarks = landmark_result["landmarks"]

        # ── Step 2: Extract eye landmarks ──
        eye_data = self.eye_extractor.extract(landmarks)

        if not eye_data.get("success"):
            processing_time_ms = int((time.time() - start_time) * 1000)
            return {
                "face_detected": True,
                "error": eye_data.get("error", "eye_extraction_failed"),
                "gaze_direction": None,
                "attention_status": None,
                "attention_score": 0,
                "confidence": 0,
                "processing_time_ms": processing_time_ms,
            }

        # ── Step 3: Detect iris center & relative position ──
        iris_data = self.iris_detector.detect_both(
            eye_data["left_eye"],
            eye_data["right_eye"]
        )

        # ── Step 4: Estimate gaze direction ──
        gaze_result = self.gaze_estimator.estimate(iris_data["averaged_position"])

        # ── Step 5: Analyze attention ──
        attention_result = self.attention_analyzer.analyze(gaze_result)

        # ── Step 6: Draw visualizations ──
        annotated_image_b64 = None
        if draw_overlay:
            annotated_frame = self.visualizer.draw(
                frame, eye_data, iris_data, gaze_result, attention_result
            )
            _, buffer = cv2.imencode('.jpg', annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            annotated_image_b64 = "data:image/jpeg;base64," + base64.b64encode(buffer).decode('utf-8')

        processing_time_ms = int((time.time() - start_time) * 1000)

        # ── Build response ──
        return {
            "face_detected": True,
            "gaze_direction": gaze_result["gaze_direction"],
            "confidence": gaze_result["confidence"],
            "horizontal_offset": gaze_result["horizontal_offset"],
            "vertical_offset": gaze_result["vertical_offset"],
            "attention_status": attention_result["attention_status"],
            "attention_score": attention_result["attention_score"],
            "focus_duration_seconds": attention_result["focus_duration_seconds"],
            "is_currently_focused": attention_result["is_currently_focused"],
            "session_attention_pct": attention_result["session_attention_pct"],
            "frames_analyzed": attention_result["frames_analyzed"],
            "iris_data": {
                "left": iris_data["left_iris"]["iris_center"],
                "right": iris_data["right_iris"]["iris_center"],
                "averaged_position": iris_data["averaged_position"],
            },
            "annotated_image": annotated_image_b64,
            "processing_time_ms": processing_time_ms,
        }

    def reset_session(self):
        """Reset attention analyzer for a new tracking session."""
        self.attention_analyzer.reset()

    @staticmethod
    def _decode_image(image_data: str) -> np.ndarray | None:
        """Decode a base64 image string to an OpenCV BGR frame."""
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        try:
            img_bytes = base64.b64decode(image_data)
            np_arr = np.frombuffer(img_bytes, np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            return frame
        except Exception:
            return None
