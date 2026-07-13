"""
Object Detection Constants – TrueView AI

Defines target classes, confidence thresholds, bounding box colors,
and proctoring status parameters.
"""

# ──────────────────────────────────────────────
# Target Object Classes (COCO Dataset IDs)
# ──────────────────────────────────────────────
# Standard COCO 80 class indices:
#  - 0: person
#  - 62: tv (screen, monitor, television)
#  - 63: laptop
#  - 67: cell phone (mobile, tablet)
#  - 73: book
# ──────────────────────────────────────────────
TARGET_CLASSES_MAP = {
    0: "person",
    62: "monitor",
    63: "laptop",
    67: "phone",
    73: "book"
}

# Configurable list of classes we want to alert on/track
PROHIBITED_CLASSES = ["phone", "book"]

# ──────────────────────────────────────────────
# Model Configurations
# ──────────────────────────────────────────────
# Default YOLO model name (Ultralytics auto-downloads this)
DEFAULT_YOLO_MODEL = "yolo11n.pt"  # Lightweight nano model for real-time FPS

# Confidence threshold to register a valid detection
DEFAULT_CONFIDENCE_THRESHOLD = 0.35

# Intersection over Union (IoU) threshold for Non-Maximum Suppression (NMS)
DEFAULT_IOU_THRESHOLD = 0.45

# ──────────────────────────────────────────────
# Visual Colors (BGR format for OpenCV)
# ──────────────────────────────────────────────
DETECTION_COLORS = {
    "person":   (0, 255, 0),      # Green
    "phone":    (0, 0, 255),      # Red (Critical alert)
    "laptop":   (255, 165, 0),    # Orange
    "monitor":  (255, 0, 255),    # Magenta
    "book":     (0, 255, 255),    # Yellow (Warning)
    "other":    (128, 128, 128)   # Gray
}

VIS_BOX_THICKNESS = 2
VIS_FONT_SCALE = 0.5
VIS_FONT_THICKNESS = 1
