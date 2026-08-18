"""
Context-Aware Policy Engine – TrueView AI Engine

Manages monitoring policies and rule profiles for EXAM, INTERVIEW, ONLINE_CLASS,
MEETING, WORKPLACE, and CUSTOM modes. Dynamically evaluates risk weights, allowed/restricted
objects, speaking tolerances, and alert thresholds without requiring code changes.
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field


@dataclass
class MonitoringPolicy:
    name: str
    phone_allowed: bool = False
    speaking_allowed: bool = False
    multi_person_allowed: bool = False
    max_absence_sec: float = 3.0
    max_distraction_sec: float = 2.0
    require_strict_identity: bool = True
    require_strict_liveness: bool = True
    auto_suspend: bool = False
    restricted_objects: List[str] = field(default_factory=lambda: ["cell phone", "mobile phone", "book", "laptop"])
    risk_weights: Dict[str, float] = field(default_factory=dict)
    alert_threshold_score: float = 60.0


# Pre-built standard policy profiles
POLICY_EXAM = MonitoringPolicy(
    name="EXAM",
    phone_allowed=False,
    speaking_allowed=False,
    multi_person_allowed=False,
    max_absence_sec=2.0,
    max_distraction_sec=1.5,
    require_strict_identity=True,
    require_strict_liveness=True,
    auto_suspend=True,
    restricted_objects=["cell phone", "mobile phone", "book", "notes", "laptop"],
    risk_weights={
        "phone_detected": 15.0,
        "multiple_persons": 12.0,
        "user_absent": 10.0,
        "speaking_detected": 8.0,
        "prolonged_distraction": 5.0,
        "identity_mismatch": 20.0,
        "spoof_detected": 15.0,
    },
    alert_threshold_score=50.0
)

POLICY_INTERVIEW = MonitoringPolicy(
    name="INTERVIEW",
    phone_allowed=False,
    speaking_allowed=True,  # Speaking EXPECTED in interview!
    multi_person_allowed=False,
    max_absence_sec=5.0,
    max_distraction_sec=3.0,
    require_strict_identity=True,
    require_strict_liveness=True,
    auto_suspend=False,
    restricted_objects=["cell phone"],
    risk_weights={
        "phone_detected": 8.0,
        "multiple_persons": 6.0,
        "user_absent": 5.0,
        "speaking_detected": 0.0,  # Zero penalty for speaking
        "prolonged_distraction": 0.5,
        "identity_mismatch": 15.0,
        "spoof_detected": 12.0,
    },
    alert_threshold_score=65.0
)

POLICY_ONLINE_CLASS = MonitoringPolicy(
    name="ONLINE_CLASS",
    phone_allowed=True,
    speaking_allowed=True,
    multi_person_allowed=True,
    max_absence_sec=10.0,
    max_distraction_sec=5.0,
    require_strict_identity=False,
    require_strict_liveness=True,
    auto_suspend=False,
    restricted_objects=[],
    risk_weights={
        "phone_detected": 2.0,
        "multiple_persons": 0.0,
        "user_absent": 2.0,
        "speaking_detected": 0.0,
        "prolonged_distraction": 0.5,
        "identity_mismatch": 5.0,
        "spoof_detected": 10.0,
    },
    alert_threshold_score=75.0
)

POLICY_MEETING = MonitoringPolicy(
    name="MEETING",
    phone_allowed=True,
    speaking_allowed=True,
    multi_person_allowed=True,
    max_absence_sec=15.0,
    max_distraction_sec=10.0,
    require_strict_identity=False,
    require_strict_liveness=True,
    auto_suspend=False,
    restricted_objects=[],
    risk_weights={
        "phone_detected": 0.0,
        "multiple_persons": 0.0,
        "user_absent": 1.0,
        "speaking_detected": 0.0,
        "prolonged_distraction": 0.0,
        "identity_mismatch": 2.0,
        "spoof_detected": 8.0,
    },
    alert_threshold_score=85.0
)

POLICY_WORKPLACE = MonitoringPolicy(
    name="WORKPLACE",
    phone_allowed=False,
    speaking_allowed=True,
    multi_person_allowed=True,
    max_absence_sec=10.0,
    max_distraction_sec=5.0,
    require_strict_identity=True,
    require_strict_liveness=True,
    auto_suspend=False,
    restricted_objects=["cell phone"],
    risk_weights={
        "phone_detected": 5.0,
        "multiple_persons": 1.0,
        "user_absent": 2.0,
        "speaking_detected": 0.0,
        "prolonged_distraction": 0.2,
        "identity_mismatch": 10.0,
        "spoof_detected": 10.0,
    },
    alert_threshold_score=70.0
)


class PolicyEngine:
    """
    Manages active policy profiles and checks event compliance.
    """

    def __init__(self):
        self._policies: Dict[str, MonitoringPolicy] = {
            "EXAM": POLICY_EXAM,
            "INTERVIEW": POLICY_INTERVIEW,
            "ONLINE_CLASS": POLICY_ONLINE_CLASS,
            "MEETING": POLICY_MEETING,
            "WORKPLACE": POLICY_WORKPLACE,
            "CUSTOM": POLICY_EXAM,
        }

    def get_policy(self, session_type: str) -> MonitoringPolicy:
        key = (session_type or "EXAM").upper()
        return self._policies.get(key, POLICY_EXAM)

    def set_custom_policy(self, policy: MonitoringPolicy):
        self._policies["CUSTOM"] = policy

    def evaluate_violation(self, event_type: str, session_type: str) -> Dict[str, Any]:
        policy = self.get_policy(session_type)
        weight = policy.risk_weights.get(event_type.lower(), 2.0)
        
        is_allowed = False
        if event_type == "SPEAKING_DETECTED" and policy.speaking_allowed:
            is_allowed = True
        elif event_type == "PHONE_DETECTED" and policy.phone_allowed:
            is_allowed = True
        elif event_type == "MULTIPLE_PERSONS" and policy.multi_person_allowed:
            is_allowed = True

        return {
            "policy_name": policy.name,
            "weight": 0.0 if is_allowed else weight,
            "is_allowed": is_allowed,
            "alert_threshold": policy.alert_threshold_score
        }
