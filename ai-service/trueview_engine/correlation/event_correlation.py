"""
Event Correlation Engine – TrueView AI Engine

Correlates multiple concurrent or sequential behavioural signals to identify complex
risk patterns (e.g. Phone + Downward Pose/Gaze = POSSIBLE_PHONE_INTERACTION).
"""

from typing import Dict, Any, List


class EventCorrelationEngine:
    """
    Evaluates multi-signal behavioral correlations across vision, audio, and environment.
    """

    def evaluate(
        self,
        fused_features: Dict[str, Any],
        temporal_analysis: Dict[str, Any],
        identity_status: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Identify multi-signal correlated patterns.
        """
        correlated: List[Dict[str, Any]] = []

        gaze_dir = fused_features.get("attention", {}).get("gaze", "center")
        pose_dir = fused_features.get("attention", {}).get("head_pose", "Looking Straight")
        phone_det = fused_features.get("environment", {}).get("phone_detected", False)
        person_cnt = fused_features.get("environment", {}).get("person_count", 1)
        speaking = fused_features.get("audio", {}).get("speaking", False)

        gaze_down = ("down" in gaze_dir.lower() or gaze_dir == "down")
        pose_down = ("down" in pose_dir.lower() or "Down" in pose_dir)
        gaze_away = (gaze_dir not in ("center", "straight"))
        pose_away = (pose_dir != "Looking Straight")

        # Pattern C: POSSIBLE_PHONE_INTERACTION
        if phone_det or (gaze_down and pose_down):
            signals = []
            if phone_det:
                signals.append("YOLO phone detection")
            if gaze_down:
                signals.append("Downward eye gaze")
            if pose_down:
                signals.append("Downward head pose orientation")

            if len(signals) >= 2:
                dur = temporal_analysis.get("phone_duration", 0.0) or temporal_analysis.get("looking_away_duration", 0.0)
                correlated.append({
                    "pattern_name": "POSSIBLE_PHONE_INTERACTION",
                    "confidence": 0.94 if phone_det else 0.82,
                    "supporting_signals": signals,
                    "duration": round(dur, 1),
                    "evidence": f"Correlated phone indicator: {', '.join(signals)}."
                })

        # Pattern A: POSSIBLE_EXTERNAL_INTERACTION
        if gaze_away and pose_away and speaking:
            signals = ["Gaze directed away", "Head pose turned", "Active voice speech"]
            correlated.append({
                "pattern_name": "POSSIBLE_EXTERNAL_INTERACTION",
                "confidence": 0.88,
                "supporting_signals": signals,
                "duration": temporal_analysis.get("speaking_duration", 0.0),
                "evidence": "Candidate turned head/gaze away while speaking, indicating external communication."
            })

        # Pattern B: POSSIBLE_USER_REPLACEMENT
        if identity_status.get("status") in ("POSSIBLE_USER_REPLACEMENT", "IDENTITY_MISMATCH"):
            signals = ["Face disappearance/reappearance", "Biometric embedding mismatch"]
            correlated.append({
                "pattern_name": "POSSIBLE_USER_REPLACEMENT",
                "confidence": identity_status.get("confidence", 0.90),
                "supporting_signals": signals,
                "duration": temporal_analysis.get("no_face_duration", 0.0),
                "evidence": "Face identity changed during monitoring session."
            })

        # Pattern D: POSSIBLE_OFFSCREEN_INTERACTION
        if person_cnt > 1 and (speaking or gaze_away):
            signals = [f"Multiple persons ({person_cnt}) detected"]
            if speaking:
                signals.append("Voice activity present")
            if gaze_away:
                signals.append("Attention diverted from screen")

            correlated.append({
                "pattern_name": "POSSIBLE_OFFSCREEN_INTERACTION",
                "confidence": 0.91,
                "supporting_signals": signals,
                "duration": temporal_analysis.get("multiple_persons_duration", 0.0),
                "evidence": "Second person detected in frame while candidate attention diverted."
            })

        return correlated
