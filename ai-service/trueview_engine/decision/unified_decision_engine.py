"""
Unified Decision Engine & Context-Aware Risk Scorer – TrueView AI Engine

Calculates dynamic 0–100 risk score with continuous temporal decay,
tracks Current Risk vs. Peak Risk, applies non-judgmental risk classifications,
and determines recommended monitoring actions.
"""

import time
from typing import Dict, Any, List
from trueview_engine.policy.policy_engine import PolicyEngine

RISK_DECAY_RATE = 1.0  # Points recovered per clean second


class UnifiedDecisionEngine:
    """
    Dynamic risk calculation and decision engine.
    """

    def __init__(self):
        self._score: float = 0.0
        self._peak_score: float = 0.0
        self._last_ts: float = time.time()
        self.policy_engine = PolicyEngine()

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
        now = time.time()
        dt = min(max(now - self._last_ts, 0.01), 2.0)
        self._last_ts = now

        session_type = session_context.get("session_type", "EXAM").upper()
        policy = self.policy_engine.get_policy(session_type)

        # 1. Apply baseline continuous decay
        decay = RISK_DECAY_RATE * dt
        self._score = max(0.0, self._score - decay)

        events = behaviour_summary.get("events", [])
        reasons: List[str] = []

        # 2. Accumulate weighted risk from confirmed behaviour events
        risk_increment = 0.0
        for evt in events:
            evt_type = evt.get("type", "")
            pol_eval = self.policy_engine.evaluate_violation(evt_type, session_type)
            w = pol_eval.get("weight", 2.0)
            risk_increment += w * dt
            reasons.append(evt.get("evidence", "Violation detected"))

        # 3. Accumulate risk from correlated patterns
        for pat in correlated_patterns:
            risk_increment += 5.0 * dt
            reasons.append(f"Correlated pattern: {pat.get('pattern_name')}")

        # Adjust score if uncertainty is UNCERTAIN or REJECTED
        if uncertainty_eval.get("uncertainty_level") == "UNCERTAIN":
            risk_increment *= 0.5

        import math
        if math.isnan(self._score) or math.isinf(self._score):
            self._score = 0.0
        score = round(self._score, 1)

        if score > self._peak_score or math.isnan(self._peak_score):
            self._peak_score = score
        peak_score = round(self._peak_score, 1)

        # 4. Risk Level & Non-Judgmental Labeling (Section 18)
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
            action = "SUSPEND_SESSION"

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

    def reset(self):
        """Reset score counters."""
        self._score = 0.0
        self._peak_score = 0.0
        self._last_ts = time.time()
