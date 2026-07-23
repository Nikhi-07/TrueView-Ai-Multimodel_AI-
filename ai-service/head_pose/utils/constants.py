"""
Head Pose Constants – TrueView AI

Defines landmark indices, 3D face model points, pitch/yaw/roll thresholds,
rolling window lengths, and drawing styling for the head pose estimator.
"""

import numpy as np

# ──────────────────────────────────────────────
# Landmark Indices (iBUG 68-point convention)
# ──────────────────────────────────────────────
# Reference mapping of key points:
#  - Nose Tip: Last bridge point or center of tip
#  - Chin: Bottom-most jawline point
#  - Left/Right Eye Corners: Outer corners
#  - Left/Right Mouth Corners: Boundary corners
# ──────────────────────────────────────────────
LANDMARK_INDEX_NOSE_TIP   = 30  # Bottom of the nose bridge (nose tip center)
LANDMARK_INDEX_CHIN       = 8   # Center of jaw
LANDMARK_INDEX_LEFT_EYE   = 45  # Person's left eye outer corner (viewer's right)
LANDMARK_INDEX_RIGHT_EYE  = 36  # Person's right eye outer corner (viewer's left)
LANDMARK_INDEX_LEFT_MOUTH  = 54  # Person's left mouth corner (viewer's right)
LANDMARK_INDEX_RIGHT_MOUTH = 48  # Person's right mouth corner (viewer's left)

# ──────────────────────────────────────────────
# Generic 3D Head Model Points (OpenCV / Anthropometric Model)
# Centered at the nose tip (0.0, 0.0, 0.0) in millimeters.
# ──────────────────────────────────────────────
FACE_3D_MODEL_POINTS = np.array([
    (0.0, 0.0, 0.0),             # Nose Tip (30)
    (0.0, 330.0, -65.0),         # Chin (8)
    (-225.0, -170.0, -135.0),    # Right Eye Outer Corner (Viewer's Left) (36)
    (225.0, -170.0, -135.0),     # Left Eye Outer Corner (Viewer's Right) (45)
    (-150.0, 150.0, -125.0),     # Right Mouth Corner (Viewer's Left) (48)
    (150.0, 150.0, -125.0)       # Left Mouth Corner (Viewer's Right) (54)
], dtype=np.float64)

# ──────────────────────────────────────────────
# Orientation Classification Thresholds (in Degrees)
# ──────────────────────────────────────────────
# Negative Yaw: turned Left, Positive Yaw: turned Right (from subject's perspective)
# Negative Pitch: tilted Down, Positive Pitch: tilted Up
# ──────────────────────────────────────────────
THRESHOLD_YAW_LEFT   = -15.0
THRESHOLD_YAW_RIGHT  = 15.0
THRESHOLD_PITCH_UP   = 15.0
THRESHOLD_PITCH_DOWN = -15.0
THRESHOLD_ROLL_TILT  = 15.0  # Absolute roll threshold for head tilt

# Extreme thresholds where the user is looking completely away (e.g. out of screen)
THRESHOLD_AWAY_YAW   = 35.0
THRESHOLD_AWAY_PITCH = 30.0

# ──────────────────────────────────────────────
# Attention Analysis Parameters
# ──────────────────────────────────────────────
POSE_ATTENTION_WINDOW_SIZE = 90     # Rolling window (frames) ≈ 3 sec @ 30 FPS
POSE_STABILITY_WINDOW_SIZE = 30     # Rolling window for stability std-dev

# Thresholds for stability rating
STABILITY_HIGH_THRESHOLD   = 1.5    # Std dev <= 1.5 deg -> High stability
STABILITY_MEDIUM_THRESHOLD = 4.0    # Std dev <= 4.0 deg -> Medium stability
                                    # Std dev > 4.0 deg  -> Low stability (unstable/moving)

# ──────────────────────────────────────────────
# Visualization Styling
# ──────────────────────────────────────────────
VIS_COLORS = {
    "axis_x":          (0, 0, 255),      # Red (Pitch / X axis)
    "axis_y":          (0, 255, 0),      # Green (Yaw / Y axis)
    "axis_z":          (255, 0, 0),      # Blue (Roll / Z axis)
    "reference_dots":  (0, 255, 255),    # Yellow
    "overlay_text":    (255, 255, 255),  # White
    "box_bg":          (20, 20, 20),     # Semi-dark box
    "status_ok":       (0, 255, 0),      # Green
    "status_warning":  (0, 165, 255),    # Orange
    "status_danger":   (0, 0, 255)       # Red
}

VIS_AXIS_LENGTH = 100.0  # Length of projected coordinate axis in millimeters
VIS_LINE_THICKNESS = 2
VIS_DOT_RADIUS = 3
