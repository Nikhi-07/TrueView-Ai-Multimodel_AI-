"""
TrueView AI - Object Detection Pipeline Profiler
Measures exact breakdown across all pipeline stages:
- Decode / Preprocessing
- YOLO Model Inference (Pass 1 vs Pass 2, imgsz=640 vs 512 vs 416)
- Post-processing & Enhanced NMS
- Object Tracking & Spatial Association
- Temporal Validation & Environment Monitoring
"""

import os
import sys
import time
import base64
import numpy as np
import cv2

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from object_detection.detection.yolo_detector import YoloDetector
from object_detection.tracking.object_tracker import ObjectTracker
from object_detection.services.environment_monitor import EnvironmentMonitor
from object_detection.utils.constants import DEFAULT_YOLO_MODEL, TARGET_CLASSES_MAP

def profile():
    print("=" * 60)
    print("OBJECT DETECTION PIPELINE PROFILING REPORT")
    print("=" * 60)

    # 1. Check Hardware & Device
    import torch
    cuda_avail = torch.cuda.is_available()
    device = "CUDA (GPU)" if cuda_avail else "CPU"
    print(f"Inference Device: {device}")
    print(f"PyTorch Version:  {torch.__version__}")
    print(f"YOLO Model:       {DEFAULT_YOLO_MODEL}\n")

    detector = YoloDetector(DEFAULT_YOLO_MODEL)
    tracker = ObjectTracker()
    monitor = EnvironmentMonitor()

    # Generate test frame simulating camera feed (640x480 BGR)
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    # Add human-like shape and phone-like shape
    cv2.rectangle(frame, (180, 80), (460, 470), (120, 160, 200), -1)
    cv2.circle(frame, (320, 150), 60, (180, 200, 220), -1)
    cv2.rectangle(frame, (230, 320), (280, 410), (30, 30, 30), -1)

    # Base64 encoding
    _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    b64_str = base64.b64encode(buf).decode('utf-8')

    # Warmup runs
    for _ in range(3):
        detector.detect_and_track(frame)

    N = 25
    t_decode_list = []
    t_pass1_list = []
    t_pass2_list = []
    t_nms_list = []
    t_track_list = []
    t_env_list = []
    t_total_list = []

    h, w = frame.shape[:2]
    target_indices = list(TARGET_CLASSES_MAP.keys())

    for _ in range(N):
        t0 = time.perf_counter()

        # Step A & B: Decode / Preprocessing
        tb0 = time.perf_counter()
        img_bytes = base64.b64decode(b64_str)
        np_arr = np.frombuffer(img_bytes, np.uint8)
        decoded = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        t_decode = (time.perf_counter() - tb0) * 1000.0
        t_decode_list.append(t_decode)

        # Step C1: YOLO Pass 1 (Full Frame)
        tp1_0 = time.perf_counter()
        res_full = detector.model(
            source=decoded,
            conf=0.25,
            classes=target_indices,
            device=detector.device,
            verbose=False
        )
        # Parse boxes
        parsed_full = []
        if res_full and res_full[0].boxes:
            for b in res_full[0].boxes:
                cls_idx = int(b.cls[0].item())
                label = TARGET_CLASSES_MAP.get(cls_idx, "other")
                conf = float(b.conf[0].item())
                x1, y1, x2, y2 = map(int, b.xyxy[0].tolist())
                bw = max(1, x2 - x1)
                bh = max(1, y2 - y1)
                ar = round(max(bw, bh) / float(min(bw, bh)), 2)
                parsed_full.append({"label": label, "confidence": conf, "box": [x1, y1, x2, y2], "aspect_ratio": ar})
        t_pass1 = (time.perf_counter() - tp1_0) * 1000.0
        t_pass1_list.append(t_pass1)

        # Step C2: YOLO Pass 2 (Desk/Hand ROI Crop)
        tp2_0 = time.perf_counter()
        roi_top = int(h * 0.35)
        roi = decoded[roi_top:h, :]
        res_roi = detector.model(
            source=roi,
            conf=0.30,
            classes=target_indices,
            device=detector.device,
            verbose=False
        )
        parsed_roi = []
        if res_roi and res_roi[0].boxes:
            for b in res_roi[0].boxes:
                cls_idx = int(b.cls[0].item())
                label = TARGET_CLASSES_MAP.get(cls_idx, "other")
                conf = float(b.conf[0].item())
                x1, y1, x2, y2 = map(int, b.xyxy[0].tolist())
                bw = max(1, x2 - x1)
                bh = max(1, y2 - y1)
                ar = round(max(bw, bh) / float(min(bw, bh)), 2)
                parsed_roi.append({"label": label, "confidence": conf, "box": [x1, y1 + roi_top, x2, y2 + roi_top], "aspect_ratio": ar})
        t_pass2 = (time.perf_counter() - tp2_0) * 1000.0
        t_pass2_list.append(t_pass2)

        # Step D: NMS & Post-processing
        tnms_0 = time.perf_counter()
        all_dets = parsed_full + parsed_roi
        merged = YoloDetector._nms_merge(all_dets, iou_thresh=0.45)
        t_nms = (time.perf_counter() - tnms_0) * 1000.0
        t_nms_list.append(t_nms)

        # Step E: Tracking
        ttrk_0 = time.perf_counter()
        tracked = tracker.update_tracks(merged)
        t_track = (time.perf_counter() - ttrk_0) * 1000.0
        t_track_list.append(t_track)

        # Step F: Temporal Validation & Environment Monitoring
        tenv_0 = time.perf_counter()
        env = monitor.monitor_environment(tracked)
        t_env = (time.perf_counter() - tenv_0) * 1000.0
        t_env_list.append(t_env)

        t_total = (time.perf_counter() - t0) * 1000.0
        t_total_list.append(t_total)

    avg_decode = np.mean(t_decode_list)
    avg_pass1 = np.mean(t_pass1_list)
    avg_pass2 = np.mean(t_pass2_list)
    avg_yolo = avg_pass1 + avg_pass2
    avg_nms = np.mean(t_nms_list)
    avg_track = np.mean(t_track_list)
    avg_env = np.mean(t_env_list)
    avg_total = np.mean(t_total_list)

    print("--- DETAILED STAGE TIMINGS (Averages over 25 frames) ---")
    print(f"A. Frame Acquisition / Decode (Base64 -> Mat): {avg_decode:6.2f} ms ({avg_decode/avg_total*100:4.1f}%)")
    print(f"B. YOLO Pass 1 (Full Frame Inference, imgsz=640): {avg_pass1:6.2f} ms ({avg_pass1/avg_total*100:4.1f}%)")
    print(f"C. YOLO Pass 2 (Desk ROI Crop Inference):         {avg_pass2:6.2f} ms ({avg_pass2/avg_total*100:4.1f}%)")
    print(f"   => TOTAL YOLO INFERENCE (Pass 1 + Pass 2):      {avg_yolo:6.2f} ms ({avg_yolo/avg_total*100:4.1f}%)")
    print(f"D. Post-processing & Enhanced NMS Merge:           {avg_nms:6.2f} ms ({avg_nms/avg_total*100:4.1f}%)")
    print(f"E. Object Tracking (Spatial Association):          {avg_track:6.2f} ms ({avg_track/avg_total*100:4.1f}%)")
    print(f"F. Temporal Validation & State Machine:            {avg_env:6.2f} ms ({avg_env/avg_total*100:4.1f}%)")
    print("-" * 60)
    print(f"TOTAL BACKEND PIPELINE TIME:                       {avg_total:6.2f} ms (100.0%)")
    print(f"BACKEND PROCESSING FPS:                            {1000.0 / avg_total:6.1f} FPS")
    print("=" * 60)

    # ────────────────────────────────────────────────────────────
    # Now evaluate alternative resolutions and single-pass vs dual-pass
    # ────────────────────────────────────────────────────────────
    print("\nEVALUATING INFERENCE OPTIMIZATION OPTIONS:")
    for imgsz in [640, 512, 416, 384]:
        t_sp = []
        for _ in range(15):
            t_s = time.perf_counter()
            _ = detector.model(decoded, conf=0.25, classes=target_indices, imgsz=imgsz, device=detector.device, verbose=False)
            t_sp.append((time.perf_counter() - t_s) * 1000.0)
        print(f"  • Single-pass (Full frame) @ imgsz={imgsz}: {np.mean(t_sp):.2f} ms ({1000.0/np.mean(t_sp):.1f} FPS)")

if __name__ == "__main__":
    profile()
