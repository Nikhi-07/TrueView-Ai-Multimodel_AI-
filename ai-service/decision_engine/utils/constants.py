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
# Per-Violation Risk Weights (points added per second of violation)
# Higher weight = faster risk climb
# ──────────────────────────────────────────────
VIOLATION_WEIGHTS = {
    "phone_detected":         8.0,   # Critical – rapid escalation
    "multiple_persons":       7.0,   # Critical
    "spoof_attempt":         12.0,   # Highest – immediate critical
    "unknown_face":           6.0,   # High
    "no_face":                4.0,   # Medium
    "looking_away":           2.5,   # Moderate
    "frequent_head_turning":  2.0,   # Moderate
    "speaking_detected":      1.5,   # Low-moderate
    "user_left_camera":       5.0,   # High
}

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
