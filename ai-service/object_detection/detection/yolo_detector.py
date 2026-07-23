"""
YOLO Detector Wrapper – TrueView AI

Loads the YOLOv11 model and runs dual-pass full-frame & high-resolution ROI crop detection.
Pass 1: Full-frame inference.
Pass 2: Bottom-desk ROI crop inference for partially visible or hand-held phones and small devices.
Supports GPU acceleration (CUDA for Nvidia, MPS for Apple Silicon).
"""

import os
import torch
import cv2
import numpy as np
from ultralytics import YOLO
from ..utils.constants import DEFAULT_YOLO_MODEL, DEFAULT_CONFIDENCE_THRESHOLD, TARGET_CLASSES_MAP


class YoloDetector:
    """
    Wrapper for Ultralytics YOLO model loading and dual-pass processing.
    """

    def __init__(self, model_name: str = DEFAULT_YOLO_MODEL):
        if torch.cuda.is_available():
            self.device = "cuda"
        elif torch.backends.mps.is_available():
            self.device = "mps"
        else:
            self.device = "cpu"

        print(f"[YOLO] Loading {model_name} on device: {self.device}")
        self.model = YOLO(model_name)

    def detect_and_track(self, frame, conf: float = DEFAULT_CONFIDENCE_THRESHOLD) -> list:
        """
        Run dual-pass YOLO detection:
        - Pass 1: Full-frame detection
        - Pass 2: High-resolution desk/hand ROI crop detection for small/partially visible phones
        """
        if frame is None:
            return []

        h, w = frame.shape[:2]
        target_indices = list(TARGET_CLASSES_MAP.keys())

        # Pass 1: Full Frame Detection
        detections_full = self._run_inference(frame, conf, target_indices)

        # Pass 2: Bottom 60% ROI Crop (Hand / Lap / Desk region where phones are held)
        roi_top = int(h * 0.35)
        roi = frame[roi_top:h, :]
        detections_roi = []
        if roi.shape[0] > 50 and roi.shape[1] > 50:
            # Use sensitive threshold (0.18) on ROI crop
            raw_roi_dets = self._run_inference(roi, max(0.15, conf * 0.75), target_indices)
            for d in raw_roi_dets:
                bx1, by1, bx2, by2 = d["box"]
                # Remap coordinates back to full frame space
                d["box"] = [bx1, by1 + roi_top, bx2, by2 + roi_top]
                detections_roi.append(d)

        # Combine both passes and apply Non-Maximum Suppression (NMS)
        all_detections = detections_full + detections_roi
        merged_detections = self._nms_merge(all_detections, iou_thresh=0.45)

        return merged_detections

    def _run_inference(self, image_array, conf: float, target_indices: list) -> list:
        try:
            results = self.model(
                source=image_array,
                conf=conf,
                classes=target_indices,
                device=self.device,
                verbose=False
            )
        except Exception as e:
            return []

        if not results or len(results) == 0:
            return []

        parsed = []
        boxes = results[0].boxes
        if boxes is not None:
            for box in boxes:
                cls_idx = int(box.cls[0].item())
                label = TARGET_CLASSES_MAP.get(cls_idx, "other")
                confidence = float(box.conf[0].item())
                xyxy = box.xyxy[0].tolist()
                x1, y1, x2, y2 = map(int, xyxy)

                track_id = None
                if box.id is not None:
                    track_id = int(box.id[0].item())

                parsed.append({
                    "label": label,
                    "confidence": round(confidence, 2),
                    "box": [x1, y1, x2, y2],
                    "track_id": track_id
                })

        return parsed

    @staticmethod
    def _nms_merge(detections: list, iou_thresh: float = 0.45) -> list:
        """
        Applies Non-Maximum Suppression to remove redundant bounding box overlap.
        """
        if not detections:
            return []

        # Sort by confidence descending
        dets = sorted(detections, key=lambda x: x["confidence"], reverse=True)
        keep = []

        while len(dets) > 0:
            best = dets.pop(0)
            keep.append(best)

            remaining = []
            for d in dets:
                if d["label"] == best["label"]:
                    iou = YoloDetector._compute_iou(best["box"], d["box"])
                    if iou < iou_thresh:
                        remaining.append(d)
                else:
                    remaining.append(d)

            dets = remaining

        return keep

    @staticmethod
    def _compute_iou(boxA, boxB) -> float:
        xA = max(boxA[0], boxB[0])
        yA = max(boxA[1], boxB[1])
        xB = min(boxA[2], boxB[2])
        yB = min(boxA[3], boxB[3])

        interArea = max(0, xB - xA) * max(0, yB - yA)
        boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
        boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])

        denom = float(boxAArea + boxBArea - interArea)
        if denom <= 0:
            return 0.0

        return interArea / denom
