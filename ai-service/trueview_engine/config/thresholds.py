"""
TrueView AI Engine – Configuration & Thresholds

Defines system-wide thresholds, adaptive frame execution intervals,
confidence boundaries, risk weights, and context-dependent rule profiles.
"""

from typing import Dict, Any

# ──────────────────────────────────────────────
# Monitoring Context Profiles
# ──────────────────────────────────────────────
CONTEXT_EXAM         = "EXAM"
CONTEXT_INTERVIEW    = "INTERVIEW"
CONTEXT_ONLINE_CLASS = "ONLINE_CLASS"
CONTEXT_MEETING      = "MEETING"
CONTEXT_WORKPLACE    = "WORKPLACE"
CONTEXT_CUSTOM       = "CUSTOM"

# Context-dependent violation weights
CONTEXT_WEIGHT_PROFILES: Dict[str, Dict[str, float]] = {
    CONTEXT_EXAM: {
        "phone_detected":         10.0,
        "multiple_persons":       8.0,
        "spoof_attempt":         12.0,
        "unknown_face":           8.0,
        "no_face":                5.0,
        "looking_away":           3.0,
        "frequent_head_turning":  2.5,
        "speaking_detected":      4.0,  # High violation in exams
        "user_left_camera":       6.0,
        "high_background_noise":  2.0,
    },
    CONTEXT_INTERVIEW: {
        "phone_detected":         6.0,
        "multiple_persons":       5.0,
        "spoof_attempt":         12.0,
        "unknown_face":           8.0,
        "no_face":                4.0,
        "looking_away":           2.0,
        "frequent_head_turning":  1.5,
        "speaking_detected":      0.0,  # Speaking is EXPECTED in interviews!
        "user_left_camera":       5.0,
        "high_background_noise":  1.0,
    },
    CONTEXT_ONLINE_CLASS: {
        "phone_detected":         4.0,
        "multiple_persons":       2.0,
        "spoof_attempt":         10.0,
        "unknown_face":           5.0,
        "no_face":                3.0,
        "looking_away":           3.5,  # Focus on attention tracking
        "frequent_head_turning":  2.0,
        "speaking_detected":      0.5,
        "user_left_camera":       4.0,
        "high_background_noise":  1.0,
    },
    CONTEXT_MEETING: {
        "phone_detected":         1.0,  # Phone not a violation in meetings
        "multiple_persons":       0.0,  # Multiple people allowed
        "spoof_attempt":          8.0,
        "unknown_face":           2.0,
        "no_face":                2.0,
        "looking_away":           1.0,
        "frequent_head_turning":  0.5,
        "speaking_detected":      0.0,
        "user_left_camera":       2.0,
        "high_background_noise":  1.0,
    },
    CONTEXT_WORKPLACE: {
        "phone_detected":         5.0,
        "multiple_persons":       3.0,
        "spoof_attempt":         10.0,
        "unknown_face":           7.0,
        "no_face":                4.0,
        "looking_away":           2.0,
        "frequent_head_turning":  1.5,
        "speaking_detected":      1.0,
        "user_left_camera":       4.0,
        "high_background_noise":  1.5,
    },
}

# Default profile fallback
DEFAULT_CONTEXT = CONTEXT_EXAM

# ──────────────────────────────────────────────
# Adaptive Frame Execution Intervals (Skip Frequencies)
# ──────────────────────────────────────────────
FRAME_INTERVAL_FACE_DETECTION   = 1   # Every frame
FRAME_INTERVAL_FACE_MESH        = 1   # Every frame
FRAME_INTERVAL_GAZE             = 1   # Every frame
FRAME_INTERVAL_HEAD_POSE        = 1   # Every frame
FRAME_INTERVAL_OBJECT_DETECTION  = 2   # Every 2nd frame (high-frequency object detection)
FRAME_INTERVAL_FACE_RECOGNITION = 30  # Periodic identity verification (~every 1s @ 30fps)
FRAME_INTERVAL_LIVENESS         = 30  # Periodic liveness check (~every 1s)

# ──────────────────────────────────────────────
# Detection & Confidence Thresholds
# ──────────────────────────────────────────────
THRESHOLD_YUNET_SCORE        = 0.60
THRESHOLD_FACE_RECOGNITION   = 0.68
THRESHOLD_LIVENESS_CONF      = 0.70
THRESHOLD_GAZE_CONF          = 0.70
THRESHOLD_POSE_CONF          = 0.70
THRESHOLD_YOLO_CONF          = 0.45
THRESHOLD_VAD_SPEECH         = 0.50

# ──────────────────────────────────────────────
# Temporal Persistence Windows (Seconds)
# ──────────────────────────────────────────────
TEMPORAL_WINDOW_PHONE_SECS       = 0.8  # Require 0.8s phone persistence
TEMPORAL_WINDOW_MULTIPLE_PERSONS = 0.8  # Require 0.8s multi-person persistence
TEMPORAL_WINDOW_LOOKING_AWAY     = 1.5  # Require 1.5s looking away before event
TEMPORAL_WINDOW_NO_FACE          = 2.0  # Require 2.0s absent face
TEMPORAL_WINDOW_SPEAKING         = 1.0  # Require 1.0s speech

# Risk Decay Rate (points recovered per clean second)
RISK_DECAY_RATE = 1.0
