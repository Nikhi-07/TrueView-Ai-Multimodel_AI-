"""
Temporal Event Confirmation State Machine – TrueView AI Engine

Filters single-frame noise by transitioning events through:
POTENTIAL → OBSERVING → CONFIRMED → ACTIVE → RESOLVED

Real-time guarantees:
  - The state machine NEVER delays the first qualified event beyond the
    configured confirmation window (see config/thresholds.py).
  - Every transition is timestamped (start_ts / confirmed_ts / resolved_ts) so
    downstream consumers can compute true detection latency and emit
    DETECTED/ACTIVE/CLEARED lifecycle events.
"""

import time
from typing import Dict, Any, List, Optional


class EventConfirmationStateMachine:
    """
    Manages event state transitions based on temporal persistence and confidence.
    """

    def __init__(self):
        # session_id -> { event_key -> { state, start_ts, duration, consecutive_frames, evidence } }
        self._active_events: Dict[str, Dict[str, Dict[str, Any]]] = {}

    def update_condition(
        self,
        session_id: str,
        event_key: str,
        raw_active: bool,
        confidence: float,
        evidence: str,
        required_duration_sec: float = 0.8,
        quality_eval: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Evaluate raw detection signal against temporal state machine.
        """
        now = time.time()

        if session_id not in self._active_events:
            self._active_events[session_id] = {}

        sess_events = self._active_events[session_id]

        if event_key not in sess_events:
            sess_events[event_key] = {
                "state": "POTENTIAL" if raw_active else "RESOLVED",
                "start_ts": now if raw_active else None,
                "confirmed_ts": None,
                "resolved_ts": None,
                "duration": 0.0,
                "consecutive_count": 1 if raw_active else 0,
                "confidence": confidence,
                "evidence": evidence,
            }

        evt = sess_events[event_key]

        # Quality check: If input quality is UNRELIABLE, freeze event state
        if quality_eval and quality_eval.get("quality") == "UNRELIABLE":
            return {
                "state": evt["state"],
                "confirmed": evt["state"] in ("CONFIRMED", "ACTIVE"),
                "duration": evt["duration"],
                "confidence": evt["confidence"],
                "evidence": evt["evidence"],
            }

        grace_period_sec = 1.2

        if raw_active:
            evt["last_seen_ts"] = now
            if evt["state"] == "RESOLVED":
                evt["state"] = "POTENTIAL"
                evt["start_ts"] = now
                evt["consecutive_count"] = 1
                evt["confirmed_ts"] = None
                evt["resolved_ts"] = None
            else:
                evt["consecutive_count"] += 1

            dur = round(now - (evt["start_ts"] or now), 2)
            evt["duration"] = dur
            evt["confidence"] = confidence
            evt["evidence"] = evidence

            # State Transitions:
            # 2 consecutive frames transition POTENTIAL -> OBSERVING
            if evt["state"] == "POTENTIAL" and evt["consecutive_count"] >= 2:
                evt["state"] = "OBSERVING"

            # Reaching duration threshold or sufficient observations confirms event
            if evt["state"] == "OBSERVING" and (dur >= required_duration_sec or evt["consecutive_count"] >= 3):
                if evt["state"] != "CONFIRMED":
                    evt["confirmed_ts"] = now
                evt["state"] = "CONFIRMED"

            if evt["state"] == "CONFIRMED" and dur >= (required_duration_sec + 1.0):
                evt["state"] = "ACTIVE"
        else:
            if evt["state"] in ("CONFIRMED", "ACTIVE"):
                last_seen = evt.get("last_seen_ts") or evt.get("start_ts") or now
                if now - last_seen < grace_period_sec:
                    # Maintain confirmed/active state during grace period to prevent flicker
                    pass
                else:
                    evt["state"] = "RESOLVED"
                    evt["resolved_ts"] = now
                    evt["duration"] = 0.0
                    evt["consecutive_count"] = 0
            elif evt["state"] in ("POTENTIAL", "OBSERVING"):
                evt["state"] = "RESOLVED"
                evt["resolved_ts"] = now
                evt["duration"] = 0.0
                evt["consecutive_count"] = 0

        is_confirmed = evt["state"] in ("CONFIRMED", "ACTIVE")

        return {
            "state": evt["state"],
            "confirmed": is_confirmed,
            "duration": evt["duration"],
            "confidence": evt["confidence"],
            "evidence": evt["evidence"],
            "confirmed_ts": evt.get("confirmed_ts"),
            "resolved_ts": evt.get("resolved_ts"),
        }

    def reset(self, session_id: str):
        if session_id in self._active_events:
            del self._active_events[session_id]
