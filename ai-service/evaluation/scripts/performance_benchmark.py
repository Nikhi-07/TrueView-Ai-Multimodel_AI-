"""
TrueView AI - Module Performance Benchmark Runner
Measures average latency, P95 latency, and FPS for each AI module.
"""

import time
import numpy as np
import cv2
import json
import sys
import os

# Add parent directory to path so we can import trueview_engine
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from trueview_engine.models.model_manager import ModelManager
from trueview_engine.config.thresholds import *

def benchmark_module(name, func, args, num_iterations=50):
    print(f"Benchmarking {name}...")
    latencies = []
    # Warmup
    for _ in range(5):
        try:
            func(*args)
        except Exception:
            pass
            
    for _ in range(num_iterations):
        t0 = time.time()
        try:
            func(*args)
        except Exception as e:
            print(f"Error in {name}: {e}")
            break
        latencies.append((time.time() - t0) * 1000.0)
        
    if not latencies:
        return {"name": name, "avg_ms": 0, "p95_ms": 0, "fps": 0}
        
    avg = np.mean(latencies)
    p95 = np.percentile(latencies, 95)
    fps = 1000.0 / avg if avg > 0 else 0
    return {
        "name": name,
        "avg_ms": round(avg, 2),
        "p95_ms": round(p95, 2),
        "fps": round(fps, 1)
    }

def run_all_benchmarks():
    print("Initializing Model Manager for Benchmarking...")
    manager = ModelManager()
    manager.initialize()
    
    # Create dummy inputs
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    dummy_face_roi = np.zeros((112, 112, 3), dtype=np.uint8)
    dummy_landmarks = np.zeros((68, 2), dtype=np.float32)
    dummy_audio = [0.0] * 1024
    
    # Encode frame to base64 for YOLO which expects base64 in its process_frame method (wait, ObjectDetectionService might take base64 or cv2)
    import base64
    _, buffer = cv2.imencode('.jpg', dummy_frame)
    b64_frame = "data:image/jpeg;base64," + base64.b64encode(buffer).decode('utf-8')
    
    results = []
    
    # 1. Face Detection
    if manager.face_detector:
        res = benchmark_module("Face Detection (YuNet)", manager.face_detector.detect, (dummy_frame,))
        results.append(res)
        
    # 2. Face Recognition
    if manager.recognition_service:
        res = benchmark_module("Face Recognition (Feature Extraction)", manager.recognition_service.extract_embedding, (b64_frame,))
        results.append(res)
        
    # 3. YOLO Object Detection
    if manager.object_detection_service:
        res = benchmark_module("YOLOv11 Object Detection", manager.object_detection_service.process_frame, (b64_frame,))
        results.append(res)
        
    # 4. Gaze Tracking
    if manager.gaze_service:
        res = benchmark_module("Eye Gaze Tracking", manager.gaze_service.process_frame, (b64_frame, False))
        results.append(res)
        
    # 5. Head Pose
    if manager.head_pose_service:
        res = benchmark_module("Head Pose Estimation", manager.head_pose_service.process_frame, (b64_frame, False))
        results.append(res)
        
    # 6. Liveness
    if manager.liveness_service:
        res = benchmark_module("Liveness Detection", manager.liveness_service.check, (b64_frame,))
        results.append(res)
        
    # 7. Voice VAD
    if manager.vad_service:
        res = benchmark_module("Voice Activity Detection", manager.vad_service.process_audio_chunk, (dummy_audio,))
        results.append(res)
        
    # Save results
    out_path = os.path.join(os.path.dirname(__file__), '../metrics/baseline_latency.json')
    with open(out_path, 'w') as f:
        json.dump(results, f, indent=2)
        
    print("\n--- BENCHMARK RESULTS ---")
    for r in results:
        print(f"{r['name']}: {r['avg_ms']}ms (P95: {r['p95_ms']}ms) -> {r['fps']} FPS")
        
if __name__ == "__main__":
    run_all_benchmarks()
