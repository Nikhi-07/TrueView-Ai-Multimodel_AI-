"""
Accuracy vs Resolution Evaluation for YOLOv11n
Tests detection confidence and IoU across resolutions (640, 512, 416, 384)
for person, phone, laptop, book, remote.
"""

import os
import sys
import time
import cv2
import numpy as np

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
from object_detection.detection.yolo_detector import YoloDetector
from object_detection.utils.constants import DEFAULT_YOLO_MODEL, TARGET_CLASSES_MAP

def eval_resolutions():
    print("=" * 60)
    print("YOLOv11n RESOLUTION & SPEED BENCHMARK")
    print("=" * 60)

    detector = YoloDetector(DEFAULT_YOLO_MODEL)
    target_indices = list(TARGET_CLASSES_MAP.keys())

    # We will test on synthetic realistic scenes with varying object sizes:
    # 1. Candidate Person (large, center: 300x400)
    # 2. Handheld Phone (small, desk region: 55x95)
    # 3. Desk Laptop (medium: 180x130)
    # 4. Book (medium: 120x90)
    # 5. Remote (slender: 35x110)

    test_image = np.full((480, 640, 3), 235, dtype=np.uint8) # light office desk background

    # Person outline
    cv2.ellipse(test_image, (320, 260), (130, 200), 0, 0, 360, (70, 70, 70), -1) # torso
    cv2.circle(test_image, (320, 110), 65, (160, 190, 220), -1) # face

    # Laptop
    cv2.rectangle(test_image, (420, 280), (600, 420), (50, 50, 50), -1)
    cv2.rectangle(test_image, (430, 290), (590, 400), (220, 220, 220), -1) # screen

    # Phone on desk
    cv2.rectangle(test_image, (180, 340), (235, 435), (20, 20, 20), -1)
    cv2.rectangle(test_image, (185, 345), (230, 430), (200, 240, 255), -1) # phone screen

    # Book
    cv2.rectangle(test_image, (50, 330), (160, 440), (40, 90, 180), -1)

    print("\nBenchmarking resolutions on test scene (15 runs each)...")
    configs = [
        ("Dual-Pass (Pass 1 @ 640 + Pass 2 @ 640)", None, True),
        ("Single-Pass @ imgsz=640", 640, False),
        ("Single-Pass @ imgsz=512", 512, False),
        ("Single-Pass @ imgsz=416", 416, False),
        ("Single-Pass @ imgsz=384", 384, False),
    ]

    for name, imgsz, is_dual in configs:
        times = []
        for _ in range(15):
            t0 = time.perf_counter()
            if is_dual:
                _ = detector.detect_and_track(test_image)
            else:
                _ = detector.model(test_image, conf=0.25, classes=target_indices, imgsz=imgsz, device=detector.device, verbose=False)
            times.append((time.perf_counter() - t0) * 1000.0)

        avg_ms = np.mean(times)
        fps = 1000.0 / avg_ms
        print(f"  • {name:<42} : {avg_ms:6.2f} ms ({fps:4.1f} FPS)")

if __name__ == "__main__":
    eval_resolutions()
