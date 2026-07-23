"""
Risk Scorer – Weighted Additive Model with Continuous Decay

Maintains a rolling 0–100 risk score that:
  • Always decays toward 0 (continuous baseline recovery)
  • Rises only when violation pressure exceeds decay
  • Minor / momentary violations are absorbed by decay
  • Only sustained or severe violations actually escalate the score
"""

import time
from decision_engine.utils.constants import VIOLATION_WEIGHTS, RISK_DECAY_RATE


class RiskScorer:
    """Stateful per-session risk calculator."""

    def __init__(self):
        self._score: float = 0.0
        self._last_ts: float = time.time()
        self._active_violations: dict[str, float] = {}   # violation → start_ts
        self._score_history: list[dict] = []              # {ts, score}

    # ── public API ────────────────────────────
    def update(self, active_violations: list[str]) -> float:
        """
        Call once per evaluation frame.

        Args:
            active_violations: list of violation keys currently active
                               (e.g. ["phone_detected", "looking_away"])

        Returns:
            Updated risk score (0–100).
        """
        now = time.time()
        dt = min(max(now - self._last_ts, 0.01), 2.0)  # clamp dt to avoid jumps
        self._last_ts = now

        # 1. ALWAYS apply decay first (continuous recovery toward 0)
        decay = RISK_DECAY_RATE * dt
        self._score = max(0.0, self._score - decay)

        # 2. Accumulate risk ONLY from violations that have been
        #    sustained for at least the grace period (0.8s)
        risk_delta = 0.0
        now_set = set(active_violations)

        # Track start times for new violations
        for v in now_set - set(self._active_violations):
            self._active_violations[v] = now

        # Remove cleared violations
        for v in list(self._active_violations.keys()):
            if v not in now_set:
                del self._active_violations[v]

        # Only count violations sustained beyond the grace window
        GRACE_PERIOD = 0.8  # seconds – absorbs momentary false positives
        for v in active_violations:
            start = self._active_violations.get(v, now)
            duration = now - start
            if duration >= GRACE_PERIOD:
                weight = VIOLATION_WEIGHTS.get(v, 1.0)
                risk_delta += weight * dt

        self._score = min(100.0, self._score + risk_delta)

        # 3. Record history for trend graph (keep last 300 samples)
        self._score_history.append({"ts": now, "score": round(self._score, 1)})
        if len(self._score_history) > 300:
            self._score_history = self._score_history[-300:]

        return round(self._score, 1)

    def reset(self):
        """Reset scorer to clean state."""
        self._score = 0.0
        self._last_ts = time.time()
        self._active_violations.clear()
        self._score_history.clear()

    @property
    def score(self) -> float:
        return round(self._score, 1)

    @property
    def history(self) -> list[dict]:
        return list(self._score_history)

    @property
    def active_violations(self) -> dict[str, float]:
        """Returns {violation: duration_seconds}."""
        now = time.time()
        return {
            v: round(now - start, 1)
            for v, start in self._active_violations.items()
        }
