"""
Rule Engine – Configurable Violation Rule Evaluator

Evaluates raw telemetry inputs from all AI modules against
a declarative rule table. Returns a list of currently-active
violations with severity metadata.
"""

from __future__ import annotations
from dataclasses import dataclass
from decision_engine.utils.constants import VIOLATION_WEIGHTS


@dataclass
class ViolationResult:
    """Single rule-match output."""
    rule_id: str
    label: str
    severity: str           # LOW | MEDIUM | HIGH | CRITICAL
    weight: float
    reason: str

    def to_dict(self) -> dict:
        return {
            "rule_id": self.rule_id,
            "label": self.label,
            "severity": self.severity,
            "weight": self.weight,
            "reason": self.reason,
        }


# ──────────────────────────────────────────────
# Rule Definitions
# Each rule evaluates real-time telemetry from AI sub-modules.
# ──────────────────────────────────────────────
_RULE_TABLE: list[dict] = [
    {
        "id": "phone_detected",
        "label": "Phone Detected",
        "severity": "CRITICAL",
        "condition": lambda d: d.get("phone_detected") is True,
        "reason": lambda d: "A mobile phone was detected in the camera frame.",
    },
    {
        "id": "multiple_persons",
        "label": "Multiple Persons",
        "severity": "CRITICAL",
        "condition": lambda d: int(d.get("person_count", 1) or 1) > 1,
        "reason": lambda d: f"{d.get('person_count', 0)} persons detected in the frame.",
    },
    {
        "id": "spoof_attempt",
        "label": "Spoof / Liveness Failure",
        "severity": "CRITICAL",
        "condition": lambda d: d.get("is_spoof") is True,
        "reason": lambda d: "Liveness check indicates a potential spoof attempt.",
    },
    {
        "id": "unknown_face",
        "label": "Unknown Face",
        "severity": "HIGH",
        "condition": lambda d: d.get("face_match") is False and d.get("face_detected") is True,
        "reason": lambda d: "Detected face does not match the registered identity.",
    },
    {
        "id": "no_face",
        "label": "No Face Detected",
        "severity": "MEDIUM",
        "condition": lambda d: d.get("face_detected") is False,
        "reason": lambda d: "No face is visible in the camera frame.",
    },
    {
        "id": "looking_away",
        "label": "Looking Away",
        "severity": "MEDIUM",
        "condition": lambda d: (
            str(d.get("gaze_status", "center")).strip().lower() in (
                "left", "right", "up", "down", "away",
                "looking left", "looking right", "looking up", "looking down"
            ) or str(d.get("head_attention", "focused")).strip().lower() in ("looking_away", "distracted")
        ),
        "reason": lambda d: f"User is looking {d.get('gaze_status', 'away')} from the screen.",
    },
    {
        "id": "frequent_head_turning",
        "label": "Frequent Head Turning",
        "severity": "MEDIUM",
        "condition": lambda d: (
            str(d.get("head_direction", "Looking Straight")).strip().lower() in (
                "looking left", "looking right", "looking up", "looking down"
            ) or abs(float(d.get("head_yaw", 0) or 0)) > 30
            or abs(float(d.get("head_pitch", 0) or 0)) > 30
        ),
        "reason": lambda d: f"Head direction is {d.get('head_direction', 'turned')} (yaw={float(d.get('head_yaw', 0) or 0):.0f}°).",
    },
    {
        "id": "speaking_detected",
        "label": "Speaking Detected",
        "severity": "LOW",
        "condition": lambda d: d.get("is_speaking") is True,
        "reason": lambda d: "Voice activity detected during the exam.",
    },
    {
        "id": "user_left_camera",
        "label": "User Left Camera",
        "severity": "HIGH",
        "condition": lambda d: d.get("user_absent") is True and d.get("face_detected") is False,
        "reason": lambda d: "The user appears to have left the camera view.",
    },
]


class RuleEngine:
    """Evaluate telemetry data against the rule table."""

    def __init__(self):
        self._rules = list(_RULE_TABLE)

    def evaluate(self, telemetry: dict) -> list[ViolationResult]:
        """
        Evaluate all rules against the provided telemetry snapshot.

        Args:
            telemetry: dict with keys like face_detected, gaze_status,
                       phone_detected, person_count, etc.

        Returns:
            List of ViolationResult for every triggered rule.
        """
        violations: list[ViolationResult] = []
        for rule in self._rules:
            try:
                if rule["condition"](telemetry):
                    violations.append(ViolationResult(
                        rule_id=rule["id"],
                        label=rule["label"],
                        severity=rule["severity"],
                        weight=VIOLATION_WEIGHTS.get(rule["id"], 1.0),
                        reason=rule["reason"](telemetry),
                    ))
            except Exception:
                # Silently skip malformed rules to avoid pipeline crash
                continue
        return violations
