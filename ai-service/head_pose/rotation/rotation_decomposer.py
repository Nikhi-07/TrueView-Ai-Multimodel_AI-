"""
Rotation Decomposer – TrueView AI

Decomposes the rotation vector (rvec) obtained from solvePnP into Euler angles (Pitch, Yaw, Roll)
representing head orientation in degrees.
Ensures consistent and calibrated sign mapping matching user/subject perspective.
"""

import cv2
import numpy as np

class RotationDecomposer:
    """
    Utility class to convert rotation vectors to degrees of Pitch, Yaw, and Roll.
    """
    
    @staticmethod
    def decompose(rvec: np.ndarray) -> tuple:
        """
        Decompose a 3D rotation vector into Pitch, Yaw, and Roll angles (in degrees).
        
        Args:
            rvec: Rotation vector (3x1 numpy array)
            
        Returns:
            Tuple (pitch, yaw, roll) in degrees where:
              - Pitch: Negative is looking Down, Positive is looking Up
              - Yaw: Negative is looking Left, Positive is looking Right
              - Roll: Negative is tilting Left, Positive is tilting Right
        """
        # Convert rotation vector to 3x3 rotation matrix
        rmat, _ = cv2.Rodrigues(rvec)
        
        # Decompose the rotation matrix to Euler angles (in degrees)
        # cv2.RQDecomp3x3 decomposes a 3x3 matrix into three rotation matrices
        # around X, Y, Z axes, and returns their respective angles in degrees.
        angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat)
        
        # Raw angles from decomposition
        raw_pitch = float(angles[0])
        raw_yaw = float(angles[1])
        raw_roll = float(angles[2])
        
        # Normalize and calibrate signs for standard proctoring orientation:
        # 1. Pitch: rqdecomp returns positive value when looking down, negate it so Looking Up is positive.
        pitch = -raw_pitch
        
        # 2. Yaw: rqdecomp returns positive when looking right (viewer perspective).
        # We align it to user's perspective: Looking Right is positive, Looking Left is negative.
        yaw = raw_yaw
        
        # 3. Roll: rqdecomp roll sign representation
        roll = raw_roll
        
        # Clamp values to avoid extreme spikes from solvePnP noise
        pitch = max(-90.0, min(90.0, pitch))
        yaw = max(-90.0, min(90.0, yaw))
        roll = max(-90.0, min(90.0, roll))
        
        return round(pitch, 2), round(yaw, 2), round(roll, 2)
