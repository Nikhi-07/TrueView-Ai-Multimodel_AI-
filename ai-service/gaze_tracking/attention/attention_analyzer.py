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
    EyeStatus,
    FocusState,
    ATTENTION_WINDOW_SIZE,
    ATTENTION_FOCUSED_THRESHOLD,
    ATTENTION_DISTRACTED_THRESHOLD,
    FOCUS_STREAK_RESET_FRAMES,
    BLINK_MAX_DURATION_SECONDS,
)


class AttentionAnalyzer:
    """
    Stateful attention analyzer with eye openness, blink detection,
    prolonged eye closure penalty, and temporally smoothed focus tracking.
    """

    def __init__(self, window_size: int = ATTENTION_WINDOW_SIZE):
        self._window_size = window_size
        self._gaze_history = deque(maxlen=window_size)

        # Eye openness & blink tracking
        self._eyes_closed_start_time = None
        self._consecutive_closed_frames = 0
        self._current_eye_status = EyeStatus.OPEN

        # Focus duration tracking
        self._focus_start_time = None
        self._total_focus_duration = 0.0
        self._non_center_streak = 0
        self._is_currently_focused = False

        # Attention score with temporal smoothing
        self._smoothed_attention_score = 100.0

        # Session tracking
        self._total_frames = 0
        self._center_frames_total = 0
        self._session_start_time = time.time()

    def analyze(self, gaze_result: dict) -> dict:
        """
        Process a single gaze frame and return attention analysis.
        Checks eye openness and blinks BEFORE gaze direction.
        """
        now = time.time()
        self._total_frames += 1

        face_detected = gaze_result.get("face_detected", True)

        # ── 0. Face Not Detected Check ──
        if not face_detected:
            self._eyes_closed_start_time = None
            self._consecutive_closed_frames = 0
            self._current_eye_status = EyeStatus.UNKNOWN
            self._is_currently_focused = False
            self._update_focus_tracking(is_center=False)

            self._gaze_history.append(0.0)
            raw_window_score = (sum(self._gaze_history) / len(self._gaze_history)) * 100.0
            alpha = 0.20
            self._smoothed_attention_score = max(0.0, (1.0 - alpha) * self._smoothed_attention_score + alpha * raw_window_score - 2.5)

            session_attention_pct = 0.0
            if self._total_frames > 0:
                session_attention_pct = (self._center_frames_total / self._total_frames) * 100.0

            return {
                "eye_status": EyeStatus.UNKNOWN,
                "attention_status": AttentionStatus.FACE_NOT_DETECTED,
                "focus_state": FocusState.FACE_NOT_DETECTED,
                "attention_score": round(max(0.0, min(100.0, self._smoothed_attention_score)), 1),
                "focus_duration_seconds": round(self._total_focus_duration, 1),
                "is_currently_focused": False,
                "session_attention_pct": round(session_attention_pct, 1),
                "gaze_direction": GazeDirection.UNKNOWN,
                "frames_analyzed": self._total_frames,
                "window_size": len(self._gaze_history),
            }

        eyes_closed = gaze_result.get("eyes_closed", False)
        is_center = gaze_result.get("is_center", False) and not eyes_closed
        direction = gaze_result.get("gaze_direction", GazeDirection.CENTER)

        # ── 1. Eye Openness & Blink Discrimination ──
        if eyes_closed:
            if self._eyes_closed_start_time is None:
                self._eyes_closed_start_time = now
                self._consecutive_closed_frames = 1
            else:
                self._consecutive_closed_frames += 1

            closure_duration = now - self._eyes_closed_start_time

            if closure_duration <= BLINK_MAX_DURATION_SECONDS:
                # Brief eye closure treated as natural human blink
                eye_status = EyeStatus.BLINKING
                attention_status = AttentionStatus.BLINKING
                focus_state = FocusState.BLINKING
                direction = GazeDirection.UNKNOWN
                # Normal blinks do not penalize attention
                is_sample_focused = True
            else:
                # Prolonged eye closure (sleep, inattention, or cheating)
                eye_status = EyeStatus.CLOSED
                attention_status = AttentionStatus.EYES_CLOSED
                focus_state = FocusState.EYES_CLOSED
                direction = GazeDirection.UNKNOWN
                is_sample_focused = False
                self._update_focus_tracking(is_center=False)
        else:
            # Eyes are open or partially closed
            self._eyes_closed_start_time = None
            self._consecutive_closed_frames = 0
            eye_status = gaze_result.get("eye_status", EyeStatus.OPEN)

            if is_center:
                is_sample_focused = True
                self._center_frames_total += 1
                self._update_focus_tracking(is_center=True)
                attention_status = AttentionStatus.FOCUSED
                focus_state = FocusState.FOCUSED
            else:
                is_sample_focused = False
                self._update_focus_tracking(is_center=False)
                if direction in (GazeDirection.LEFT, GazeDirection.RIGHT):
                    focus_state = FocusState.OFFSCREEN
                else:
                    focus_state = FocusState.DISTRACTED
                attention_status = self._classify_attention(self._smoothed_attention_score)

        self._current_eye_status = eye_status

        # ── 2. Temporal Smoothing of Attention Score ──
        self._gaze_history.append(1.0 if is_sample_focused else 0.0)
        raw_window_score = (sum(self._gaze_history) / len(self._gaze_history)) * 100.0

        if eye_status == EyeStatus.CLOSED:
            # Accelerate score decay during prolonged closure
            self._smoothed_attention_score = max(0.0, self._smoothed_attention_score * 0.90 - 2.5)
        elif eye_status == EyeStatus.BLINKING:
            # Keep attention stable during a blink
            pass
        else:
            # Smooth EMA toward window score
            alpha = 0.15
            self._smoothed_attention_score = (1.0 - alpha) * self._smoothed_attention_score + alpha * raw_window_score

        # Session-level attention percentage
        session_attention_pct = 0.0
        if self._total_frames > 0:
            session_attention_pct = (self._center_frames_total / self._total_frames) * 100.0

        return {
            "eye_status": eye_status,
            "attention_status": attention_status,
            "focus_state": focus_state,
            "attention_score": round(max(0.0, min(100.0, self._smoothed_attention_score)), 1),
            "focus_duration_seconds": round(self._total_focus_duration, 1),
            "is_currently_focused": self._is_currently_focused and eye_status == EyeStatus.OPEN,
            "session_attention_pct": round(session_attention_pct, 1),
            "gaze_direction": direction if eye_status == EyeStatus.OPEN else GazeDirection.UNKNOWN,
            "frames_analyzed": self._total_frames,
            "window_size": len(self._gaze_history),
        }

    @staticmethod
    def _classify_attention(score: float) -> str:
        """Classify attention status based on score thresholds."""
        if score >= ATTENTION_FOCUSED_THRESHOLD:
            return AttentionStatus.FOCUSED
        elif score >= ATTENTION_DISTRACTED_THRESHOLD:
            return AttentionStatus.DISTRACTED
        else:
            return AttentionStatus.LOOKING_AWAY

    def _update_focus_tracking(self, is_center: bool):
        """Track continuous focus duration with streak resets."""
        now = time.time()

        if is_center:
            self._non_center_streak = 0
            if not self._is_currently_focused:
                self._is_currently_focused = True
                self._focus_start_time = now
            else:
                if self._focus_start_time is not None:
                    elapsed = now - self._focus_start_time
                    self._total_focus_duration += elapsed
                    self._focus_start_time = now
        else:
            self._non_center_streak += 1
            if self._non_center_streak >= FOCUS_STREAK_RESET_FRAMES:
                if self._is_currently_focused and self._focus_start_time is not None:
                    elapsed = now - self._focus_start_time
                    self._total_focus_duration += elapsed
                self._is_currently_focused = False
                self._focus_start_time = None

    def reset(self):
        """Reset all internal state for a new session."""
        self._gaze_history.clear()
        self._eyes_closed_start_time = None
        self._consecutive_closed_frames = 0
        self._current_eye_status = EyeStatus.OPEN
        self._focus_start_time = None
        self._total_focus_duration = 0.0
        self._non_center_streak = 0
        self._is_currently_focused = False
        self._smoothed_attention_score = 100.0
        self._total_frames = 0
        self._center_frames_total = 0
        self._session_start_time = time.time()
