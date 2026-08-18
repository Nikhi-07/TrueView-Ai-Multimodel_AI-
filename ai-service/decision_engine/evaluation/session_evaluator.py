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
    get_mode_profile
)
from decision_engine.rules.rule_engine import ViolationResult


def _get_risk_tier(score: float) -> dict:
    """Return the tier dict for a given score."""
    for tier in RISK_TIERS:
        if tier["min"] <= score <= tier["max"]:
            return tier
    return RISK_TIERS[-1]


def _classify_status(score: float, mode: str = "EXAM") -> str:
    """Determine session status from current risk score and mode."""
    profile = get_mode_profile(mode)
    high_threshold = profile.get("high_risk_threshold", 80.0)

    if score <= 25:
        return STATUS_CLEAN
    elif score <= 55:
        return STATUS_UNDER_REVIEW
    elif score < high_threshold:
        return STATUS_FLAGGED
    else:
        return STATUS_SUSPENDED if profile.get("auto_suspend", True) else STATUS_FLAGGED


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
        mode: str = "EXAM",
    ) -> dict:
        """
        Produce a complete decision payload.
        """
        profile = get_mode_profile(mode)
        status = _classify_status(risk_score, mode)
        tier   = _get_risk_tier(risk_score)
        
        if status == STATUS_CLEAN:
            action = ACTION_CONTINUE
        elif status == STATUS_UNDER_REVIEW:
            action = ACTION_WARN
        elif status == STATUS_FLAGGED:
            action = ACTION_FLAG
        elif status == STATUS_SUSPENDED:
            action = ACTION_SUSPEND if profile.get("auto_suspend", True) else ACTION_FLAG
        else:
            action = ACTION_CONTINUE

        reasoning = _build_reasoning(violations, risk_score)

        return {
            "risk_score": risk_score,
            "risk_tier": {
                "label": tier["label"],
                "color": tier["color"],
            },
            "session_status": status,
            "action": action,
            "reasoning": reasoning,
            "violation_count": len(violations),
            "violations": [
                {
                    "rule_id": v.rule_id,
                    "label": v.label,
                    "severity": v.severity,
                    "weight": v.weight,
                    "reason": v.reason,
                }
                for v in violations
            ],
            "ai_confidence": round(confidence, 2),
            "mode": profile["strictness"],
        }
