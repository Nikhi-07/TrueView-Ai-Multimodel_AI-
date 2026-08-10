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
        session_type: str = "EXAM"
    ) -> Dict[str, Any]:
        """
        Produce comprehensive attention status payload.
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

        # Check calibrated pose deltas (yaw > 16.0 or pitch > 14.0)
        raw_pitch = calibrated_pose_deltas.get("delta_pitch", 0.0)
        pitch_delta = abs(raw_pitch)
        yaw_delta = abs(calibrated_pose_deltas.get("delta_yaw", 0.0))

        is_gaze_away = (gaze_dir not in ("center", "straight"))
        is_pose_deviated = (yaw_delta > 16.0 or pitch_delta > 14.0 or pose_dir != "Looking Straight")

        # Keyboard Typing Check: candidate looking down at keyboard with head centered.
        # This exemption exists so CLASS / MEETING / WORKPLACE sessions don't false-
        # alarm on legitimate typing. It is NOT applied in EXAM mode: looking down at
        # the desk/lap is exactly the signal proctors must see (hidden phone, notes),
        # so EXAM treats a downward glance as an OFFSCREEN_GLANCE like any other
        # distraction. The 2-frame + temporal confirmation window still filters noise.
        is_downward_keyboard_glance = (
            session_type.upper() != "EXAM"
            and (gaze_dir in ("down", "bottom") or raw_pitch < -6.0)
            and yaw_delta < 15.0  # Head is NOT turned sideways left/right
            and looking_away_duration <= 2.5  # Brief keyboard typing glance
        )

        if is_downward_keyboard_glance:
            dist_tracker["was_distracted"] = False
            status = "LOOKING_AT_KEYBOARD"
            score = 92.0
            dur = 0.0
        elif is_gaze_away or is_pose_deviated:
            if not dist_tracker["was_distracted"]:
                dist_tracker["distraction_count"] += 1
                dist_tracker["was_distracted"] = True

            dur = looking_away_duration
            if dur >= 2.5:
                status = "PROLONGED_DISTRACTION"
                score = 30.0
            elif dist_tracker["distraction_count"] >= 3 or dur >= 1.0:
                status = "REPEATED_DISTRACTION"
                score = 45.0
            else:
                status = "OFFSCREEN_GLANCE"
                score = 60.0
        else:
            dist_tracker["was_distracted"] = False
            status = "FOCUSED"
            score = 95.0
            dur = 0.0

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
