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

        IMPORTANT (real-time): LOW_POWER must only engage when the pipeline is
        genuinely crippled (< 3 fps). The old threshold of < 10 fps created a
        self-compounding trap: a CPU-bound machine starts below 10 fps, drops to
        LOW_POWER, which throttles YOLO to every 8th frame, which makes it even
        slower. Object detection stays responsive unless the engine is truly stuck.
        """
        if system_fps > 0.0 and system_fps < 3.0:
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
            # Maximum-frequency monitoring on suspicious activity
            return {
                "face_detection": 1,
                "gaze": 1,
                "head_pose": 1,
                "yolo": 1,            # Run object detection EVERY frame while suspicious
                "liveness": 10,        # Check liveness every 10 frames
                "face_recognition": 15,# Verify identity every 15 frames
            }
        elif self.mode == "LOW_POWER":
            # Power saving mode for truly crippled pipelines only (< 3 fps)
            return {
                "face_detection": 1,
                "gaze": 2,
                "head_pose": 2,
                "yolo": 4,            # Never slower than every 4th frame
                "liveness": 60,
                "face_recognition": 60,
            }
        else:
            # Standard NORMAL mode — object detection runs every 2nd frame so a
            # phone appearing mid-scene is caught within ~2 frames (~0.3-0.6s),
            # not up to 4+ frames (~1-2s) as before.
            return {
                "face_detection": 1,
                "gaze": 1,
                "head_pose": 1,
                "yolo": 2,            # Every 2nd frame (real-time object detection)
                "liveness": 30,       # Every 30 frames (~1.0s)
                "face_recognition": 30,# Every 30 frames (~1.0s)
            }
