"""
Decision Service – Pipeline Orchestrator

The single entry point that:
  1. Receives consolidated telemetry from all AI modules
  2. Runs rules → identifies violations
  3. Updates risk score (weighted + decay)
  4. Evaluates session status
  5. Computes pipeline confidence
  6. Returns a complete decision payload
"""

import time
from decision_engine.rules.rule_engine import RuleEngine
from decision_engine.risk_scoring.risk_scorer import RiskScorer
from decision_engine.evaluation.session_evaluator import SessionEvaluator
from decision_engine.confidence.confidence_calculator import ConfidenceCalculator


class DecisionService:
    """Stateful per-session decision pipeline."""

    def __init__(self):
        self._rule_engine = RuleEngine()
        self._risk_scorer = RiskScorer()
        self._evaluator   = SessionEvaluator()
        self._confidence   = ConfidenceCalculator()
        self._eval_count   = 0
        self._start_ts     = time.time()

    def evaluate(self, telemetry: dict) -> dict:
        """
        Run the full decision pipeline on a telemetry snapshot.

        Args:
            telemetry: consolidated dict with keys from all AI modules:
                face_detected, face_match, gaze_status, head_yaw, head_pitch,
                phone_detected, person_count, is_spoof, is_speaking,
                user_absent, face_confidence, gaze_confidence, ...

        Returns:
            Complete decision payload dict.
        """
        self._eval_count += 1

        # 1. Rule evaluation → list of ViolationResult
        violations = self._rule_engine.evaluate(telemetry)
        violation_ids = [v.rule_id for v in violations]

        # DEBUG: Log every 20th frame so we can see what's triggering
        if self._eval_count % 20 == 0:
            print(f"[Decision #{self._eval_count}] "
                  f"face={telemetry.get('face_detected')}, "
                  f"gaze={telemetry.get('gaze_status')}, "
                  f"yaw={telemetry.get('head_yaw')}, "
                  f"pitch={telemetry.get('head_pitch')}, "
                  f"speak={telemetry.get('is_speaking')}, "
                  f"phone={telemetry.get('phone_detected')}, "
                  f"persons={telemetry.get('person_count')}, "
                  f"absent={telemetry.get('user_absent')} "
                  f"→ violations={violation_ids}, score={self._risk_scorer.score}")

        # 2. Update risk score
        risk_score = self._risk_scorer.update(violation_ids)

        # 3. Compute confidence
        conf = self._confidence.calculate(telemetry)

        # 4. Session evaluation → decision payload
        decision = self._evaluator.evaluate(
            risk_score=risk_score,
            violations=violations,
            confidence=conf["overall"],
        )

        # 5. Enrich with additional metadata
        decision["module_confidence"] = conf["per_module"]
        decision["score_history"]     = self._risk_scorer.history[-60:]   # last 60 samples for chart
        decision["active_violations"] = self._risk_scorer.active_violations
        decision["evaluation_count"]  = self._eval_count
        decision["session_duration"]  = round(time.time() - self._start_ts, 1)

        return decision

    def reset(self):
        """Reset to clean state for a new session."""
        self._risk_scorer.reset()
        self._eval_count = 0
        self._start_ts = time.time()
