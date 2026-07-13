"""
Speech Analyzer – TrueView AI

Analyzes VAD states over time (rolling window) to compute durations,
estimate noise warnings, and identify speaking patterns (e.g. continuous speaking,
long silence, high ambient noise).
"""

import time
from collections import deque
from voice_detection.utils.constants import (
    VoiceStatus,
    LONG_SILENCE_THRESHOLD,
    CONTINUOUS_SPEAKING_THRESHOLD,
    HIGH_NOISE_THRESHOLD,
    SPEECH_ROLLING_WINDOW_SIZE
)

class SpeechAnalyzer:
    """
    Stateful analysis tracking cumulative conversational state.
    """
    
    def __init__(self):
        # Rolling state history
        self.status_history = deque(maxlen=SPEECH_ROLLING_WINDOW_SIZE)
        self.rms_history = deque(maxlen=SPEECH_ROLLING_WINDOW_SIZE)
        
        # Duration counters (seconds)
        self.speaking_duration = 0.0
        self.silence_duration = 0.0
        self.noise_duration = 0.0
        self.session_total_duration = 0.0
        
        # Track active timers
        self.consecutive_speaking_time = 0.0
        self.consecutive_silence_time = 0.0
        self.last_update_time = time.time()
        
    def analyze_patterns(self, status: str, rms: float, noise_floor: float, dt: float) -> dict:
        """
        Record the current VAD event and evaluate speech behavior patterns.
        
        Args:
            status: Classified voice status ("speaking", "silence", "background_noise")
            rms: Volume RMS of the current frame
            noise_floor: Active noise floor
            dt: Frame duration in seconds
            
        Returns:
            dict containing proctor speech analytics.
        """
        self.status_history.append(status)
        self.rms_history.append(rms)
        
        # Accumulate session metrics
        self.session_total_duration += dt
        if status == VoiceStatus.SPEAKING:
            self.speaking_duration += dt
            self.consecutive_speaking_time += dt
            self.consecutive_silence_time = 0.0
        elif status == VoiceStatus.SILENCE:
            self.silence_duration += dt
            self.consecutive_silence_time += dt
            self.consecutive_speaking_time = 0.0
        else:
            self.noise_duration += dt
            self.consecutive_silence_time += dt
            self.consecutive_speaking_time = 0.0
            
        # Classify speech pattern
        pattern = "Normal Speech"
        if self.consecutive_speaking_time > CONTINUOUS_SPEAKING_THRESHOLD:
            pattern = "Continuous Speaking"
        elif self.consecutive_silence_time > LONG_SILENCE_THRESHOLD:
            pattern = "Long Silence"
        elif noise_floor > HIGH_NOISE_THRESHOLD:
            pattern = "High Noise Room"
            
        # Simple heuristic for Multiple Voices:
        # Check volume variance only among recent speaking frames to avoid false triggers
        # on silence-to-speech transitions.
        multiple_voices_detected = False
        if status == VoiceStatus.SPEAKING and len(self.rms_history) >= 8:
            recent_statuses = list(self.status_history)[-8:]
            recent_rms = list(self.rms_history)[-8:]
            
            # Keep only the RMS values of frames where the user was actively speaking
            speaking_rms = [r for r, s in zip(recent_rms, recent_statuses) if s == VoiceStatus.SPEAKING]
            
            # We need a sufficient sample size of speaking frames to estimate variance
            if len(speaking_rms) >= 4:
                rms_var = float(max(speaking_rms) - min(speaking_rms))
                # High amplitude envelope variance during active speech suggests multiple speakers/overlaps
                if rms_var > 0.025:
                    multiple_voices_detected = True
                    pattern = "Multiple Voices Detected"
                
        return {
            "speaking_duration": round(self.speaking_duration, 1),
            "silence_duration": round(self.silence_duration, 1),
            "noise_duration": round(self.noise_duration, 1),
            "session_total_duration": round(self.session_total_duration, 1),
            "speaking_ratio_pct": round((self.speaking_duration / max(0.1, self.session_total_duration)) * 100.0, 1),
            "current_pattern": pattern,
            "consecutive_speaking_seconds": round(self.consecutive_speaking_time, 1),
            "consecutive_silence_seconds": round(self.consecutive_silence_time, 1),
            "multiple_voices_detected": multiple_voices_detected
        }
        
    def reset(self):
        """Reset analytical state."""
        self.status_history.clear()
        self.rms_history.clear()
        self.speaking_duration = 0.0
        self.silence_duration = 0.0
        self.noise_duration = 0.0
        self.session_total_duration = 0.0
        self.consecutive_speaking_time = 0.0
        self.consecutive_silence_time = 0.0
        self.last_update_time = time.time()
