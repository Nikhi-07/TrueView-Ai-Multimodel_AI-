"""
Pose Estimator – TrueView AI

Performs 3D head pose estimation from 2D facial landmarks using Perspective-n-Point (PnP).
Extracts Nose Tip, Chin, Left/Right Eye Corners, and Left/Right Mouth Corners,
defines the camera calibration matrix, and estimates rotation (rvec) and translation (tvec) vectors.
"""

import cv2
import numpy as np
from ..utils.constants import (
    LANDMARK_INDEX_NOSE_TIP,
    LANDMARK_INDEX_CHIN,
    LANDMARK_INDEX_LEFT_EYE,
    LANDMARK_INDEX_RIGHT_EYE,
    LANDMARK_INDEX_LEFT_MOUTH,
    LANDMARK_INDEX_RIGHT_MOUTH,
    FACE_3D_MODEL_POINTS
)

class PoseEstimator:
    """
    Estimates translation and rotation vectors using cv2.solvePnP.
    """
    
    def estimate_pose(self, landmarks: list, img_w: int, img_h: int) -> dict:
        """
        Estimate rotation and translation vectors from 68-point landmarks.
        
        Args:
            landmarks: List of landmark dicts [{"id": int, "x": float, "y": float}, ...]
            img_w: Width of image/frame
            img_h: Height of image/frame
            
        Returns:
            dict containing:
                "success": bool,
                "rvec": np.ndarray (rotation vector),
                "tvec": np.ndarray (translation vector),
                "camera_matrix": np.ndarray,
                "dist_coeffs": np.ndarray,
                "reference_points_2d": list of extracted coordinates for drawing
        """
        if not landmarks or len(landmarks) < 55:
            return {"success": False, "error": "Insufficient landmarks"}
            
        # Build quick map
        point_map = {lm["id"]: (float(lm["x"]), float(lm["y"])) for lm in landmarks}
        
        # Verify required key points exist
        required_indices = [
            LANDMARK_INDEX_NOSE_TIP,
            LANDMARK_INDEX_CHIN,
            LANDMARK_INDEX_RIGHT_EYE,
            LANDMARK_INDEX_LEFT_EYE,
            LANDMARK_INDEX_RIGHT_MOUTH,
            LANDMARK_INDEX_LEFT_MOUTH
        ]
        
        for idx in required_indices:
            if idx not in point_map:
                return {"success": False, "error": f"Required landmark {idx} missing"}
                
        # Define 2D image points from key landmarks
        image_points = np.array([
            point_map[LANDMARK_INDEX_NOSE_TIP],
            point_map[LANDMARK_INDEX_CHIN],
            point_map[LANDMARK_INDEX_RIGHT_EYE],
            point_map[LANDMARK_INDEX_LEFT_EYE],
            point_map[LANDMARK_INDEX_RIGHT_MOUTH],
            point_map[LANDMARK_INDEX_LEFT_MOUTH]
        ], dtype=np.float64)
        
        # Approximate Camera Matrix (assuming focal length ≈ image width, center ≈ image center)
        focal_length = img_w
        center = (img_w / 2.0, img_h / 2.0)
        camera_matrix = np.array([
            [focal_length, 0, center[0]],
            [0, focal_length, center[1]],
            [0, 0, 1]
        ], dtype=np.float64)
        
        # Distortion coefficients (assume zero lens distortion)
        dist_coeffs = np.zeros((4, 1))
        
        # Solve PnP
        success, rvec, tvec = cv2.solvePnP(
            FACE_3D_MODEL_POINTS, 
            image_points, 
            camera_matrix, 
            dist_coeffs, 
            flags=cv2.SOLVEPNP_ITERATIVE
        )
        
        if not success:
            return {"success": False, "error": "solvePnP failed"}
            
        return {
            "success": True,
            "rvec": rvec,
            "tvec": tvec,
            "camera_matrix": camera_matrix,
            "dist_coeffs": dist_coeffs,
            "reference_points_2d": image_points.tolist()
        }
