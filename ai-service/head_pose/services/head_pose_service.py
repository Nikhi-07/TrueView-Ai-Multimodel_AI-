"""
Head Pose Service – TrueView AI

Orchestrates the head pose estimation pipeline.
Chains: Image decoding -> Face Mesh Extraction -> Landmark Subset Parsing ->
solvePnP Pose Estimation -> Angle Decomposition -> Orientation Classification ->
Attention/Stability Analysis -> OpenCV Annotation -> JSON response.
"""

import time
import cv2
import numpy as np
import base64

from face_mesh.landmarks.extractor import LandmarkExtractor
from ..pose_estimation.pose_estimator import PoseEstimator
from ..rotation.rotation_decomposer import RotationDecomposer
from ..pose_estimation.orientation_classifier import OrientationClassifier
from ..services.pose_attention_analyzer import PoseAttentionAnalyzer
from ..services.pose_visualizer import PoseVisualizer

class HeadPoseService:
    """
    Service to orchestrate head pose tracking pipeline and manage session history state.
    """
    
    def __init__(self):
        self.landmark_extractor = LandmarkExtractor()
        self.pose_estimator = PoseEstimator()
        self.rotation_decomposer = RotationDecomposer()
        self.orientation_classifier = OrientationClassifier()
        self.attention_analyzer = PoseAttentionAnalyzer()
        self.visualizer = PoseVisualizer()
        
    def process_frame(self, image_data: str, draw_overlay: bool = True) -> dict:
        """
        Process a single base64 image frame through the head pose pipeline.
        
        Args:
            image_data: Base64 image data string (with or without data URI header)
            draw_overlay: True to draw 3D axis and visual guides
            
        Returns:
            dict containing pitch, yaw, roll, orientation, attention details,
            optional annotated base64 image, and latency metrics.
        """
        start_time = time.time()
        
        # 1. Decode Image
        frame = self._decode_image(image_data)
        if frame is None:
            return {"error": "Failed to decode image data"}
            
        h, w = frame.shape[:2]
        
        # 2. Extract 68-point landmarks
        landmark_result = self.landmark_extractor.extract(frame)
        if not landmark_result.get("face_detected"):
            processing_time_ms = int((time.time() - start_time) * 1000)
            return {
                "face_detected": False,
                "error": landmark_result.get("error", "no_face"),
                "pitch": 0.0,
                "yaw": 0.0,
                "roll": 0.0,
                "head_direction": "No Face Detected",
                "attention_status": "looking_away",
                "confidence": 0.0,
                "processing_time_ms": processing_time_ms
            }
            
        landmarks = landmark_result["landmarks"]
        
        # 3. Estimate Head Pose (solvePnP)
        pose_result = self.pose_estimator.estimate_pose(landmarks, w, h)
        if not pose_result.get("success"):
            processing_time_ms = int((time.time() - start_time) * 1000)
            return {
                "face_detected": True,
                "error": pose_result.get("error", "pose_estimation_failed"),
                "pitch": 0.0,
                "yaw": 0.0,
                "roll": 0.0,
                "head_direction": "Pose Error",
                "attention_status": "looking_away",
                "confidence": 0.0,
                "processing_time_ms": processing_time_ms
            }
            
        rvec = pose_result["rvec"]
        tvec = pose_result["tvec"]
        camera_matrix = pose_result["camera_matrix"]
        dist_coeffs = pose_result["dist_coeffs"]
        reference_points = pose_result["reference_points_2d"]
        
        # 4. Decompose angles to Euler format (Pitch, Yaw, Roll)
        pitch, yaw, roll = self.rotation_decomposer.decompose(rvec)
        
        # 5. Classify head orientation
        class_result = self.orientation_classifier.classify(pitch, yaw, roll)
        direction = class_result["direction"]
        is_straight = class_result["is_straight"]
        confidence = class_result["confidence"]
        
        # 6. Analyze Attention Status and Stability
        attention_result = self.attention_analyzer.analyze(pitch, yaw, roll, is_straight)
        
        # 7. Draw Visualizations
        annotated_image_b64 = None
        if draw_overlay:
            annotated_frame = self.visualizer.draw_pose(
                frame,
                rvec,
                tvec,
                camera_matrix,
                dist_coeffs,
                reference_points,
                pitch,
                yaw,
                roll,
                direction,
                attention_result
            )
            
            _, buffer = cv2.imencode('.jpg', annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            annotated_image_b64 = "data:image/jpeg;base64," + base64.b64encode(buffer).decode('utf-8')
            
        processing_time_ms = int((time.time() - start_time) * 1000)
        
        # 8. Return structured payload
        return {
            "face_detected": True,
            "pitch": pitch,
            "yaw": yaw,
            "roll": roll,
            "head_direction": direction,
            "confidence": confidence,
            "attention_status": attention_result["attention_status"],
            "screen_facing_ratio": attention_result["screen_facing_ratio"],
            "screen_facing_duration_seconds": attention_result["screen_facing_duration_seconds"],
            "head_stability": attention_result["head_stability"],
            "head_stability_value": attention_result["head_stability_value"],
            "movement_frequency_per_minute": attention_result["movement_frequency_per_minute"],
            "annotated_image": annotated_image_b64,
            "processing_time_ms": processing_time_ms
        }
        
    def reset_session(self):
        """Reset the internal rolling window tracking states."""
        self.attention_analyzer.reset()
        
    @staticmethod
    def _decode_image(image_data: str) -> np.ndarray | None:
        """Decode base64 string to BGR OpenCV image."""
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        try:
            img_bytes = base64.b64decode(image_data)
            np_arr = np.frombuffer(img_bytes, np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            return frame
        except Exception:
            return None
