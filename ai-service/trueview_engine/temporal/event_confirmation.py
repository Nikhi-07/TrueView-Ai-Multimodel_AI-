"""
Temporal Event Confirmation State Machine – TrueView AI Engine

Filters single-frame noise by transitioning events through:
NORMAL (or RESOLVED) → OBSERVING → CONFIRMED → ALERTED → COOLDOWN → NORMAL

Guarantees:
  - Temporal persistence: Condition must persist continuously across multiple
    frames for >= required_duration_sec before confirming.
  - Confidence gating: Low confidence signals (< min_confidence) cannot confirm.
  - Cooldown & Deduplication: Once ALERTED, enters COOLDOWN (5-10s) and does not
    spam repeated alerts every frame.
  - Lifecycle: When condition clears, resets to NORMAL so only a NEW sustained
    episode triggers another alert.
"""

import time
from typing import Dict, Any, List, Optional


class EventConfirmationStateMachine:
    """
    Manages event state transitions based on temporal persistence, confidence, and cooldown.
    """

    def __init__(self):
        # session_id -> { event_key -> { state, start_ts, duration, consecutive_count, evidence, ... } }
        self._active_events: Dict[str, Dict[str, Dict[str, Any]]] = {}

    def update_condition(
        self,
        session_id: str,
        event_key: str,
        raw_active: bool,
        confidence: float,
        evidence: str,
        required_duration_sec: float = 0.8,
        quality_eval: Optional[Dict[str, Any]] = None,
        min_confidence: float = 0.0,
        min_observe_conf: float = 0.0,
        cooldown_sec: float = 8.0,
        min_frames: int = 2
    ) -> Dict[str, Any]:
        """
        Evaluate raw detection signal against temporal state machine.
        Returns state dictionary with confirmed flag and should_alert trigger.
        """
        now = time.time()

        if session_id not in self._active_events:
            self._active_events[session_id] = {}

        sess_events = self._active_events[session_id]

        if event_key not in sess_events:
            sess_events[event_key] = {
                "state": "NORMAL",
                "start_ts": None,
                "confirmed_ts": None,
                "alerted_ts": None,
                "resolved_ts": None,
                "duration": 0.0,
                "consecutive_count": 0,
                "confidence": confidence,
                "evidence": evidence,
                "should_alert": False,
            }

        evt = sess_events[event_key]

        # Quality check: If input quality is UNRELIABLE, freeze event state
        if quality_eval and quality_eval.get("quality") == "UNRELIABLE":
            return {
                "state": evt["state"],
                "confirmed": evt["state"] in ("CONFIRMED", "ALERTED", "COOLDOWN", "ACTIVE"),
                "should_alert": False,
                "duration": evt["duration"],
                "confidence": evt["confidence"],
                "evidence": evt["evidence"],
                "in_cooldown": evt["state"] == "COOLDOWN",
            }

        # Confidence gating:
        # If confidence is below min_observe_conf, treat raw_active as False (noise)
        if raw_active and min_observe_conf > 0.0 and confidence < min_observe_conf:
            raw_active = False

        effective_conf = confidence
        grace_period_sec = 1.0
        should_alert = False

        if raw_active:
            evt["last_seen_ts"] = now
            evt["confidence"] = effective_conf
            evt["evidence"] = evidence

            # 1. State transition into OBSERVING
            if evt["state"] in ("NORMAL", "RESOLVED"):
                evt["state"] = "OBSERVING"
                evt["start_ts"] = now
                evt["consecutive_count"] = 1
                evt["confirmed_ts"] = None
                evt["alerted_ts"] = None
                evt["resolved_ts"] = None
                evt["duration"] = 0.0
                evt["should_alert"] = False
            else:
                evt["consecutive_count"] += 1

            dur = round(now - (evt["start_ts"] or now), 2)
            evt["duration"] = dur

            # 2. State transition from OBSERVING to CONFIRMED / ALERTED
            if evt["state"] == "OBSERVING":
                # Temporal persistence requires:
                # 1) Continuous duration >= required_duration_sec
                # 2) Consecutive frame confirmation >= min_frames
                # 3) Confidence >= min_confidence (if specified)
                conf_ok = (min_confidence <= 0.0) or (effective_conf >= min_confidence)
                if dur >= required_duration_sec and evt["consecutive_count"] >= min_frames and conf_ok:
                    evt["state"] = "ALERTED"
                    evt["confirmed_ts"] = now
                    evt["alerted_ts"] = now
                    evt["should_alert"] = True
                    should_alert = True
                else:
                    evt["should_alert"] = False

            # 3. State transition from ALERTED to COOLDOWN
            elif evt["state"] == "ALERTED":
                # Alert was already emitted in previous step. Transition into COOLDOWN.
                evt["state"] = "COOLDOWN"
                evt["should_alert"] = False
                should_alert = False

            # 4. State while in COOLDOWN
            elif evt["state"] == "COOLDOWN":
                evt["should_alert"] = False
                alerted_time = evt.get("alerted_ts") or (now - cooldown_sec - 1.0)
                if (now - alerted_time) >= cooldown_sec:
                    # Cooldown expired. If violation is still continuously active,
                    # keep it in ACTIVE state without spamming new alerts.
                    evt["state"] = "ACTIVE"
                should_alert = False

            elif evt["state"] in ("CONFIRMED", "ACTIVE"):
                evt["should_alert"] = False
                should_alert = False

        else:
            # Condition is not raw_active in this frame
            evt["should_alert"] = False
            curr_state = evt["state"]

            if curr_state in ("CONFIRMED", "ALERTED", "COOLDOWN", "ACTIVE"):
                last_seen = evt.get("last_seen_ts") or evt.get("start_ts") or now
                if (now - last_seen) < grace_period_sec:
                    # Maintain state temporarily during short frame jitter/blink
                    pass
                else:
                    # Condition has cleared! Reset to NORMAL
                    evt["state"] = "NORMAL"
                    evt["resolved_ts"] = now
                    evt["duration"] = 0.0
                    evt["consecutive_count"] = 0
                    evt["start_ts"] = None
                    evt["alerted_ts"] = None
            elif curr_state == "OBSERVING":
                last_seen = evt.get("last_seen_ts") or evt.get("start_ts") or now
                if (now - last_seen) > 0.4:
                    # Brief observation that did not reach threshold resets to NORMAL
                    evt["state"] = "NORMAL"
                    evt["resolved_ts"] = now
                    evt["duration"] = 0.0
                    evt["consecutive_count"] = 0
                    evt["start_ts"] = None
            else:
                evt["state"] = "NORMAL"
                evt["duration"] = 0.0
                evt["consecutive_count"] = 0
                evt["start_ts"] = None

        is_confirmed = evt["state"] in ("CONFIRMED", "ALERTED", "COOLDOWN", "ACTIVE")

        return {
            "state": evt["state"],
            "confirmed": is_confirmed,
            "should_alert": should_alert,
            "duration": evt["duration"],
            "confidence": evt["confidence"],
            "evidence": evt["evidence"],
            "confirmed_ts": evt.get("confirmed_ts"),
            "alerted_ts": evt.get("alerted_ts"),
            "resolved_ts": evt.get("resolved_ts"),
            "in_cooldown": evt["state"] == "COOLDOWN",
        }

    def reset(self, session_id: str):
        if session_id in self._active_events:
            del self._active_events[session_id]
