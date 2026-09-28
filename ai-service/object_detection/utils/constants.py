"""
Object Detection Constants – TrueView AI

Defines target classes, proctoring taxonomy, per-class confidence thresholds,
temporal confirmation windows, and visual rendering parameters.
"""

# ──────────────────────────────────────────────
# Target Object Classes (COCO Dataset IDs)
# ──────────────────────────────────────────────
# Standard COCO 80 class indices supported by yolo11n.pt:
#  - 0:  person
#  - 62: tv (screen, monitor, television)
#  - 63: laptop
#  - 64: mouse
#  - 65: remote (TV / AC remote control)
#  - 66: keyboard
#  - 67: cell phone (smartphone, mobile device)
#  - 73: book (books, notebooks, printed materials)
# ──────────────────────────────────────────────
TARGET_CLASSES_MAP = {
    0: "person",
    62: "monitor",
    63: "laptop",
    64: "mouse",
    65: "remote",
    66: "keyboard",
    67: "phone",
    73: "book"
}

# ──────────────────────────────────────────────
# Proctoring Device Taxonomy Layer
# ──────────────────────────────────────────────
TAXONOMY_MAP = {
    "person": {
        "category": "PERSON",
        "type": "CANDIDATE",
        "secondary_type": "MULTIPLE_PEOPLE",
        "is_prohibited": False,
        "description": "Candidate or human presence in workspace"
    },
    "phone": {
        "category": "ELECTRONIC_DEVICE",
        "type": "MOBILE_PHONE",
        "is_prohibited": True,
        "description": "Smartphones, mobile phones, or handheld communication devices"
    },
    "laptop": {
        "category": "ELECTRONIC_DEVICE",
        "type": "LAPTOP",
        "is_prohibited": True,
        "description": "Secondary laptop or portable computer"
    },
    "monitor": {
        "category": "ELECTRONIC_DEVICE",
        "type": "SECONDARY_DISPLAY",
        "is_prohibited": True,
        "description": "External monitor or secondary display screen"
    },
    "book": {
        "category": "STUDY_MATERIAL",
        "type": "BOOK_OR_DOCUMENT",
        "is_prohibited": True,
        "description": "Textbooks, notebooks, or unauthorized written materials"
    },
    "remote": {
        "category": "PERIPHERAL",
        "type": "REMOTE_CONTROL",
        "is_prohibited": False,
        "description": "TV or AC remote control (non-prohibited household object)"
    },
    "keyboard": {
        "category": "PERIPHERAL",
        "type": "KEYBOARD",
        "is_prohibited": False,
        "description": "Computer keyboard peripheral"
    },
    "mouse": {
        "category": "PERIPHERAL",
        "type": "MOUSE",
        "is_prohibited": False,
        "description": "Computer pointing device"
    }
}

# Prohibited object classes that trigger security events when CONFIRMED
PROHIBITED_CLASSES = ["phone", "book", "laptop"]

# Objects unsupported by COCO 80 weights (must NOT be faked)
UNSUPPORTED_OBJECTS = [
    "calculator",
    "earphones",
    "headphones",
    "airpods",
    "smartwatch",
    "loose_cheat_sheets"
]

# ──────────────────────────────────────────────
# Model Configurations & Per-Class Confidence
# ──────────────────────────────────────────────
DEFAULT_YOLO_MODEL = "yolo11n.pt"
DEFAULT_CONFIDENCE_THRESHOLD = 0.25
DEFAULT_IOU_THRESHOLD = 0.45
DEFAULT_INFERENCE_SIZE = 512          # Balanced 512x512 resolution (43ms CPU / 8ms CUDA)
TARGET_INFERENCE_FPS = 15             # Target real-time dispatch rate (10-15 FPS)

CONFIDENCE_THRESHOLDS = {
    "person_primary": 0.40,      # Primary candidate detection threshold
    "person_secondary": 0.50,    # Additional person threshold (higher to avoid false candidate dups)
    "phone_raw": 0.30,           # Raw detection sensitivity (for validating)
    "phone_confirmed": 0.52,     # Minimum confidence required to confirm phone violation
    "laptop_confirmed": 0.45,
    "monitor_confirmed": 0.45,
    "book_confirmed": 0.40,
    "remote_filter": 0.35,
}

# ──────────────────────────────────────────────
# Temporal Confirmation Parameters
# ──────────────────────────────────────────────
# Phone Confirmation Settings
PHONE_CONFIRMATION_FRAMES = 5         # Consecutive/persistent frames required
PHONE_CONFIRMATION_DURATION_MS = 350  # Duration required (ms)
PHONE_RAW_MIN_CONF = CONFIDENCE_THRESHOLDS["phone_raw"]
PHONE_CONFIRMED_MIN_CONF = CONFIDENCE_THRESHOLDS["phone_confirmed"]
REMOTE_ASPECT_RATIO_THRESHOLD = 2.30  # Elongated aspect ratio typical of TV/AC remotes

# Multiple People Confirmation & De-duplication Settings
PERSON_CONFIRMATION_FRAMES = 6        # Second person must persist >= 6 frames
PERSON_CONFIRMATION_DURATION_MS = 450 # Duration required for multiple person confirmation
PERSON_DEDUP_IOU_THRESHOLD = 0.30     # Merge overlapping person bounding boxes
PERSON_DEDUP_IOM_THRESHOLD = 0.55     # Merge nested boxes (e.g. torso inside candidate)
PERSON_MIN_SEPARATION_PX = 80         # Min centroid distance between distinct persons

# Object Tracking & Lifecycle Parameters
TRACK_MAX_AGE_SECONDS = 1.2           # Inactive track retirement age
TRACK_MATCH_IOU_THRESH = 0.25         # Min IoU to associate bounding boxes
TRACK_MATCH_DIST_THRESH = 90          # Centroid distance fallback (px)
OBJECT_LOST_GRACE_PERIOD_MS = 1000    # Grace period before declaring object CLEARED

# ──────────────────────────────────────────────
# Visual Colors (BGR format for OpenCV)
# ──────────────────────────────────────────────
DETECTION_COLORS = {
    "person":   (0, 255, 0),      # Green (Candidate)
    "phone":    (0, 0, 255),      # Red (Critical violation)
    "laptop":   (255, 165, 0),    # Orange
    "monitor":  (255, 0, 255),    # Magenta
    "book":     (0, 255, 255),    # Yellow
    "remote":   (180, 180, 180),  # Gray/Neutral
    "keyboard": (210, 210, 210),  # Light gray
    "mouse":    (210, 210, 210),  # Light gray
    "validating": (0, 190, 240),  # Amber/Cyan for validating state
    "other":    (128, 128, 128)
}

VIS_BOX_THICKNESS = 2
VIS_FONT_SCALE = 0.5
VIS_FONT_THICKNESS = 1

