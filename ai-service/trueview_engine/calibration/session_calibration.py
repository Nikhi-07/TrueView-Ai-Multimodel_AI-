"""
Personal Session Calibration Engine – TrueView AI Engine

Captures candidate-specific baseline metrics (neutral head pose, natural gaze center,
blink rate, lighting baseline, noise floor) during session startup or passive initialization.
Adapts detection thresholds per user while storing zero permanent biometric data.
"""

import time
from typing import Dict, Any, Optional
from dataclasses import dataclass, field


@dataclass
class SessionCalibrationProfile:
    """
    Temporary session calibration parameters stored per active session.
    """
    session_id: str
    is_calibrated: bool = False
    calibration_timestamp: Optional[str] = None
    
    # Vision & Pose Baselines
    neutral_pitch: float = 0.0
    neutral_yaw: float = 0.0
    neutral_roll: float = 0.0
    natural_gaze_center: str = "center"
    
    # Lighting & Noise Baselines
    baseline_brightness: float = 0.5
    baseline_blur: float = 0.8
    baseline_noise_rms: float = 0.02
    
    # Adaptive Threshold Adjustments
    gaze_yaw_offset: float = 0.0
    gaze_pitch_offset: float = 0.0
    custom_looking_away_yaw_threshold: float = 25.0
    custom_looking_away_pitch_threshold: float = 20.0


class SessionCalibrator:
    """
    Manages session calibration samples and builds calibration profiles.
    """

    def __init__(self):
        self._profiles: Dict[str, SessionCalibrationProfile] = {}
        self._sample_buffers: Dict[str, list] = {}

    def get_profile(self, session_id: str) -> SessionCalibrationProfile:
        if session_id not in self._profiles:
            self._profiles[session_id] = SessionCalibrationProfile(session_id=session_id)
        return self._profiles[session_id]

    def add_calibration_sample(
        self,
        session_id: str,
        pose_data: Dict[str, Any],
        gaze_data: Dict[str, Any],
        quality_data: Dict[str, Any]
    ) -> bool:
        """
        Collect sample frames during calibration phase (e.g. first 10-30 frames).
        Returns True once profile is successfully generated.
        """
        if session_id not in self._sample_buffers:
            self._sample_buffers[session_id] = []

        buf = self._sample_buffers[session_id]
        buf.append({
            "pitch": pose_data.get("pitch", 0.0),
            "yaw": pose_data.get("yaw", 0.0),
            "roll": pose_data.get("roll", 0.0),
            "gaze": gaze_data.get("direction", "center"),
            "brightness": quality_data.get("brightness", 0.5),
        })

        # Finalize calibration after 15 samples
        if len(buf) >= 15:
            profile = self.get_profile(session_id)
            pitches = [s["pitch"] for s in buf]
            yaws = [s["yaw"] for s in buf]
            rolls = [s["roll"] for s in buf]
            brightnesses = [s["brightness"] for s in buf]

            profile.neutral_pitch = round(float(sum(pitches) / len(pitches)), 2)
            profile.neutral_yaw = round(float(sum(yaws) / len(yaws)), 2)
            profile.neutral_roll = round(float(sum(rolls) / len(rolls)), 2)
            profile.baseline_brightness = round(float(sum(brightnesses) / len(brightnesses)), 2)

            profile.is_calibrated = True
            profile.calibration_timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            
            # Clean up raw sample buffer to avoid storing unnecessary raw biometric data
            del self._sample_buffers[session_id]
            return True

        return False

    def adapt_pose_thresholds(self, session_id: str, pitch: float, yaw: float) -> Dict[str, float]:
        """
        Calculate relative pose delta adjusted by user's neutral baseline.
        """
        profile = self.get_profile(session_id)
        if not profile.is_calibrated:
            return {"delta_pitch": pitch, "delta_yaw": yaw}

        delta_pitch = pitch - profile.neutral_pitch
        delta_yaw = yaw - profile.neutral_yaw

        return {
            "delta_pitch": round(delta_pitch, 2),
            "delta_yaw": round(delta_yaw, 2),
        }

    def clear(self, session_id: str):
        if session_id in self._profiles:
            del self._profiles[session_id]
        if session_id in self._sample_buffers:
            del self._sample_buffers[session_id]
