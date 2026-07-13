"""
YOLO Detector Wrapper – TrueView AI

Loads the YOLOv11 model (auto-downloads if missing) and runs inference.
Supports GPU acceleration (CUDA for Nvidia, MPS for Apple Silicon).
"""

import os
import torch
from ultralytics import YOLO
from ..utils.constants import DEFAULT_YOLO_MODEL, DEFAULT_CONFIDENCE_THRESHOLD, TARGET_CLASSES_MAP

class YoloDetector:
    """
    Wrapper for Ultralytics YOLO model loading and processing.
    """
    
    def __init__(self, model_name: str = DEFAULT_YOLO_MODEL):
        # Determine acceleration device
        if torch.cuda.is_available():
            self.device = "cuda"
        elif torch.backends.mps.is_available():
            self.device = "mps"
        else:
            self.device = "cpu"
            
        print(f"[YOLO] Loading {model_name} on device: {self.device}")
        
        # Load the model
        self.model = YOLO(model_name)
        
    def detect_and_track(self, frame, conf: float = DEFAULT_CONFIDENCE_THRESHOLD) -> list:
        """
        Run YOLO detection and tracking on a single frame.
        
        Args:
            frame: OpenCV image array (BGR)
            conf: Confidence threshold
            
        Returns:
            list of dict: detected objects details including box coordinates,
                          label, confidence, and tracking ID.
        """
        if frame is None:
            return []
            
        # Run track with persistence enabled (ByteTrack/BoT-SORT)
        # classes limits the detection to COCO indexes in our map to save computing time
        target_indices = list(TARGET_CLASSES_MAP.keys())
        
        try:
            results = self.model.track(
                source=frame,
                persist=True,
                conf=conf,
                classes=target_indices,
                device=self.device,
                verbose=False
            )
        except Exception as e:
            # Fallback to standard detect if tracking fails on single-frame stream resets
            # (sometimes tracking fails if session restarts)
            print(f"[YOLO] Tracking exception: {e}. Falling back to standard inference.")
            results = self.model(
                source=frame,
                conf=conf,
                classes=target_indices,
                device=self.device,
                verbose=False
            )
            
        if not results or len(results) == 0:
            return []
            
        detections = []
        result = results[0]
        
        # Parse boxes
        boxes = result.boxes
        if boxes is not None:
            for box in boxes:
                # Class index
                cls_idx = int(box.cls[0].item())
                label = TARGET_CLASSES_MAP.get(cls_idx, "other")
                
                # Confidence
                confidence = float(box.conf[0].item())
                
                # Box coordinates (xyxy format)
                xyxy = box.xyxy[0].tolist()
                x1, y1, x2, y2 = map(int, xyxy)
                
                # Tracking ID (if available)
                track_id = None
                if box.id is not None:
                    track_id = int(box.id[0].item())
                    
                detections.append({
                    "label": label,
                    "confidence": round(confidence, 2),
                    "box": [x1, y1, x2, y2],
                    "track_id": track_id
                })
                
        return detections
