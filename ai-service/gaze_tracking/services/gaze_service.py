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

from ..utils.constants import (
    EYE_CLOSED_THRESHOLD,
    MIN_FACE_CONFIDENCE,
    GazeDirection,
    EyeStatus,
    AttentionStatus,
    FocusState,
)
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

    def process_frame(self, image_data: str, draw_overlay: bool = True, eye_metrics: dict = None) -> dict:
        """
        Process a single base64-encoded camera frame through the full pipeline.
        Enforces strict evaluation of eye openness BEFORE gaze direction.

        Args:
            image_data: Base64-encoded image (with or without data URI prefix).
            draw_overlay: Whether to draw gaze visualization on the frame.
            eye_metrics: Optional dict with leftEAR, rightEAR, averageEAR, blendshapes from client.

        Returns:
            dict with gaze_direction, eye_status, attention_status, focus_state,
            attention_score, confidence, annotated_image, processing_time_ms, etc.
        """
        start_time = time.time()

        # ── Step 0: Decode base64 image ──
        frame = self._decode_image(image_data)
        if frame is None:
            return {"error": "Failed to decode image data"}

        # ── Step 1: Face Detection & Landmark Extraction ──
        landmark_result = self.landmark_extractor.extract(frame)
        face_detected = landmark_result.get("face_detected", False)
        face_confidence = float(landmark_result.get("confidence", 0.0))

        # Check client-supplied face detection/confidence if provided
        if eye_metrics:
            client_detected = eye_metrics.get("faceDetected")
            client_conf = float(eye_metrics.get("confidence", 1.0))
            if client_detected is False:
                face_detected = False
            elif client_detected is True and client_conf >= MIN_FACE_CONFIDENCE:
                face_detected = True
                face_confidence = max(face_confidence, client_conf)
            elif client_conf < MIN_FACE_CONFIDENCE:
                face_confidence = min(face_confidence, client_conf)

        if not face_detected or face_confidence < MIN_FACE_CONFIDENCE:
            processing_time_ms = int((time.time() - start_time) * 1000)
            attention_result = self.attention_analyzer.analyze({"face_detected": False})
            return {
                "face_detected": False,
                "error": landmark_result.get("error", "no_face") if not face_detected else "low_confidence",
                "eye_status": EyeStatus.UNKNOWN,
                "left_ear": 0.0,
                "right_ear": 0.0,
                "ear": 0.0,
                "gaze_direction": GazeDirection.UNKNOWN,
                "attention_status": attention_result["attention_status"],
                "focus_state": attention_result["focus_state"],
                "attention_score": attention_result["attention_score"],
                "focus_duration_seconds": attention_result["focus_duration_seconds"],
                "is_currently_focused": False,
                "confidence": round(face_confidence, 2),
                "processing_time_ms": processing_time_ms,
                "frames_analyzed": attention_result["frames_analyzed"],
            }

        landmarks = landmark_result.get("landmarks", [])

        # ── Step 2: Extract Eye Openness / EAR ──
        has_client_ear = (
            eye_metrics is not None and
            "leftEAR" in eye_metrics and
            "rightEAR" in eye_metrics and
            float(eye_metrics.get("leftEAR", 0)) > 0 and
            float(eye_metrics.get("rightEAR", 0)) > 0
        )

        eye_data = self.eye_extractor.extract(landmarks)

        if has_client_ear:
            left_ear = float(eye_metrics["leftEAR"])
            right_ear = float(eye_metrics["rightEAR"])
            average_ear = float(eye_metrics.get("averageEAR", (left_ear + right_ear) / 2.0))
            blendshapes = eye_metrics.get("blendshapes", {})
            blink_left = float(blendshapes.get("left", 0.0))
            blink_right = float(blendshapes.get("right", 0.0))
        elif eye_data.get("success"):
            left_ear = float(eye_data.get("left_ear", 0.30))
            right_ear = float(eye_data.get("right_ear", 0.30))
            average_ear = float(eye_data.get("average_ear", (left_ear + right_ear) / 2.0))
            blink_left = 0.0
            blink_right = 0.0
        else:
            left_ear = 0.30
            right_ear = 0.30
            average_ear = 0.30
            blink_left = 0.0
            blink_right = 0.0

        # ── Step 3: Check Eye Openness for BOTH Eyes (Section 4) ──
        left_closed = (left_ear <= EYE_CLOSED_THRESHOLD) or (blink_left >= 0.50)
        right_closed = (right_ear <= EYE_CLOSED_THRESHOLD) or (blink_right >= 0.50)

        if left_closed and right_closed:
            # Both eyes must be closed for EYES CLOSED
            eyes_closed = True
            eye_openness = EyeStatus.CLOSED
        elif left_closed or right_closed:
            # Only one eye closed -> PARTIALLY_CLOSED (e.g. wink or shadow)
            eyes_closed = False
            eye_openness = EyeStatus.PARTIALLY_CLOSED
        else:
            eyes_closed = False
            eye_openness = EyeStatus.OPEN

        # ── Step 4: Strict Pipeline Order (Section 6) ──
        # Evaluate eye openness BEFORE calculating gaze direction!
        if eyes_closed:
            # When eyes are closed, DO NOT calculate gaze direction or return CENTER!
            gaze_result = {
                "face_detected": True,
                "gaze_direction": GazeDirection.UNKNOWN,
                "confidence": 0.0,
                "horizontal_offset": 0.0,
                "vertical_offset": 0.0,
                "is_center": False,
                "eyes_closed": True,
                "eye_status": eye_openness,
                "ear": average_ear,
                "left_ear": left_ear,
                "right_ear": right_ear,
            }
            iris_data = {
                "left_iris": {
                    "iris_center": eye_data.get("left_eye", {}).get("center", {"x": 0.0, "y": 0.0}),
                    "relative_position": {"x": 0.5, "y": 0.5}
                },
                "right_iris": {
                    "iris_center": eye_data.get("right_eye", {}).get("center", {"x": 0.0, "y": 0.0}),
                    "relative_position": {"x": 0.5, "y": 0.5}
                },
                "averaged_position": {"x": 0.5, "y": 0.5}
            }
        else:
            # Eyes are open (or partially closed): detect iris & estimate gaze direction
            if eye_data.get("success"):
                iris_data = self.iris_detector.detect_both(
                    eye_data["left_eye"],
                    eye_data["right_eye"],
                    frame=frame
                )
                gaze_result = self.gaze_estimator.estimate(iris_data["averaged_position"])
            else:
                iris_data = {
                    "left_iris": {"iris_center": {"x": 0.0, "y": 0.0}, "relative_position": {"x": 0.5, "y": 0.5}},
                    "right_iris": {"iris_center": {"x": 0.0, "y": 0.0}, "relative_position": {"x": 0.5, "y": 0.5}},
                    "averaged_position": {"x": 0.5, "y": 0.5}
                }
                client_gaze = eye_metrics.get("gazeDirection") if eye_metrics else None
                gaze_dir = client_gaze if client_gaze in [
                    GazeDirection.LEFT, GazeDirection.RIGHT, GazeDirection.UP, GazeDirection.DOWN, GazeDirection.CENTER
                ] else GazeDirection.CENTER
                gaze_result = {
                    "gaze_direction": gaze_dir,
                    "confidence": 0.85,
                    "horizontal_offset": -0.35 if gaze_dir == GazeDirection.LEFT else (0.35 if gaze_dir == GazeDirection.RIGHT else 0.0),
                    "vertical_offset": -0.35 if gaze_dir == GazeDirection.UP else (0.35 if gaze_dir == GazeDirection.DOWN else 0.0),
                    "is_center": (gaze_dir == GazeDirection.CENTER),
                }

            gaze_result["face_detected"] = True
            gaze_result["eyes_closed"] = False
            gaze_result["eye_status"] = eye_openness
            gaze_result["ear"] = average_ear
            gaze_result["left_ear"] = left_ear
            gaze_result["right_ear"] = right_ear
            if eye_openness == EyeStatus.PARTIALLY_CLOSED:
                gaze_result["confidence"] = round(gaze_result["confidence"] * 0.75, 2)

        # ── Step 5: Analyze attention (handles blinks vs prolonged closure) ──
        attention_result = self.attention_analyzer.analyze(gaze_result)

        # ── Step 6: Debug Logging (Section 14) ──
        print(
            f"[EyeGaze] leftEAR: {left_ear:.2f} rightEAR: {right_ear:.2f} "
            f"averageEAR: {average_ear:.2f} threshold: {EYE_CLOSED_THRESHOLD:.2f} "
            f"eyeStatus: {attention_result['eye_status']} "
            f"gaze: {attention_result['gaze_direction']} "
            f"attention: {int(attention_result['attention_score'])}"
        )

        # ── Step 7: Draw visualizations ──
        annotated_image_b64 = None
        if draw_overlay and eye_data.get("success"):
            annotated_frame = self.visualizer.draw(
                frame, eye_data, iris_data, gaze_result, attention_result
            )
            _, buffer = cv2.imencode('.jpg', annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            annotated_image_b64 = "data:image/jpeg;base64," + base64.b64encode(buffer).decode('utf-8')

        processing_time_ms = int((time.time() - start_time) * 1000)

        # ── Step 8: Build structured response ──
        return {
            "face_detected": True,
            "eye_status": attention_result["eye_status"],
            "left_ear": round(left_ear, 4),
            "right_ear": round(right_ear, 4),
            "ear": round(average_ear, 4),
            "gaze_direction": attention_result["gaze_direction"],
            "confidence": gaze_result["confidence"],
            "horizontal_offset": gaze_result.get("horizontal_offset", 0.0),
            "vertical_offset": gaze_result.get("vertical_offset", 0.0),
            "attention_status": attention_result["attention_status"],
            "focus_state": attention_result["focus_state"],
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
