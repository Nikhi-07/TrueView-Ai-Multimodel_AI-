"""
Pose Attention Analyzer – TrueView AI

Stateful analyzer that monitors head movements over a rolling window.
Calculates:
  - Screen Facing Duration: Cumulative time (seconds) facing the screen (Looking Straight).
  - Head Stability: Rolling standard deviation of head angles (higher standard deviation = unstable/rapid movements).
  - Head Movement Frequency: Frequency of directional shifts or large movements per minute.
  - Attention Status: "focused" | "distracted" | "looking_away" based on screen-facing ratio.
"""

import time
import numpy as np
from collections import deque
from ..utils.constants import (
    POSE_ATTENTION_WINDOW_SIZE,
    POSE_STABILITY_WINDOW_SIZE,
    STABILITY_HIGH_THRESHOLD,
    STABILITY_MEDIUM_THRESHOLD,
    THRESHOLD_AWAY_YAW,
    THRESHOLD_AWAY_PITCH
)

class PoseAttentionAnalyzer:
    """
    Stateful analyzer tracking rolling head pose metrics to evaluate user attention.
    """
    
    def __init__(self):
        self.window_size = POSE_ATTENTION_WINDOW_SIZE
        self.stability_window_size = POSE_STABILITY_WINDOW_SIZE
        
        # Deques to hold rolling metrics
        self.straight_history = deque(maxlen=self.window_size)
        self.yaw_history = deque(maxlen=self.stability_window_size)
        self.pitch_history = deque(maxlen=self.stability_window_size)
        self.roll_history = deque(maxlen=self.stability_window_size)
        
        # Timers
        self.session_start_time = time.time()
        self.last_update_time = time.time()
        
        # Continuous metrics
        self.screen_facing_duration = 0.0
        self.total_seconds = 0.0
        
        # Movement counters
        self.direction_changes = 0
        self.last_direction = None  # (is_straight)
        self.movement_events_history = deque(maxlen=120)  # Timestamp of direction changes
        
    def analyze(self, pitch: float, yaw: float, roll: float, is_straight: bool) -> dict:
        """
        Process current frame angles and update attention metrics.
        
        Args:
            pitch: Pitch in degrees
            yaw: Yaw in degrees
            roll: Roll in degrees
            is_straight: Bool indicating if head is facing the screen
            
        Returns:
            dict containing:
                "attention_status": str ("focused" | "distracted" | "looking_away"),
                "screen_facing_ratio": float (0-100),
                "screen_facing_duration_seconds": float,
                "head_stability": str ("High" | "Medium" | "Low"),
                "head_stability_value": float (standard deviation of yaw),
                "movement_frequency_per_minute": float
        """
        now = time.time()
        dt = now - self.last_update_time
        self.last_update_time = now
        
        # Limit dt sanity check to avoid timer issues on pause/resume
        if dt > 2.0 or dt <= 0:
            dt = 0.033  # default ~30fps frame interval
            
        self.total_seconds += dt
        
        # Add to histories
        self.straight_history.append(is_straight)
        self.yaw_history.append(yaw)
        self.pitch_history.append(pitch)
        self.roll_history.append(roll)
        
        # Update Screen Facing Duration
        if is_straight:
            self.screen_facing_duration += dt
            
        # Detect direction changes (movement shifts)
        if self.last_direction is not None and is_straight != self.last_direction:
            self.direction_changes += 1
            self.movement_events_history.append(now)
        self.last_direction = is_straight
        
        # Compute Screen Facing Ratio in rolling window
        facing_count = sum(1 for x in self.straight_history if x)
        total_in_window = len(self.straight_history)
        screen_facing_ratio = (facing_count / total_in_window * 100.0) if total_in_window > 0 else 100.0
        
        # Calculate Head Stability (standard deviation of Yaw/Pitch)
        stability_value = 0.0
        stability_rating = "High"
        if len(self.yaw_history) > 5:
            # Combine standard deviations of Yaw and Pitch to evaluate stability
            std_yaw = np.std(self.yaw_history)
            std_pitch = np.std(self.pitch_history)
            stability_value = float(std_yaw + std_pitch) / 2.0
            
            if stability_value <= STABILITY_HIGH_THRESHOLD:
                stability_rating = "High"
            elif stability_value <= STABILITY_MEDIUM_THRESHOLD:
                stability_rating = "Medium"
            else:
                stability_rating = "Low"
                
        # Calculate Movement Frequency (direction changes in the last 60 seconds)
        # Clear older events
        while self.movement_events_history and now - self.movement_events_history[0] > 60.0:
            self.movement_events_history.popleft()
        movement_frequency = len(self.movement_events_history)
        
        # Determine overall attention status
        # focused: facing screen > 75% of window
        # distracted: facing screen 40% - 75% of window
        # looking_away: facing screen < 40% of window OR currently looking completely away (extreme angles)
        is_currently_extreme_away = (abs(yaw) > THRESHOLD_AWAY_YAW) or (abs(pitch) > THRESHOLD_AWAY_PITCH)
        
        if is_currently_extreme_away:
            attention_status = "looking_away"
        elif screen_facing_ratio >= 75.0:
            attention_status = "focused"
        elif screen_facing_ratio >= 40.0:
            attention_status = "distracted"
        else:
            attention_status = "looking_away"
            
        return {
            "attention_status": attention_status,
            "screen_facing_ratio": round(screen_facing_ratio, 2),
            "screen_facing_duration_seconds": round(self.screen_facing_duration, 1),
            "head_stability": stability_rating,
            "head_stability_value": round(stability_value, 2),
            "movement_frequency_per_minute": float(movement_frequency)
        }
        
    def reset(self):
        """Reset analyzer state."""
        self.straight_history.clear()
        self.yaw_history.clear()
        self.pitch_history.clear()
        self.roll_history.clear()
        self.session_start_time = time.time()
        self.last_update_time = time.time()
        self.screen_facing_duration = 0.0
        self.total_seconds = 0.0
        self.direction_changes = 0
        self.last_direction = None
        self.movement_events_history.clear()
