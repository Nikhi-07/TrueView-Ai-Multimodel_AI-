"""
Orientation Classifier – TrueView AI

Classifies 3D head pose angles (Pitch, Yaw, Roll) into discrete directional orientations.
Detects looking left, looking right, looking up, looking down, tilting, and looking straight.
Returns orientation state along with orientation confidence score.
"""

from ..utils.constants import (
    THRESHOLD_YAW_LEFT,
    THRESHOLD_YAW_RIGHT,
    THRESHOLD_PITCH_UP,
    THRESHOLD_PITCH_DOWN,
    THRESHOLD_ROLL_TILT
)

class OrientationClassifier:
    """
    Classifies Pitch, Yaw, and Roll angles into discrete orientation classes.
    """
    
    @staticmethod
    def classify(pitch: float, yaw: float, roll: float) -> dict:
        """
        Classify head orientation based on Pitch, Yaw, and Roll thresholds.
        
        Args:
            pitch: Pitch angle in degrees
            yaw: Yaw angle in degrees
            roll: Roll angle in degrees
            
        Returns:
            dict containing:
                "direction": str (e.g., "Looking Straight", "Looking Left"),
                "is_straight": bool,
                "confidence": float (0.0 to 1.0)
        """
        direction = "Looking Straight"
        is_straight = True
        
        # Check Yaw (Horizontal Turn)
        if yaw < THRESHOLD_YAW_LEFT:
            direction = "Looking Left"
            is_straight = False
        elif yaw > THRESHOLD_YAW_RIGHT:
            direction = "Looking Right"
            is_straight = False
            
        # Check Pitch (Vertical Angle)
        # Note: Vertical turn overrides horizontal if it has a greater absolute magnitude
        if pitch > THRESHOLD_PITCH_UP:
            if is_straight or abs(pitch) > abs(yaw):
                direction = "Looking Up"
                is_straight = False
        elif pitch < THRESHOLD_PITCH_DOWN:
            if is_straight or abs(pitch) > abs(yaw):
                direction = "Looking Down"
                is_straight = False
                
        # Check Roll (Head Tilt)
        # Tilted state if roll is extreme and not already heavily looking away
        if is_straight and abs(roll) > THRESHOLD_ROLL_TILT:
            direction = "Head Tilt"
            is_straight = False
            
        # Compute confidence score
        # Confidence is higher when the angles are not near thresholds (more stable classification)
        confidence = OrientationClassifier._compute_confidence(pitch, yaw, roll, is_straight)
        
        return {
            "direction": direction,
            "is_straight": is_straight,
            "confidence": round(confidence, 2)
        }
        
    @staticmethod
    def _compute_confidence(pitch: float, yaw: float, roll: float, is_straight: bool) -> float:
        """
        Calculate classification confidence.
        If straight, confidence decreases as yaw/pitch/roll get closer to thresholds.
        If looking away, confidence increases as angles move further past the thresholds.
        """
        if is_straight:
            # Distance to nearest threshold
            dist_yaw = min(abs(yaw - THRESHOLD_YAW_LEFT), abs(yaw - THRESHOLD_YAW_RIGHT))
            dist_pitch = min(abs(pitch - THRESHOLD_PITCH_DOWN), abs(pitch - THRESHOLD_PITCH_UP))
            dist_roll = abs(abs(roll) - THRESHOLD_ROLL_TILT)
            
            min_dist = min(dist_yaw, dist_pitch, dist_roll)
            
            # Map distance [0, 15] to confidence [0.65, 0.98]
            conf = 0.65 + (min_dist / 15.0) * 0.33
            return max(0.60, min(0.98, conf))
        else:
            # Looking away: how far past the threshold are we?
            excess_yaw = max(0, abs(yaw) - abs(THRESHOLD_YAW_RIGHT))
            excess_pitch = max(0, abs(pitch) - abs(THRESHOLD_PITCH_UP))
            excess_roll = max(0, abs(roll) - THRESHOLD_ROLL_TILT)
            
            max_excess = max(excess_yaw, excess_pitch, excess_roll)
            
            # Map excess [0, 30] to confidence [0.70, 0.99]
            conf = 0.70 + (max_excess / 30.0) * 0.29
            return max(0.70, min(0.99, conf))
        
        return 0.85
