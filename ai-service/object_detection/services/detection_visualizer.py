"""
Detection Visualizer – TrueView AI

Draws colored bounding boxes, class labels, confidences, and tracking IDs
on frames using OpenCV. Adds a visual status header summarizing environment flags.
"""

import cv2
import numpy as np
from ..utils.constants import (
    DETECTION_COLORS,
    VIS_BOX_THICKNESS,
    VIS_FONT_SCALE,
    VIS_FONT_THICKNESS
)

class DetectionVisualizer:
    """
    OpenCV drawing utility to overlay object boundaries and classifications.
    """
    
    @staticmethod
    def draw_detections(frame: np.ndarray, detections: list, env_summary: dict) -> np.ndarray:
        """
        Draw bounding boxes and class tags on frame.
        """
        canvas = frame.copy()
        h, w = canvas.shape[:2]
        
        # ── Step 1: Draw individual object boxes ──
        for det in detections:
            label = det["label"]
            conf = det["confidence"]
            x1, y1, x2, y2 = det["box"]
            track_id = det.get("track_id")
            confirmed = det.get("confirmed", False)
            event_type = det.get("type", label.upper())

            # Select color and display tag based on proctoring status
            if event_type == "CANDIDATE":
                color = (0, 255, 0)  # Green
                display_label = "CANDIDATE"
                status_suffix = " [VERIFIED]" if confirmed else " (Validating)"
            elif event_type == "MULTIPLE_PEOPLE":
                if confirmed:
                    color = (0, 0, 255)  # Red (Critical violation)
                    display_label = "MULTIPLE PEOPLE"
                    status_suffix = " [VERIFIED]"
                else:
                    color = (0, 190, 240)  # Amber
                    display_label = "ADDITIONAL PERSON"
                    status_suffix = " (Validating)"
            elif label == "phone":
                if confirmed:
                    color = (0, 0, 255)  # Red (Violation)
                    display_label = "PHONE"
                    status_suffix = " [VERIFIED]"
                else:
                    color = (0, 190, 240)  # Amber
                    display_label = "PHONE"
                    status_suffix = " (Validating)"
            elif label == "remote":
                color = (180, 180, 180)  # Neutral gray
                display_label = "REMOTE"
                status_suffix = " (Remote)"
            elif label in ["laptop", "monitor"]:
                color = (255, 165, 0) if confirmed else (160, 160, 160)
                display_label = label.upper()
                status_suffix = " [VERIFIED]" if confirmed else " (Validating)"
            elif label == "book":
                color = (0, 255, 255) if confirmed else (160, 160, 160)
                display_label = "BOOK/DOC"
                status_suffix = " [VERIFIED]" if confirmed else " (Validating)"
            else:
                color = DETECTION_COLORS.get(label, (128, 128, 128))
                display_label = label.upper()
                status_suffix = ""

            # Draw bounding box
            cv2.rectangle(canvas, (x1, y1), (x2, y2), color, VIS_BOX_THICKNESS)

            # Construct text label
            track_str = f" #{track_id}" if track_id is not None else ""
            tag = f"{display_label}{track_str} {int(conf * 100)}%{status_suffix}"

            # Calculate text size for tag background box
            font = cv2.FONT_HERSHEY_SIMPLEX
            (tw, th), baseline = cv2.getTextSize(
                tag,
                font,
                VIS_FONT_SCALE * 0.9,
                VIS_FONT_THICKNESS
            )

            # Keep label boundary inside frame
            label_y = max(y1, th + 5)

            # Draw background box for tag
            cv2.rectangle(
                canvas,
                (x1, label_y - th - 5),
                (x1 + tw + 8, label_y + baseline),
                color,
                -1
            )

            # Draw tag text
            cv2.putText(
                canvas,
                tag,
                (x1 + 4, label_y - 2),
                font,
                VIS_FONT_SCALE * 0.9,
                (0, 0, 0) if color in [(0, 255, 255), (0, 190, 240), (180, 180, 180), (210, 210, 210)] else (255, 255, 255),
                VIS_FONT_THICKNESS,
                lineType=cv2.LINE_AA
            )
            
        # ── Step 2: Draw Status Overlay Header ──
        prohibited_count = env_summary.get("prohibited_items_count", 0)
        person_status = env_summary.get("person_status", "single_person")
        phone_status = env_summary.get("phone_status", "CLEAN")
        val_persons = env_summary.get("validating_person_count", 0)

        if prohibited_count > 0 or person_status in ("no_person", "multiple_persons"):
            header_color = (0, 0, 255) # Red (Violation alert)
            status_text = "VIOLATION WARNING"
        elif phone_status == "VALIDATING" or val_persons > 0:
            header_color = (0, 190, 240) # Amber (Validating)
            status_text = "VALIDATING DETECTIONS"
        else:
            header_color = (0, 255, 0) # Green (OK)
            status_text = "MONITORING CLEAN"
            
        # Draw top status strip
        cv2.rectangle(canvas, (0, 0), (w, 35), (20, 20, 20), -1)
        cv2.line(canvas, (0, 35), (w, 35), header_color, 1)
        
        # Text details
        font = cv2.FONT_HERSHEY_SIMPLEX
        cv2.putText(
            canvas, 
            status_text, 
            (15, 24), 
            font, 
            0.5, 
            header_color, 
            1, 
            lineType=cv2.LINE_AA
        )
        
        counts_str = f"Candidate: {env_summary.get('person_count', 0)} | Phone: {phone_status} | Prohibited: {prohibited_count}"
        cv2.putText(
            canvas, 
            counts_str, 
            (w - 380, 24), 
            font, 
            0.42, 
            (255, 255, 255), 
            1, 
            lineType=cv2.LINE_AA
        )
        
        return canvas
