"""
Unified Decision Engine & Context-Aware Risk Scorer – TrueView AI Engine

Calculates dynamic 0–100 risk score with continuous temporal decay,
tracks Current Risk vs. Peak Risk, applies non-judgmental risk classifications,
and determines recommended monitoring actions.
"""

import time
import math
from typing import Dict, Any, List, Set
from trueview_engine.policy.policy_engine import PolicyEngine

RISK_DECAY_RATE = 1.0  # Points recovered per clean second

SEVERITY_WEIGHTS: Dict[str, float] = {
    "LOW": 5.0,
    "MEDIUM": 15.0,
    "HIGH": 30.0,
    "CRITICAL": 50.0,
}


class UnifiedDecisionEngine:
    """
    Dynamic risk calculation and decision engine.
    Calculates 0-100 risk score based on confirmed violation transitions
    (LOW: +5, MEDIUM: +15, HIGH: +30, CRITICAL: +50) with session isolation.
    """

    def __init__(self):
        self._sessions: Dict[str, Dict[str, Any]] = {}
        self.policy_engine = PolicyEngine()

    def _get_session_state(self, session_id: str) -> Dict[str, Any]:
        if session_id not in self._sessions:
            self._sessions[session_id] = {
                "score": 0.0,
                "peak_score": 0.0,
                "active_event_types": set(),
                "last_ts": time.time(),
            }
        return self._sessions[session_id]

    def evaluate(
        self,
        fused_features: Dict[str, Any],
        behaviour_summary: Dict[str, Any],
        correlated_patterns: List[Dict[str, Any]],
        uncertainty_eval: Dict[str, Any],
        session_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Evaluate current state and return dynamic Risk and Decision payloads.
        """
        session_id = session_context.get("session_id", "default_session")
        session_type = session_context.get("session_type", "EXAM").upper()
        policy = self.policy_engine.get_policy(session_type)

        st = self._get_session_state(session_id)
        now = time.time()
        dt = min(max(now - st["last_ts"], 0.01), 2.0)
        st["last_ts"] = now

        events = behaviour_summary.get("events", [])
        reasons: List[str] = []

        # Filter active vs resolved events
        active_events = [e for e in events if e.get("state") != "RESOLVED"]
        current_active_types: Set[str] = set()

        for evt in active_events:
            evt_type = evt.get("type", "")
            current_active_types.add(evt_type)
            reasons.append(evt.get("evidence") or evt.get("message") or f"Violation detected: {evt_type}")

        for v_type in behaviour_summary.get("active_violation_types", []):
            current_active_types.add(v_type)

        # Transition detection: newly activated events increment risk score ONCE
        prev_active: Set[str] = st["active_event_types"]
        newly_activated = current_active_types - prev_active

        for evt in active_events:
            evt_type = evt.get("type", "")
            if evt_type in newly_activated:
                severity = str(evt.get("severity", "MEDIUM")).upper()
                pol_eval = self.policy_engine.evaluate_violation(evt_type, session_type)
                policy_weight = pol_eval.get("weight")

                if severity in SEVERITY_WEIGHTS:
                    inc = SEVERITY_WEIGHTS[severity]
                elif policy_weight is not None and policy_weight > 0:
                    inc = policy_weight * 3.0
                else:
                    inc = 15.0

                if uncertainty_eval.get("uncertainty_level") == "UNCERTAIN":
                    inc *= 0.5

                st["score"] = min(100.0, st["score"] + inc)

        # Correlated patterns add a one-time increment if present
        for pat in correlated_patterns:
            reasons.append(f"Correlated pattern: {pat.get('pattern_name')}")

        # Decay: when no active events are present, apply continuous temporal decay
        if not current_active_types:
            decay = RISK_DECAY_RATE * dt
            st["score"] = max(0.0, st["score"] - decay)

        st["active_event_types"] = current_active_types

        if math.isnan(st["score"]) or math.isinf(st["score"]):
            st["score"] = 0.0
        score = round(max(0.0, min(100.0, st["score"])), 1)

        if score > st["peak_score"] or math.isnan(st["peak_score"]):
            st["peak_score"] = score
        peak_score = round(st["peak_score"], 1)

        # Risk Level & Non-Judgmental Labeling
        if score <= 20.0:
            level = "NORMAL"
            risk_label = "NORMAL"
            action = "CONTINUE_MONITORING"
        elif score <= 40.0:
            level = "LOW"
            risk_label = "RISK INDICATOR"
            action = "CONTINUE_MONITORING"
        elif score <= 60.0:
            level = "MEDIUM"
            risk_label = "SUSPICIOUS EVENT"
            action = "WARN_CANDIDATE"
        elif score <= 80.0:
            level = "HIGH"
            risk_label = "REVIEW RECOMMENDED"
            action = "FLAG_FOR_REVIEW"
        else:
            level = "CRITICAL"
            risk_label = "HIGH-RISK EVENT"
            action = "SUSPEND_SESSION" if getattr(policy, "auto_suspend", False) else "FLAG_FOR_REVIEW"

        if not reasons:
            reasons = [f"Session is operating within normal parameters for '{session_type}' policy."]

        return {
            "risk": {
                "score": score,
                "current": score,
                "peak": peak_score,
                "level": level,
                "risk_label": risk_label,
            },
            "decision": {
                "action": action,
                "reasons": list(set(reasons)),
                "uncertainty_level": uncertainty_eval.get("uncertainty_level", "CONFIRMED")
            }
        }

    def reset(self, session_id: str = None):
        """Reset score counters."""
        if session_id and session_id in self._sessions:
            del self._sessions[session_id]
        else:
            self._sessions.clear()
