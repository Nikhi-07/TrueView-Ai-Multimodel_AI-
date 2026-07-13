"""
Attention Analyzer – TrueView AI

Stateful analyzer that maintains a rolling window of gaze samples to
determine attention status, compute attention percentage, and track
screen focus duration.

Pipeline Position:
    Gaze Estimation → **Attention Analysis** → API Response

State Management:
    This class maintains internal state (rolling window, focus timer).
    One instance should be created per session/user and reused across frames.

Classification:
    - FOCUSED:      attention_score >= 70%  (predominantly looking at screen)
    - DISTRACTED:   attention_score 40-69%  (intermittent screen focus)
    - LOOKING_AWAY: attention_score < 40%   (mostly not looking at screen)
"""

import time
from collections import deque
from ..utils.constants import (
    GazeDirection,
    AttentionStatus,
    ATTENTION_WINDOW_SIZE,
    ATTENTION_FOCUSED_THRESHOLD,
    ATTENTION_DISTRACTED_THRESHOLD,
    FOCUS_STREAK_RESET_FRAMES,
)


class AttentionAnalyzer:
    """
    Stateful attention analyzer with rolling window and focus tracking.
    """

    def __init__(self, window_size: int = ATTENTION_WINDOW_SIZE):
        """
        Initialize the attention analyzer.

        Args:
            window_size: Number of frames in the rolling analysis window.
        """
        self._window_size = window_size
        self._gaze_history = deque(maxlen=window_size)

        # Focus duration tracking
        self._focus_start_time = None
        self._total_focus_duration = 0.0  # cumulative seconds of focus
        self._non_center_streak = 0       # consecutive non-center frames
        self._is_currently_focused = False

        # Session tracking
        self._total_frames = 0
        self._center_frames_total = 0
        self._session_start_time = time.time()

    def analyze(self, gaze_result: dict) -> dict:
        """
        Process a single gaze frame and return attention analysis.

        Args:
            gaze_result: Output from GazeEstimator.estimate() containing
                         gaze_direction, is_center, confidence.

        Returns:
            dict with attention_status, attention_score, focus_duration,
            session_attention_pct, and related metrics.
        """
        is_center = gaze_result.get("is_center", False)
        direction = gaze_result.get("gaze_direction", GazeDirection.CENTER)

        # Update rolling window
        self._gaze_history.append(is_center)
        self._total_frames += 1
        if is_center:
            self._center_frames_total += 1

        # Compute attention score from rolling window
        attention_score = self._compute_attention_score()

        # Classify attention status
        attention_status = self._classify_attention(attention_score)

        # Update focus duration tracking
        self._update_focus_tracking(is_center)

        # Session-level attention percentage
        session_attention_pct = 0.0
        if self._total_frames > 0:
            session_attention_pct = (self._center_frames_total / self._total_frames) * 100.0

        return {
            "attention_status": attention_status,
            "attention_score": round(attention_score, 2),
            "focus_duration_seconds": round(self._total_focus_duration, 1),
            "is_currently_focused": self._is_currently_focused,
            "session_attention_pct": round(session_attention_pct, 2),
            "gaze_direction": direction,
            "frames_analyzed": self._total_frames,
            "window_size": len(self._gaze_history),
        }

    def _compute_attention_score(self) -> float:
        """
        Compute attention score as percentage of CENTER frames in the rolling window.
        """
        if len(self._gaze_history) == 0:
            return 0.0
        center_count = sum(1 for g in self._gaze_history if g)
        return (center_count / len(self._gaze_history)) * 100.0

    @staticmethod
    def _classify_attention(score: float) -> str:
        """
        Classify attention status based on score thresholds.
        """
        if score >= ATTENTION_FOCUSED_THRESHOLD:
            return AttentionStatus.FOCUSED
        elif score >= ATTENTION_DISTRACTED_THRESHOLD:
            return AttentionStatus.DISTRACTED
        else:
            return AttentionStatus.LOOKING_AWAY

    def _update_focus_tracking(self, is_center: bool):
        """
        Track continuous focus duration.
        Focus timer starts when gaze is centered and resets after
        FOCUS_STREAK_RESET_FRAMES consecutive non-center frames.
        """
        now = time.time()

        if is_center:
            self._non_center_streak = 0
            if not self._is_currently_focused:
                # Start new focus period
                self._is_currently_focused = True
                self._focus_start_time = now
            else:
                # Continue existing focus period – accumulate duration
                if self._focus_start_time is not None:
                    elapsed = now - self._focus_start_time
                    self._total_focus_duration += elapsed
                    self._focus_start_time = now
        else:
            self._non_center_streak += 1
            if self._non_center_streak >= FOCUS_STREAK_RESET_FRAMES:
                # Lost focus – finalize current focus period
                if self._is_currently_focused and self._focus_start_time is not None:
                    elapsed = now - self._focus_start_time
                    self._total_focus_duration += elapsed
                self._is_currently_focused = False
                self._focus_start_time = None

    def reset(self):
        """Reset all internal state for a new session."""
        self._gaze_history.clear()
        self._focus_start_time = None
        self._total_focus_duration = 0.0
        self._non_center_streak = 0
        self._is_currently_focused = False
        self._total_frames = 0
        self._center_frames_total = 0
        self._session_start_time = time.time()
