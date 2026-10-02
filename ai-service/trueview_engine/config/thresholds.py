"""
TrueView AI Engine – Configuration & Thresholds

Defines system-wide thresholds, adaptive frame execution intervals,
confidence boundaries, risk weights, and context-dependent rule profiles.
"""

from typing import Dict, Any

# ──────────────────────────────────────────────
# Monitoring Context Profiles & Strictness Profiles
# ──────────────────────────────────────────────
CONTEXT_EXAM         = "EXAM"
CONTEXT_INTERVIEW    = "INTERVIEW"
CONTEXT_ONLINE_CLASS = "ONLINE_CLASS"
CONTEXT_MEETING      = "MEETING"
CONTEXT_WORKPLACE    = "WORKPLACE"
CONTEXT_CUSTOM       = "CUSTOM"

# Monitoring Strictness Profiles
PROFILE_RELAXED      = "RELAXED"
PROFILE_MODERATE     = "MODERATE"
PROFILE_STRICT       = "STRICT"

DEFAULT_MONITORING_PROFILE = PROFILE_MODERATE
DEFAULT_CONTEXT            = CONTEXT_EXAM

MONITORING_PROFILES: Dict[str, Dict[str, Any]] = {
    PROFILE_MODERATE: {
        "name": "Moderate Monitoring Profile",
        "description": "Default examination policy: suppresses normal blinks, brief glances, and small head movements while confirming sustained violations and strict security threats.",
        "temporal_windows": {
            "eyes_closed": 2.5,        # Continuous eye closure >= 2.5s required before alert
            "looking_away": 3.0,       # Sustained offscreen glance >= 3.0s
            "no_face": 2.0,            # Face loss grace period > 2.0s
            "speaking": 2.0,           # Sustained voice activity >= 2.0s
            "head_turn": 3.0,          # Sustained head turn >= 3.0s
            "phone": 0.7,              # Multi-frame phone persistence >= 0.7s (fast & stable)
            "multiple_persons": 0.8,   # Multi-frame multi-person persistence >= 0.8s
            "secondary_objects": 0.8,  # Multi-frame prohibited objects >= 0.8s
            "spoof": 0.35,             # Presentation attack / spoof remains strict
        },
        "confidence_thresholds": {
            "gaze_min_observe": 0.70,  # Confidence < 70% ignored
            "gaze_confirm": 0.85,      # Confidence > 85% required for confirmed alert
            "pose_yaw_deg": 35.0,      # Significant head turn angle
            "pose_pitch_deg": 28.0,    # Significant head tilt angle
            "voice_vad": 0.70,         # VAD speech confidence threshold
            "liveness": 0.70,          # Strict anti-spoofing confidence
            "face_recognition": 0.68,
        },
        "cooldown_seconds": {
            "eyes_closed": 8.0,        # 5-10s cooldown prevents repeated alerts
            "looking_away": 8.0,
            "prolonged_distraction": 8.0,
            "offscreen_glance": 8.0,
            "speaking": 8.0,
            "head_turn": 8.0,
            "head_movement": 8.0,
            "phone": 8.0,
            "secondary_objects": 8.0,
            "default": 8.0,
        },
        "severities": {
            "eyes_closed": "MEDIUM",
            "looking_away": "MEDIUM",
            "prolonged_distraction": "MEDIUM",
            "offscreen_glance": "MEDIUM",
            "speaking": "MEDIUM",
            "head_turn": "MEDIUM",
            "head_movement": "MEDIUM",
            "no_face": "HIGH",
            "phone": "HIGH",
            "multiple_persons": "CRITICAL",
            "spoof": "CRITICAL",
            "identity_mismatch": "CRITICAL",
        }
    },
    PROFILE_STRICT: {
        "name": "Strict Monitoring Profile",
        "description": "High-sensitivity proctoring for high-stakes examinations.",
        "temporal_windows": {
            "eyes_closed": 1.0,
            "looking_away": 1.5,
            "no_face": 1.0,
            "speaking": 0.8,
            "head_turn": 1.5,
            "phone": 0.35,
            "multiple_persons": 0.35,
            "secondary_objects": 0.35,
            "spoof": 0.35,
        },
        "confidence_thresholds": {
            "gaze_min_observe": 0.60,
            "gaze_confirm": 0.75,
            "pose_yaw_deg": 25.0,
            "pose_pitch_deg": 20.0,
            "voice_vad": 0.50,
            "liveness": 0.70,
            "face_recognition": 0.68,
        },
        "cooldown_seconds": {
            "eyes_closed": 5.0,
            "looking_away": 5.0,
            "prolonged_distraction": 5.0,
            "offscreen_glance": 5.0,
            "speaking": 5.0,
            "head_turn": 5.0,
            "head_movement": 5.0,
            "phone": 5.0,
            "secondary_objects": 5.0,
            "default": 5.0,
        },
        "severities": {
            "eyes_closed": "MEDIUM",
            "looking_away": "MEDIUM",
            "prolonged_distraction": "HIGH",
            "offscreen_glance": "MEDIUM",
            "speaking": "HIGH",
            "head_turn": "MEDIUM",
            "head_movement": "MEDIUM",
            "no_face": "HIGH",
            "phone": "CRITICAL",
            "multiple_persons": "CRITICAL",
            "spoof": "CRITICAL",
            "identity_mismatch": "CRITICAL",
        }
    },
    PROFILE_RELAXED: {
        "name": "Relaxed Monitoring Profile",
        "description": "Lenient monitoring with wider thresholds and longer grace periods.",
        "temporal_windows": {
            "eyes_closed": 4.0,
            "looking_away": 5.0,
            "no_face": 3.5,
            "speaking": 3.0,
            "head_turn": 5.0,
            "phone": 1.5,
            "multiple_persons": 1.2,
            "secondary_objects": 1.5,
            "spoof": 0.35,
        },
        "confidence_thresholds": {
            "gaze_min_observe": 0.75,
            "gaze_confirm": 0.88,
            "pose_yaw_deg": 42.0,
            "pose_pitch_deg": 35.0,
            "voice_vad": 0.80,
            "liveness": 0.70,
            "face_recognition": 0.68,
        },
        "cooldown_seconds": {
            "eyes_closed": 10.0,
            "looking_away": 10.0,
            "prolonged_distraction": 10.0,
            "offscreen_glance": 10.0,
            "speaking": 10.0,
            "head_turn": 10.0,
            "head_movement": 10.0,
            "phone": 10.0,
            "secondary_objects": 10.0,
            "default": 10.0,
        },
        "severities": {
            "eyes_closed": "LOW",
            "looking_away": "LOW",
            "prolonged_distraction": "MEDIUM",
            "offscreen_glance": "LOW",
            "speaking": "LOW",
            "head_turn": "LOW",
            "head_movement": "LOW",
            "no_face": "MEDIUM",
            "phone": "HIGH",
            "multiple_persons": "HIGH",
            "spoof": "CRITICAL",
            "identity_mismatch": "CRITICAL",
        }
    }
}

def get_monitoring_profile_config(profile_or_session_type: str = None) -> Dict[str, Any]:
    """
    Resolve profile configuration by name or session type.
    Defaults to MODERATE for examinations.
    """
    if not profile_or_session_type:
        return MONITORING_PROFILES[PROFILE_MODERATE]
    key = str(profile_or_session_type).strip().upper()
    if key in MONITORING_PROFILES:
        return MONITORING_PROFILES[key]
    if key == "EXAM":
        return MONITORING_PROFILES[PROFILE_MODERATE]
    if key in ("ONLINE_CLASS", "MEETING"):
        return MONITORING_PROFILES[PROFILE_RELAXED]
    if key in ("INTERVIEW", "WORKPLACE"):
        return MONITORING_PROFILES[PROFILE_MODERATE]
    return MONITORING_PROFILES[PROFILE_MODERATE]

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
        "speaking_detected":      4.0,
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
        "speaking_detected":      0.0,
        "user_left_camera":       5.0,
        "high_background_noise":  1.0,
    },
    CONTEXT_ONLINE_CLASS: {
        "phone_detected":         1.0,
        "multiple_persons":       2.0,
        "spoof_attempt":         10.0,
        "unknown_face":           5.0,
        "no_face":                3.0,
        "looking_away":           3.5,
        "frequent_head_turning":  2.0,
        "speaking_detected":      0.5,
        "user_left_camera":       4.0,
        "high_background_noise":  1.0,
    },
    CONTEXT_MEETING: {
        "phone_detected":         0.0,
        "multiple_persons":       0.0,
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
        "phone_detected":         3.0,
        "multiple_persons":       1.0,
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

# ──────────────────────────────────────────────
# Adaptive Frame Execution Intervals (Skip Frequencies)
# ──────────────────────────────────────────────
FRAME_INTERVAL_FACE_DETECTION   = 1   # Every frame
FRAME_INTERVAL_FACE_MESH        = 1   # Every frame
FRAME_INTERVAL_GAZE             = 1   # Every frame
FRAME_INTERVAL_HEAD_POSE        = 1   # Every frame
FRAME_INTERVAL_OBJECT_DETECTION  = 2   # Every 2nd frame
FRAME_INTERVAL_FACE_RECOGNITION = 2   # Continuous identity verification
FRAME_INTERVAL_LIVENESS         = 2   # Continuous liveness check

# ──────────────────────────────────────────────
# Detection & Confidence Thresholds
# ──────────────────────────────────────────────
THRESHOLD_YUNET_SCORE        = 0.60
THRESHOLD_FACE_RECOGNITION   = 0.68
THRESHOLD_LIVENESS_CONF      = 0.70
THRESHOLD_GAZE_CONF          = 0.70
THRESHOLD_GAZE_CONF_CONFIRM  = 0.85   # Validated signal for alert confirmation (>85%)
THRESHOLD_POSE_CONF          = 0.70
THRESHOLD_POSE_YAW_MODERATE  = 35.0   # Significant head turn angle in moderate mode
THRESHOLD_POSE_PITCH_MODERATE = 28.0  # Significant head tilt angle in moderate mode
THRESHOLD_YOLO_CONF          = 0.45
THRESHOLD_VAD_SPEECH         = 0.50
THRESHOLD_VAD_SPEECH_CONFIRM = 0.70   # Validated voice confidence required for alert

# ──────────────────────────────────────────────
# System-wide Default Temporal Persistence Windows (Seconds)
# Mapped to MODERATE Examination Profile
# ──────────────────────────────────────────────
TEMPORAL_WINDOW_EYES_CLOSED      = 2.5   # Require >= 2.5s closed eyes before alert (filters blinks & brief closures)
TEMPORAL_WINDOW_LOOKING_AWAY     = 3.0   # Require >= 3.0s sustained offscreen gaze
TEMPORAL_WINDOW_NO_FACE          = 2.0   # Grace period: > 2.0s face loss before alert
TEMPORAL_WINDOW_SPEAKING         = 2.0   # Require >= 2.0s continuous speech
TEMPORAL_WINDOW_HEAD_TURN        = 3.0   # Require >= 3.0s sustained head turned
TEMPORAL_WINDOW_PHONE_SECS       = 0.8   # Multi-frame phone persistence
TEMPORAL_WINDOW_MULTIPLE_PERSONS = 0.8   # Multi-frame multi-person persistence
TEMPORAL_WINDOW_SPOOF            = 0.35  # Strict spoof persistence

DEFAULT_ALERT_COOLDOWN_SEC       = 8.0   # 5-10s per-event cooldown

# Risk Decay Rate (points recovered per clean second)
RISK_DECAY_RATE = 1.0
