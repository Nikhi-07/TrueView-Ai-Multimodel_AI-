"""
Advanced Attention Intelligence Engine – TrueView AI Engine

Evaluates eye gaze direction, head pose orientation, personal calibration deltas,
distraction duration, and distraction frequency.
Classifies attention state into:
- FOCUSED
- BRIEF_NATURAL_DISTRACTION
- REPEATED_DISTRACTION
- PROLONGED_DISTRACTION
- ATTENTION_UNCERTAIN
"""

from typing import Dict, Any, Optional


class AttentionIntelligenceEngine:
    """
    Multimodal attention classification engine.
    """

    def __init__(self):
        self._session_distractions: Dict[str, Dict[str, Any]] = {}

    def evaluate(
        self,
        session_id: str,
        gaze_dir: str,
        pose_dir: str,
        calibrated_pose_deltas: Dict[str, float],
        face_detected: bool,
        quality_eval: Dict[str, Any],
        looking_away_duration: float,
        session_type: str = "EXAM",
        gaze_confidence: float = 0.85,
        monitoring_profile: str = "MODERATE"
    ) -> Dict[str, Any]:
        """
        Produce comprehensive attention status payload with confidence gating
        and profile-aware temporal persistence.
        """
        if session_id not in self._session_distractions:
            self._session_distractions[session_id] = {
                "distraction_count": 0,
                "was_distracted": False
            }

        dist_tracker = self._session_distractions[session_id]

        if not face_detected or quality_eval.get("quality") in ("POOR", "UNRELIABLE"):
            return {
                "status": "ATTENTION_UNCERTAIN",
                "score": 50.0,
                "gaze": gaze_dir,
                "head_pose": pose_dir,
                "distraction_duration_sec": 0.0,
                "note": "Attention measurement uncertain due to uncalibrated pose or low visibility."
            }

        normalized_gaze = str(gaze_dir or "center").strip().lower()

        # Confidence gating:
        # Gaze confidence < 70% is ignored / kept internal
        if gaze_confidence < 0.70 and normalized_gaze not in ("center", "straight"):
            return {
                "status": "FOCUSED",
                "score": 90.0,
                "gaze": gaze_dir,
                "head_pose": pose_dir,
                "distraction_duration_sec": 0.0,
                "distraction_frequency": dist_tracker["distraction_count"],
                "note": "Low gaze confidence (<70%): ignored to prevent false positives."
            }

        # Check calibrated pose deltas
        raw_pitch = calibrated_pose_deltas.get("delta_pitch", 0.0)
        pitch_delta = abs(raw_pitch)
        yaw_delta = abs(calibrated_pose_deltas.get("delta_yaw", 0.0))

        # Profile-aware thresholds:
        prof_upper = str(monitoring_profile or "MODERATE").upper()
        if prof_upper == "STRICT":
            yaw_thresh = 25.0
            pitch_thresh = 20.0
            required_distraction_sec = 1.5
            min_alert_conf = 0.75
        elif prof_upper == "RELAXED":
            yaw_thresh = 42.0
            pitch_thresh = 35.0
            required_distraction_sec = 5.0
            min_alert_conf = 0.88
        else:  # MODERATE (Default for EXAM)
            yaw_thresh = 35.0
            pitch_thresh = 28.0
            required_distraction_sec = 3.0
            min_alert_conf = 0.85

        # Normal natural candidate glances: center, slight left/right/down, keyboard, question paper, hands
        is_natural_glance = normalized_gaze in (
            "center", "straight", "slight_left", "slight_right", "slight_down", "down",
            "bottom", "keyboard", "hands", "question_paper", "paper", "desk", "writing"
        )
        is_clear_offscreen = normalized_gaze in ("left", "right", "up", "offscreen")
        is_pose_deviated = (yaw_delta > yaw_thresh or pitch_delta > pitch_thresh)

        # Distraction condition active
        is_diverted = (is_clear_offscreen or is_pose_deviated or (not is_natural_glance))

        if not is_diverted:
            dist_tracker["was_distracted"] = False
            status = "FOCUSED"
            score = 95.0
            dur = 0.0
        else:
            # Condition is diverted: check temporal persistence
            dur = looking_away_duration

            # Confidence check for confirmed alert:
            conf_ok = (gaze_confidence >= min_alert_conf)

            if dur >= required_distraction_sec and conf_ok:
                if not dist_tracker["was_distracted"]:
                    dist_tracker["distraction_count"] += 1
                    dist_tracker["was_distracted"] = True
                status = "PROLONGED_DISTRACTION"
                score = 35.0
            else:
                # Brief look away (< required seconds) or short offscreen:
                # Normal natural behavior, do not treat as confirmed distraction!
                status = "BRIEF_NATURAL_DISTRACTION"
                score = 85.0

        return {
            "status": status,
            "score": round(score, 1),
            "gaze": gaze_dir,
            "head_pose": pose_dir,
            "distraction_duration_sec": round(dur, 1),
            "distraction_frequency": dist_tracker["distraction_count"],
            "note": f"Attention evaluated as {status}."
        }

    def reset(self, session_id: str):
        if session_id in self._session_distractions:
            del self._session_distractions[session_id]
