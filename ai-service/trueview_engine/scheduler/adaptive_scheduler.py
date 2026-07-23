"""
Adaptive Inference Scheduler – TrueView AI Engine

Dynamically adjusts inference frequencies per module based on current risk level,
system hardware load, and detection state (NORMAL MODE vs. SUSPICIOUS MODE vs. LOW POWER MODE).
"""

from typing import Dict, Any


class AdaptiveInferenceScheduler:
    """
    Schedules module processing skip-frame rates according to performance mode and risk state.
    """

    def __init__(self):
        self.mode = "NORMAL"  # NORMAL | SUSPICIOUS | LOW_POWER

    def determine_mode(self, current_risk_score: float, system_fps: float) -> str:
        """
        Dynamically transition system performance mode.
        """
        if system_fps < 10.0:
            self.mode = "LOW_POWER"
        elif current_risk_score >= 40.0:
            self.mode = "SUSPICIOUS"
        else:
            self.mode = "NORMAL"

        return self.mode

    def get_execution_intervals(self) -> Dict[str, int]:
        """
        Returns skip-frame intervals per module for current mode.
        Interval N means run every Nth frame.
        """
        if self.mode == "SUSPICIOUS":
            # High frequency monitoring on suspicious activity
            return {
                "face_detection": 1,
                "gaze": 1,
                "head_pose": 1,
                "yolo": 2,            # Run object detection every 2nd frame
                "liveness": 10,        # Check liveness every 10 frames
                "face_recognition": 15,# Verify identity every 15 frames
            }
        elif self.mode == "LOW_POWER":
            # Power saving mode for low-end hardware
            return {
                "face_detection": 1,
                "gaze": 2,
                "head_pose": 2,
                "yolo": 8,            # Run object detection every 8th frame
                "liveness": 60,
                "face_recognition": 60,
            }
        else:
            # Standard NORMAL mode
            return {
                "face_detection": 1,
                "gaze": 1,
                "head_pose": 1,
                "yolo": 4,            # Every 4th frame (~7.5 fps)
                "liveness": 30,       # Every 30 frames (~1.0s)
                "face_recognition": 30,# Every 30 frames (~1.0s)
            }
