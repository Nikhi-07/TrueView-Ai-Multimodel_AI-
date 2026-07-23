"""
Continuous Passive Identity Verification – TrueView AI Engine

Implements lightweight periodic and event-triggered continuous authentication.
Triggers verification on face reappearance, multi-person events, or appearance changes.
Outputs: IDENTITY_CONSISTENT, IDENTITY_UNCERTAIN, IDENTITY_MISMATCH, POSSIBLE_USER_REPLACEMENT.
"""

import time
from typing import Dict, Any, Optional


class ContinuousAuthenticator:
    """
    Manages continuous passive identity checks over a monitoring session.
    """

    def __init__(self):
        self._session_identity: Dict[str, Dict[str, Any]] = {}

    def evaluate(
        self,
        session_id: str,
        frame_index: int,
        face_detected: bool,
        face_count: int,
        face_rec_result: Optional[Dict[str, Any]],
        quality_eval: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Evaluate continuous identity status using event triggers and observations.
        """
        now_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        if session_id not in self._session_identity:
            self._session_identity[session_id] = {
                "status": "IDENTITY_CONSISTENT",
                "confidence": 0.95,
                "mismatch_counter": 0,
                "last_verified_frame": frame_index,
                "last_face_present": face_detected,
            }

        state = self._session_identity[session_id]
        prev_face_present = state["last_face_present"]
        state["last_face_present"] = face_detected

        # Trigger conditions for running identity verification:
        face_returned = (not prev_face_present and face_detected)
        multi_person = (face_count > 1)
        periodic_check = (frame_index % 30 == 0)

        should_check = (face_returned or multi_person or periodic_check)

        if not face_detected:
            # If no face is present, keep existing verification status but don't flag mismatch
            return {
                "status": state["status"],
                "verified": state["status"] in ("IDENTITY_CONSISTENT", "IDENTITY_UNCERTAIN"),
                "confidence": state["confidence"],
                "trigger": "no_face"
            }

        # If quality is POOR, don't flag identity mismatch
        if quality_eval.get("quality") in ("POOR", "UNRELIABLE"):
            return {
                "status": "IDENTITY_UNCERTAIN",
                "verified": True,
                "confidence": 0.70,
                "trigger": "poor_quality_suppressed"
            }

        if should_check and face_rec_result:
            is_match = face_rec_result.get("verified", True)
            rec_conf = face_rec_result.get("confidence", 0.95)

            if is_match:
                state["mismatch_counter"] = max(0, state["mismatch_counter"] - 1)
                state["status"] = "IDENTITY_CONSISTENT"
                state["confidence"] = round(rec_conf, 2)
            else:
                state["mismatch_counter"] += 1
                if state["mismatch_counter"] >= 3:
                    state["status"] = "POSSIBLE_USER_REPLACEMENT"
                    state["confidence"] = round(rec_conf, 2)
                elif state["mismatch_counter"] >= 1:
                    state["status"] = "IDENTITY_MISMATCH"
                    state["confidence"] = round(rec_conf, 2)

        verified_bool = state["status"] in ("IDENTITY_CONSISTENT", "IDENTITY_UNCERTAIN")

        return {
            "status": state["status"],
            "verified": verified_bool,
            "confidence": state["confidence"],
            "trigger": "event_triggered" if (face_returned or multi_person) else "periodic"
        }

    def reset(self, session_id: str):
        if session_id in self._session_identity:
            del self._session_identity[session_id]
