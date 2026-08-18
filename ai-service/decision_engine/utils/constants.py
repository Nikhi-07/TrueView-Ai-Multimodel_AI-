"""
Decision Engine Constants – TrueView AI

Defines risk tiers, per-violation weights, decay parameters,
session status labels, and decision action types.
"""

# ──────────────────────────────────────────────
# Risk Score Tiers (0–100)
# ──────────────────────────────────────────────
RISK_TIERS = [
    {"min": 0,  "max": 20,  "label": "Very Safe",     "color": "#22c55e"},
    {"min": 21, "max": 40,  "label": "Low Risk",      "color": "#84cc16"},
    {"min": 41, "max": 60,  "label": "Medium Risk",    "color": "#eab308"},
    {"min": 61, "max": 80,  "label": "High Risk",      "color": "#f97316"},
    {"min": 81, "max": 100, "label": "Critical Risk",  "color": "#ef4444"},
]

# ──────────────────────────────────────────────
# Session Status Classifications
# ──────────────────────────────────────────────
STATUS_CLEAN        = "CLEAN"
STATUS_UNDER_REVIEW = "UNDER_REVIEW"
STATUS_FLAGGED      = "FLAGGED"
STATUS_SUSPENDED    = "SUSPENDED"

# Risk score → session status thresholds
STATUS_THRESHOLDS = {
    STATUS_CLEAN:        (0, 25),
    STATUS_UNDER_REVIEW: (26, 55),
    STATUS_FLAGGED:      (56, 79),
    STATUS_SUSPENDED:    (80, 100),
}

# ──────────────────────────────────────────────
# Decision Actions
# ──────────────────────────────────────────────
ACTION_CONTINUE      = "CONTINUE"
ACTION_WARN          = "WARN"
ACTION_FLAG          = "FLAG_FOR_REVIEW"
ACTION_SUSPEND       = "SUSPEND_SESSION"

# ──────────────────────────────────────────────
# Centralized Mode Profiles & Strictness Config
# ──────────────────────────────────────────────
MODE_PROFILES = {
    "EXAM": {
        "strictness": "STRICT",
        "liveness_required": True,
        "face_required": True,
        "multiple_face_detection": True,
        "phone_detection": True,
        "object_detection": True,
        "gaze_monitoring": True,
        "head_pose_monitoring": True,
        "voice_monitoring": True,
        "prolonged_distraction": True,
        "suspicious_behavior": True,
        "spoof_detection": True,
        "auto_flag": True,
        "auto_suspend": True,
        "high_risk_threshold": 80.0,
        "speaking_allowed": False,
        "multi_person_allowed": False,
        "weights": {
            "phone_detected": 15.0,
            "multiple_persons": 12.0,
            "spoof_attempt": 15.0,
            "unknown_face": 8.0,
            "no_face": 5.0,
            "looking_away": 3.0,
            "frequent_head_turning": 2.5,
            "speaking_detected": 8.0,
            "user_left_camera": 6.0,
        }
    },
    "INTERVIEW": {
        "strictness": "MODERATE",
        "liveness_required": True,
        "face_required": True,
        "multiple_face_detection": True,
        "phone_detection": True,
        "object_detection": True,
        "gaze_monitoring": True,
        "head_pose_monitoring": True,
        "voice_monitoring": True,
        "prolonged_distraction": True,
        "suspicious_behavior": True,
        "spoof_detection": True,
        "auto_flag": True,
        "auto_suspend": False,
        "high_risk_threshold": 85.0,
        "speaking_allowed": True,
        "multi_person_allowed": False,
        "weights": {
            "phone_detected": 8.0,
            "multiple_persons": 6.0,
            "spoof_attempt": 12.0,
            "unknown_face": 6.0,
            "no_face": 4.0,
            "looking_away": 0.5,
            "frequent_head_turning": 0.5,
            "speaking_detected": 0.0,
            "user_left_camera": 4.0,
        }
    },
    "ONLINE_CLASS": {
        "strictness": "RELAXED",
        "liveness_required": True,
        "face_required": True,
        "multiple_face_detection": True,
        "phone_detection": True,
        "object_detection": True,
        "gaze_monitoring": False,
        "head_pose_monitoring": False,
        "voice_monitoring": False,
        "prolonged_distraction": False,
        "suspicious_behavior": True,
        "spoof_detection": True,
        "auto_flag": False,
        "auto_suspend": False,
        "high_risk_threshold": 90.0,
        "speaking_allowed": True,
        "multi_person_allowed": True,
        "weights": {
            "phone_detected": 2.0,
            "multiple_persons": 0.0,
            "spoof_attempt": 10.0,
            "unknown_face": 3.0,
            "no_face": 2.0,
            "looking_away": 0.2,
            "frequent_head_turning": 0.1,
            "speaking_detected": 0.0,
            "user_left_camera": 2.0,
        }
    },
    "MEETING": {
        "strictness": "MINIMAL",
        "liveness_required": True,
        "face_required": True,
        "multiple_face_detection": False,
        "phone_detection": False,
        "object_detection": False,
        "gaze_monitoring": False,
        "head_pose_monitoring": False,
        "voice_monitoring": False,
        "prolonged_distraction": False,
        "suspicious_behavior": False,
        "spoof_detection": True,
        "auto_flag": False,
        "auto_suspend": False,
        "high_risk_threshold": 95.0,
        "speaking_allowed": True,
        "multi_person_allowed": True,
        "weights": {
            "phone_detected": 0.0,
            "multiple_persons": 0.0,
            "spoof_attempt": 8.0,
            "unknown_face": 2.0,
            "no_face": 1.0,
            "looking_away": 0.0,
            "frequent_head_turning": 0.0,
            "speaking_detected": 0.0,
            "user_left_camera": 1.0,
        }
    },
    "WORKPLACE": {
        "strictness": "MONITORED",
        "liveness_required": True,
        "face_required": True,
        "multiple_face_detection": True,
        "phone_detection": True,
        "object_detection": True,
        "gaze_monitoring": False,
        "head_pose_monitoring": False,
        "voice_monitoring": False,
        "prolonged_distraction": False,
        "suspicious_behavior": True,
        "spoof_detection": True,
        "auto_flag": False,
        "auto_suspend": False,
        "high_risk_threshold": 90.0,
        "speaking_allowed": True,
        "multi_person_allowed": True,
        "weights": {
            "phone_detected": 5.0,
            "multiple_persons": 1.0,
            "spoof_attempt": 10.0,
            "unknown_face": 4.0,
            "no_face": 2.0,
            "looking_away": 0.2,
            "frequent_head_turning": 0.2,
            "speaking_detected": 0.0,
            "user_left_camera": 2.0,
        }
    }
}
# Alias CLASS to ONLINE_CLASS
MODE_PROFILES["CLASS"] = MODE_PROFILES["ONLINE_CLASS"]

def get_mode_profile(mode_name: str) -> dict:
    key = (mode_name or "EXAM").upper().replace(" ", "_")
    return MODE_PROFILES.get(key, MODE_PROFILES["EXAM"])

# Default fallback weights (used when no mode is provided)
VIOLATION_WEIGHTS = MODE_PROFILES["EXAM"]["weights"]

# ──────────────────────────────────────────────
# Risk Decay Rate (points recovered per second of clean behavior)
# ──────────────────────────────────────────────
RISK_DECAY_RATE = 0.8   # Points recovered per second of clean behavior

# ──────────────────────────────────────────────
# Confidence Weights (relative importance of each AI module)
# ──────────────────────────────────────────────
MODULE_CONFIDENCE_WEIGHTS = {
    "face_detection":    0.20,
    "gaze_tracking":     0.20,
    "head_pose":         0.15,
    "voice_detection":   0.15,
    "object_detection":  0.20,
    "behaviour_analysis": 0.10,
}
