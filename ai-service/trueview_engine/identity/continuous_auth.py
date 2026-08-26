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
            # HONEST DEFAULT: nothing has been proven yet. IDENTITY_CONSISTENT with
            # a fabricated 0.95 confidence was previously reported before the first
            # real recognition check — now we start at UNCERTAIN instead.
            self._session_identity[session_id] = {
                "status": "IDENTITY_UNCERTAIN",
                "confidence": 0.0,
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
        has_rec_result = bool(face_rec_result and not face_rec_result.get("recognition_unavailable"))

        should_check = (face_returned or multi_person or has_rec_result)

        if not face_detected or (face_rec_result and face_rec_result.get("status") == "FACE_NOT_DETECTED"):
            return {
                "status": "FACE_NOT_DETECTED",
                "verified": False,
                "confidence": 0.0,
                "trigger": "no_face"
            }

        # If quality is POOR, don't flag identity mismatch — but also don't claim
        # verified when nothing was proven (poor quality cannot fabricate a match).
        if quality_eval.get("quality") in ("POOR", "UNRELIABLE"):
            return {
                "status": "IDENTITY_UNCERTAIN",
                "verified": state["status"] in ("IDENTITY_CONSISTENT", "IDENTITY_VERIFIED"),
                "confidence": state["confidence"],
                "trigger": "poor_quality_suppressed"
            }

        # HONEST RULE: if recognition could not run (model missing or no registered
        # profile supplied), we must NOT conclude mismatch — but we also must NOT
        # claim verified. Keep the last PROVEN status untouched; a never-proven
        # session stays IDENTITY_UNCERTAIN and is reported as recognition unavailable.
        if face_rec_result and face_rec_result.get("recognition_unavailable"):
            return {
                "status": state["status"],
                "verified": state["status"] in ("IDENTITY_CONSISTENT", "IDENTITY_VERIFIED"),
                "confidence": state["confidence"],
                "trigger": "recognition_unavailable",
                "recognition_unavailable": True,
                "note": face_rec_result.get("note") or "Face recognition unavailable for this session.",
            }

        if should_check and face_rec_result:
            is_match = bool(face_rec_result.get("verified", False) or face_rec_result.get("status") == "VERIFIED")
            rec_conf = float(face_rec_result.get("confidence", 0.0))
            is_mismatch = (not is_match) and face_rec_result.get("status") == "MISMATCH"

            if is_match:
                state["mismatch_counter"] = 0
                state["status"] = "IDENTITY_VERIFIED"
                state["confidence"] = round(rec_conf, 2)
            elif is_mismatch:
                state["mismatch_counter"] += 1
                if state["mismatch_counter"] >= 3:
                    state["status"] = "POSSIBLE_USER_REPLACEMENT"
                    state["confidence"] = round(rec_conf, 2)
                elif state["mismatch_counter"] >= 2:
                    state["status"] = "IDENTITY_MISMATCH"
                    state["confidence"] = round(rec_conf, 2)
                else:
                    # Debounce single-frame noise before confirming mismatch
                    state["status"] = "IDENTITY_UNCERTAIN"
                    state["confidence"] = round(rec_conf, 2)

        verified_bool = state["status"] in ("IDENTITY_CONSISTENT", "IDENTITY_VERIFIED")

        return {
            "status": state["status"],
            "verified": verified_bool,
            "confidence": state["confidence"],
            "trigger": "event_triggered" if (face_returned or multi_person) else "periodic"
        }

    def reset(self, session_id: str):
        if session_id in self._session_identity:
            del self._session_identity[session_id]
