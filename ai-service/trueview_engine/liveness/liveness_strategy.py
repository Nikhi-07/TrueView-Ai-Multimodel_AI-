"""
Advanced Liveness Strategy – TrueView AI Engine

Combines non-intrusive Passive Liveness Analysis with on-demand Active Challenges
(blink twice, turn head left/right) only when passive confidence falls below threshold.
"""

from typing import Dict, Any, Optional


class LivenessStrategyManager:
    """
    Orchestrates passive multi-signal liveness and active challenge prompts.
    """

    def __init__(self):
        self._active_challenges: Dict[str, Dict[str, Any]] = {}

    def evaluate(
        self,
        session_id: str,
        passive_liveness_res: Dict[str, Any],
        blink_detected: bool,
        pose_direction: str,
        quality_eval: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Evaluate passive liveness and manage active challenges if needed.
        """
        status = passive_liveness_res.get("status", "live")
        conf = float(passive_liveness_res.get("confidence", 0.95))

        # Check if an active challenge is currently in progress
        challenge_info = self._active_challenges.get(session_id)
        
        if challenge_info and challenge_info.get("active"):
            target_challenge = challenge_info.get("type")
            challenge_met = False

            if target_challenge == "BLINK_TWICE" and blink_detected:
                challenge_info["progress"] += 1
                if challenge_info["progress"] >= 2:
                    challenge_met = True
            elif target_challenge == "TURN_HEAD_LEFT" and "Left" in pose_direction:
                challenge_met = True
            elif target_challenge == "TURN_HEAD_RIGHT" and "Right" in pose_direction:
                challenge_met = True

            if challenge_met:
                # Active challenge passed successfully
                self._active_challenges[session_id] = {"active": False, "type": None}
                return {
                    "status": "live",
                    "confidence": 0.98,
                    "passive_confidence": conf,
                    "active_challenge_required": False,
                    "active_challenge_type": None,
                    "note": "Active liveness challenge completed successfully."
                }
            else:
                return {
                    "status": "checking",
                    "confidence": conf,
                    "passive_confidence": conf,
                    "active_challenge_required": True,
                    "active_challenge_type": target_challenge,
                    "note": f"Awaiting active challenge response: {target_challenge}."
                }

        # If passive liveness is uncertain (confidence < 0.65) and quality is acceptable, request active challenge
        if conf < 0.65 and quality_eval.get("quality") != "POOR":
            challenge_type = "TURN_HEAD_LEFT" if conf < 0.50 else "BLINK_TWICE"
            self._active_challenges[session_id] = {
                "active": True,
                "type": challenge_type,
                "progress": 0
            }
            return {
                "status": "checking",
                "confidence": conf,
                "passive_confidence": conf,
                "active_challenge_required": True,
                "active_challenge_type": challenge_type,
                "note": f"Passive liveness uncertain ({int(conf*100)}%). Active challenge triggered: {challenge_type}."
            }

        return {
            "status": status,
            "confidence": conf,
            "passive_confidence": conf,
            "active_challenge_required": False,
            "active_challenge_type": None,
            "note": "Passive liveness confirmed."
        }

    def reset(self, session_id: str):
        if session_id in self._active_challenges:
            del self._active_challenges[session_id]
