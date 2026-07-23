"""
Session Evaluator – Classifies session status and produces decision payloads.

Maps the current risk score to a session status tier and
generates a structured decision with reasoning text and action type.
"""

from decision_engine.utils.constants import (
    STATUS_THRESHOLDS,
    STATUS_CLEAN, STATUS_UNDER_REVIEW, STATUS_FLAGGED, STATUS_SUSPENDED,
    ACTION_CONTINUE, ACTION_WARN, ACTION_FLAG, ACTION_SUSPEND,
    RISK_TIERS,
)
from decision_engine.rules.rule_engine import ViolationResult


# Map session status → decision action
_STATUS_ACTION_MAP = {
    STATUS_CLEAN:        ACTION_CONTINUE,
    STATUS_UNDER_REVIEW: ACTION_WARN,
    STATUS_FLAGGED:      ACTION_FLAG,
    STATUS_SUSPENDED:    ACTION_SUSPEND,
}


def _get_risk_tier(score: float) -> dict:
    """Return the tier dict for a given score."""
    for tier in RISK_TIERS:
        if tier["min"] <= score <= tier["max"]:
            return tier
    return RISK_TIERS[-1]


def _classify_status(score: float) -> str:
    """Determine session status from current risk score."""
    for status, (lo, hi) in STATUS_THRESHOLDS.items():
        if lo <= score <= hi:
            return status
    return STATUS_SUSPENDED


def _build_reasoning(violations: list[ViolationResult], score: float) -> str:
    """Build a human-readable reasoning string."""
    if not violations:
        return "No violations detected. Session is running normally."

    parts = [f"Risk score is {score}/100."]
    critical = [v for v in violations if v.severity == "CRITICAL"]
    high     = [v for v in violations if v.severity == "HIGH"]
    medium   = [v for v in violations if v.severity == "MEDIUM"]
    low      = [v for v in violations if v.severity == "LOW"]

    if critical:
        labels = ", ".join(v.label for v in critical)
        parts.append(f"Critical violations: {labels}.")
    if high:
        labels = ", ".join(v.label for v in high)
        parts.append(f"High-severity issues: {labels}.")
    if medium:
        labels = ", ".join(v.label for v in medium)
        parts.append(f"Moderate concerns: {labels}.")
    if low:
        labels = ", ".join(v.label for v in low)
        parts.append(f"Minor observations: {labels}.")

    return " ".join(parts)


class SessionEvaluator:
    """Evaluates the overall session state and produces decisions."""

    def evaluate(
        self,
        risk_score: float,
        violations: list[ViolationResult],
        confidence: float,
    ) -> dict:
        """
        Produce a complete decision payload.

        Returns:
            {
                "risk_score": 72.5,
                "risk_tier": { "label": "High Risk", "color": "#f97316" },
                "session_status": "FLAGGED",
                "action": "FLAG_FOR_REVIEW",
                "reasoning": "...",
                "violation_count": 3,
                "violations": [...],
                "ai_confidence": 0.87,
            }
        """
        status = _classify_status(risk_score)
        tier   = _get_risk_tier(risk_score)
        action = _STATUS_ACTION_MAP.get(status, ACTION_CONTINUE)
        reasoning = _build_reasoning(violations, risk_score)

        return {
            "risk_score": risk_score,
            "risk_tier": {
                "label": tier["label"],
                "color": tier["color"],
                "min":   tier["min"],
                "max":   tier["max"],
            },
            "session_status": status,
            "action": action,
            "reasoning": reasoning,
            "violation_count": len(violations),
            "violations": [v.to_dict() for v in violations],
            "ai_confidence": round(confidence, 2),
        }
