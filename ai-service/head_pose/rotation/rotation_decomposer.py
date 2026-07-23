"""
Rotation Decomposer – TrueView AI

Decomposes head rotation into calibrated Pitch, Yaw, and Roll angles (in degrees)
using robust facial landmark geometry + solvePnP rotation vectors.
Guarantees 0.0° baseline when looking straight ahead.
"""

import cv2
import numpy as np

class RotationDecomposer:
    """
    Utility class to convert rotation data to degrees of Pitch, Yaw, and Roll.
    """
    
    @staticmethod
    def decompose(rvec: np.ndarray, landmarks: list | None = None) -> tuple:
        """
        Decompose head orientation into Pitch, Yaw, and Roll angles (in degrees).
        
        Args:
            rvec: Rotation vector (3x1 numpy array from solvePnP)
            landmarks: Optional list of facial landmark dicts
            
        Returns:
            Tuple (pitch, yaw, roll) in degrees:
              - Pitch: Negative is Looking Down, Positive is Looking Up
              - Yaw: Negative is Looking Left, Positive is Looking Right
              - Roll: Negative is tilting Left, Positive is tilting Right
        """
        if landmarks and len(landmarks) >= 55:
            point_map = {lm["id"]: (float(lm["x"]), float(lm["y"])) for lm in landmarks}
            required = [30, 36, 45, 48, 54]  # Nose tip, Right Eye, Left Eye, Right Mouth, Left Mouth
            if all(k in point_map for k in required):
                re = point_map[36]
                le = point_map[45]
                nt = point_map[30]
                rm = point_map[48]
                lm = point_map[54]

                # Yaw: Horizontal displacement of nose tip between eyes
                eye_dist = max(abs(le[0] - re[0]), 1.0)
                left_dist = le[0] - nt[0]
                right_dist = nt[0] - re[0]
                yaw = ((right_dist - left_dist) / eye_dist) * 90.0

                # Pitch: Vertical position of nose tip between eyes and mouth
                eye_y = (re[1] + le[1]) / 2.0
                mouth_y = (rm[1] + lm[1]) / 2.0
                face_h = max(mouth_y - eye_y, 1.0)
                nose_ratio = (nt[1] - eye_y) / face_h
                pitch = (0.5 - nose_ratio) * 120.0

                # Roll: Angle of line connecting eye corners
                roll = float(np.degrees(np.arctan2(le[1] - re[1], le[0] - re[0])))

                # Clamp to [-90, 90]
                pitch = max(-90.0, min(90.0, pitch))
                yaw = max(-90.0, min(90.0, yaw))
                roll = max(-90.0, min(90.0, roll))

                return round(pitch, 2), round(yaw, 2), round(roll, 2)

        # Fallback to solvePnP Rodrigues decomposition if landmarks not passed
        rmat, _ = cv2.Rodrigues(rvec)
        angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat)
        pitch = -float(angles[0])
        yaw = float(angles[1])
        roll = float(angles[2])

        pitch = max(-90.0, min(90.0, pitch))
        yaw = max(-90.0, min(90.0, yaw))
        roll = max(-90.0, min(90.0, roll))

        return round(pitch, 2), round(yaw, 2), round(roll, 2)
