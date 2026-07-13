"""
Face Mesh Landmark Constants.

Defines the 68-point landmark topology and mesh connections,
compatible with the dlib/iBUG 68-point annotation scheme.

Architecture Note:
    This module defines the CONNECTION_MAP used to draw the face mesh.
    When upgrading to MediaPipe 468 landmarks, simply swap this file
    with the MediaPipe-specific connections (FACEMESH_TESSELATION, etc.)
"""

# 68-Point Landmark Index Map (iBUG convention)
# Points 0-16:  Jawline
# Points 17-21: Right eyebrow
# Points 22-26: Left eyebrow
# Points 27-30: Nose bridge
# Points 31-35: Nose tip
# Points 36-41: Right eye
# Points 42-47: Left eye
# Points 48-59: Outer lip
# Points 60-67: Inner lip

JAWLINE = list(range(0, 17))
RIGHT_EYEBROW = list(range(17, 22))
LEFT_EYEBROW = list(range(22, 27))
NOSE_BRIDGE = list(range(27, 31))
NOSE_TIP = list(range(31, 36))
RIGHT_EYE = list(range(36, 42))
LEFT_EYE = list(range(42, 48))
OUTER_LIP = list(range(48, 60))
INNER_LIP = list(range(60, 68))

# Connections for mesh drawing (each is a pair of landmark indices)
CONNECTIONS = {
    "jawline": [(i, i + 1) for i in range(0, 16)],
    "right_eyebrow": [(i, i + 1) for i in range(17, 21)],
    "left_eyebrow": [(i, i + 1) for i in range(22, 26)],
    "nose_bridge": [(i, i + 1) for i in range(27, 30)],
    "nose_tip": [(31, 32), (32, 33), (33, 34), (34, 35), (35, 31)],
    "right_eye": [(36, 37), (37, 38), (38, 39), (39, 40), (40, 41), (41, 36)],
    "left_eye": [(42, 43), (43, 44), (44, 45), (45, 46), (46, 47), (47, 42)],
    "outer_lip": [(i, i + 1) for i in range(48, 59)] + [(59, 48)],
    "inner_lip": [(i, i + 1) for i in range(60, 67)] + [(67, 60)],
}

# Color scheme for each region (BGR for OpenCV, will be converted to hex for frontend)
REGION_COLORS = {
    "jawline":        {"bgr": (200, 200, 200), "hex": "#c8c8c8"},
    "right_eyebrow":  {"bgr": (0, 200, 255),   "hex": "#ffc800"},
    "left_eyebrow":   {"bgr": (0, 200, 255),   "hex": "#ffc800"},
    "nose_bridge":    {"bgr": (0, 255, 200),    "hex": "#c8ff00"},
    "nose_tip":       {"bgr": (0, 255, 200),    "hex": "#c8ff00"},
    "right_eye":      {"bgr": (255, 100, 100),  "hex": "#6464ff"},
    "left_eye":       {"bgr": (255, 100, 100),  "hex": "#6464ff"},
    "outer_lip":      {"bgr": (100, 100, 255),  "hex": "#ff6464"},
    "inner_lip":      {"bgr": (150, 100, 255),  "hex": "#ff64a0"},
}

ALL_REGIONS = list(CONNECTIONS.keys())
