"""
Temporal Fusion & Sliding Window Analyzer – TrueView AI Engine

Maintains short-term history across frames to verify event persistence,
duration, and frequency, preventing single-frame false positives.
"""

import time
from typing import Dict, Any, List
from trueview_engine.config.thresholds import (
    TEMPORAL_WINDOW_PHONE_SECS,
    TEMPORAL_WINDOW_MULTIPLE_PERSONS,
    TEMPORAL_WINDOW_LOOKING_AWAY,
    TEMPORAL_WINDOW_NO_FACE,
    TEMPORAL_WINDOW_SPEAKING,
)


class TemporalFusionAnalyzer:
    """
    Stateful persistence and temporal sliding window verifier.
    """

    def __init__(self):
        self._active_states: Dict[str, float] = {}  # state_key -> start_timestamp
        self._event_counters: Dict[str, int] = {}    # state_key -> count
        self._history: List[Dict[str, Any]] = []      # rolling history

    def update(self, fused_features: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process fused feature snapshot and return confirmed temporal state.

        Returns:
            {
                "phone_confirmed": bool,
                "phone_duration": float,
                "multiple_persons_confirmed": bool,
                "looking_away_confirmed": bool,
                "looking_away_duration": float,
                "no_face_confirmed": bool,
                "no_face_duration": float,
                "speaking_confirmed": bool,
                "speaking_duration": float,
                "noise_confirmed": bool,
            }
        """
        now = time.time()

        env = fused_features.get("environment", {})
        attn = fused_features.get("attention", {})
        audio = fused_features.get("audio", {})
        face_det = fused_features.get("face_detected", True)

        raw_conditions = {
            "phone": env.get("phone_detected", False),
            "multiple_persons": env.get("person_count", 1) > 1,
            "looking_away": attn.get("status") == "looking_away",
            "no_face": not face_det,
            "speaking": audio.get("speaking", False),
            "high_noise": audio.get("noise_level") == "high",
        }

        durations: Dict[str, float] = {}
        confirmed: Dict[str, bool] = {}

        for key, active in raw_conditions.items():
            if active:
                if key not in self._active_states:
                    self._active_states[key] = now
                    self._event_counters[key] = self._event_counters.get(key, 0) + 1
                durations[key] = round(now - self._active_states[key], 1)
            else:
                if key in self._active_states:
                    del self._active_states[key]
                durations[key] = 0.0

        # Verify against temporal persistence windows
        confirmed["phone_confirmed"] = (durations["phone"] >= TEMPORAL_WINDOW_PHONE_SECS)
        confirmed["phone_duration"] = durations["phone"]

        confirmed["multiple_persons_confirmed"] = (durations["multiple_persons"] >= TEMPORAL_WINDOW_MULTIPLE_PERSONS)
        confirmed["multiple_persons_duration"] = durations["multiple_persons"]

        confirmed["looking_away_confirmed"] = (durations["looking_away"] >= TEMPORAL_WINDOW_LOOKING_AWAY)
        confirmed["looking_away_duration"] = durations["looking_away"]

        confirmed["no_face_confirmed"] = (durations["no_face"] >= TEMPORAL_WINDOW_NO_FACE)
        confirmed["no_face_duration"] = durations["no_face"]

        confirmed["speaking_confirmed"] = (durations["speaking"] >= TEMPORAL_WINDOW_SPEAKING)
        confirmed["speaking_duration"] = durations["speaking"]

        confirmed["noise_confirmed"] = (durations["high_noise"] >= 1.0)

        return confirmed

    def reset(self):
        """Reset temporal analyzer state."""
        self._active_states.clear()
        self._event_counters.clear()
        self._history.clear()
