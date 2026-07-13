"""
Behaviour Analysis Constants – TrueView AI

Defines event types, severity levels, threshold rules, and descriptions.
"""

# ──────────────────────────────────────────────
# Severity Levels
# ──────────────────────────────────────────────
SEVERITY_INFO     = "INFO"
SEVERITY_WARNING  = "WARNING"
SEVERITY_CRITICAL = "CRITICAL"

# ──────────────────────────────────────────────
# Behaviour Event Types
# ──────────────────────────────────────────────
EVENT_LOOKING_AWAY          = "Looking Away"
EVENT_FREQUENT_HEAD_TURNING = "Frequent Head Turning"
EVENT_NO_FACE               = "No Face"
EVENT_UNKNOWN_FACE          = "Unknown Face"
EVENT_SPOOF_ATTEMPT         = "Spoof Attempt"
EVENT_MULTIPLE_PERSONS      = "Multiple Persons"
EVENT_PHONE_DETECTED        = "Phone Detected"
EVENT_SPEAKING_DETECTED     = "Speaking Detected"
EVENT_LONG_SILENCE          = "Long Silence"
EVENT_USER_LEFT             = "User Left Camera"
EVENT_SESSION_RESUMED       = "Session Resumed"
EVENT_FACE_RECOVERED        = "Face Recovered"

# ──────────────────────────────────────────────
# Event Descriptions Map
# ──────────────────────────────────────────────
EVENT_DESCRIPTIONS = {
    EVENT_LOOKING_AWAY:          "Candidate's gaze or head pose shifted away from the exam screen.",
    EVENT_FREQUENT_HEAD_TURNING: "Rapid, repetitive head rotation observed.",
    EVENT_NO_FACE:               "No face detected in front of the camera.",
    EVENT_UNKNOWN_FACE:          "Candidate identity mismatch detected (unknown face).",
    EVENT_SPOOF_ATTEMPT:         "Possible spoofing or presentation attack detected.",
    EVENT_MULTIPLE_PERSONS:      "Multiple people detected in the proctor workspace.",
    EVENT_PHONE_DETECTED:        "Prohibited mobile device detected inside active zone.",
    EVENT_SPEAKING_DETECTED:     "Audio capture detected human speech activity.",
    EVENT_LONG_SILENCE:          "Extended duration of quietness observed (normal).",
    EVENT_USER_LEFT:             "The candidate has left the camera frame completely.",
    EVENT_SESSION_RESUMED:       "Exam proctor monitoring has resumed.",
    EVENT_FACE_RECOVERED:        "Face successfully recovered by detector."
}

# ──────────────────────────────────────────────
# Threshold Rules (seconds)
# ──────────────────────────────────────────────
# Minimum consecutive time in a state before triggering the timeline event
THRESHOLD_LOOKING_AWAY      = 1.5   # Trigger alert if looking away for > 1.5 seconds
THRESHOLD_NO_FACE           = 2.0   # Trigger alert if face missing for > 2.0 seconds
THRESHOLD_SPEAKING          = 1.0   # Trigger if speaking > 1.0 seconds
THRESHOLD_UNKNOWN_FACE      = 1.0   # Trigger if recognition mismatches for > 1.0 seconds
THRESHOLD_SPOOF             = 0.5   # Trigger spoof warning if liveness checks fail > 0.5 seconds

# Head movement frequency tracking window (seconds)
HEAD_TURN_WINDOW            = 30.0  # Calculate rotation counts in rolling 30 seconds
HEAD_TURN_COUNT_LIMIT       = 6     # Trigger "Frequent Head Turning" if turns > 6 in 30 seconds
