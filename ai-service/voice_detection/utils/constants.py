"""
Voice activity and speech analysis constants – TrueView AI

Defines thresholds, rolling window bounds, and classifications for real-time
microphone VAD proctoring.
"""

# ──────────────────────────────────────────────
# Audio Feature Constants
# ──────────────────────────────────────────────
DEFAULT_SAMPLE_RATE    = 16000  # Target sample rate in Hz
DEFAULT_FRAME_DURATION = 0.25   # Frame duration in seconds (250ms chunks)
DEFAULT_BLOCK_SIZE     = int(DEFAULT_SAMPLE_RATE * DEFAULT_FRAME_DURATION) # 4000 samples

# ──────────────────────────────────────────────
# Thresholds
# ──────────────────────────────────────────────
# Minimum RMS energy to be considered potentially speaking (relative to noise floor)
# Human speaking RMS is typically between 0.02 and 0.2
MIN_SPEECH_RMS_OFFSET = 0.008   # Offset added to noise floor for speaking trigger

# Absolute safety boundaries to handle very loud or quiet rooms
ABS_SILENCE_RMS_LIMIT = 0.002   # Below this, always silence (regardless of floor)
ABS_SPEECH_RMS_LIMIT  = 0.025   # Above this, always voice (safety ceiling)

# Zero-Crossing Rate (ZCR) bands for speech validation
# Static static hiss has a very high ZCR (> 0.4)
# Human vowels typically have a very low ZCR (< 0.15)
# Sibilants ('s', 'sh') can have higher ZCR, but we filter out white noise
ZCR_SPEECH_MAX = 0.32

# ──────────────────────────────────────────────
# Noise Floor Settings
# ──────────────────────────────────────────────
NOISE_FLOOR_MEMORY_SIZE = 40    # Frames of history to track background noise floor (10 seconds)
NOISE_FLOOR_MIN         = 0.001  # Absolute floor for noise calculations

# ──────────────────────────────────────────────
# VAD Status Enums
# ──────────────────────────────────────────────
class VoiceStatus:
    SILENCE          = "silence"
    SPEAKING         = "speaking"
    BACKGROUND_NOISE = "background_noise"

# ──────────────────────────────────────────────
# Speech Analyzer Configurations
# ──────────────────────────────────────────────
SPEECH_ROLLING_WINDOW_SIZE = 60  # Frame window size (15 seconds of history at 4Hz)

# Duration limits (in seconds) for speech pattern triggers
LONG_SILENCE_THRESHOLD = 5.0     # Trigger 'Long Silence' warning if silence > 5s
CONTINUOUS_SPEAKING_THRESHOLD = 8.0 # Flag as 'Continuous Speaking' (suspicious) if speaking > 8s
HIGH_NOISE_THRESHOLD = 0.015     # Dynamic noise floor limit trigger
