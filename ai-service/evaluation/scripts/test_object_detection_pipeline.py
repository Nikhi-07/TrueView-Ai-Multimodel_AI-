"""
Comprehensive Engineering Test Suite for AI Perception -> Object Detection
Tests:
1. Model Capability Check (exact classes supported by yolo11n.pt)
2. Single Person Detection (Candidate = 1, single_person, no violation)
3. Duplicate Person Bounding Box De-duplication (IoM / IoU nesting suppression)
4. Multiple People Temporal Confirmation (Validating vs Confirmed additional person)
5. Single-Frame Phone Glitch (Raw 48% -> Validating, NO violation event)
6. Persistent Mobile Phone Temporal Confirmation (Confirmed -> MOBILE_PHONE_DETECTED event)
7. TV Remote Distinction & False Positive Suppression (Aspect ratio & class consistency)
8. Object Disappearance & Grace Period (PHONE_CLEARED event emitted once)
9. Electronic Device Taxonomy Check
10. Live Inference Performance Benchmark (Inference ms & FPS)
"""

import os
import sys
import time
import numpy as np
import cv2

# Set path to import ai-service modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from object_detection.detection.yolo_detector import YoloDetector
from object_detection.tracking.object_tracker import ObjectTracker
from object_detection.services.environment_monitor import EnvironmentMonitor
from object_detection.services.object_detection_service import ObjectDetectionService
from object_detection.utils.constants import (
    DEFAULT_YOLO_MODEL,
    TARGET_CLASSES_MAP,
    TAXONOMY_MAP,
    UNSUPPORTED_OBJECTS,
    CONFIDENCE_THRESHOLDS,
    PHONE_CONFIRMATION_FRAMES,
    PHONE_CONFIRMATION_DURATION_MS,
    PERSON_CONFIRMATION_FRAMES,
    PERSON_CONFIRMATION_DURATION_MS,
    REMOTE_ASPECT_RATIO_THRESHOLD
)

def run_all_tests():
    print("============================================================")
    print("TRUEVIEW AI - OBJECT DETECTION ENGINEERING TEST SUITE")
    print("============================================================\n")

    results = {}

    # ────────────────────────────────────────────────────────────
    # TEST 1: Model Capability & Supported vs Unsupported Classes
    # ────────────────────────────────────────────────────────────
    print("[TEST 1] Auditing YOLOv11 Model & Class Capabilities...")
    detector = YoloDetector(DEFAULT_YOLO_MODEL)
    model_classes = detector.model.names
    print(f"  Model Name: {DEFAULT_YOLO_MODEL}")
    print(f"  Total Weights Classes: {len(model_classes)}")
    
    # Check proctoring relevant classes
    supported_proctoring_classes = [name for idx, name in TARGET_CLASSES_MAP.items()]
    print(f"  Target Proctoring Classes in System: {supported_proctoring_classes}")
    
    # Check that unsupported classes are recognized as unsupported and not faked
    for unsupp in UNSUPPORTED_OBJECTS:
        assert unsupp not in model_classes.values(), f"Unexpected presence of {unsupp} in COCO!"
    print(f"  Verified Unsupported Classes (NOT faked): {UNSUPPORTED_OBJECTS}")
    results["TEST_1_MODEL_CAPABILITY"] = "PASSED"
    print("  -> TEST 1 PASSED\n")

    # ────────────────────────────────────────────────────────────
    # TEST 2: Single Person Detection (Candidate = 1, single_person)
    # ────────────────────────────────────────────────────────────
    print("[TEST 2] Testing Single Person Candidate Tracking...")
    tracker = ObjectTracker()
    monitor = EnvironmentMonitor()

    # Frame 1: Single candidate detected
    det_person = [{
        "label": "person",
        "confidence": 0.88,
        "box": [150, 80, 490, 470],
        "aspect_ratio": 1.15
    }]
    t1 = tracker.update_tracks(det_person)
    env1 = monitor.monitor_environment(t1)
    
    # Frame 2: Candidate persists (Candidate becomes confirmed)
    time.sleep(0.06)
    t2 = tracker.update_tracks(det_person)
    env2 = monitor.monitor_environment(t2)

    assert env2["person_count"] == 1, f"Expected 1 person, got {env2['person_count']}"
    assert env2["person_status"] == "single_person", f"Expected single_person, got {env2['person_status']}"
    assert len(env2["events"]) == 0, f"Expected 0 violations, got {env2['events']}"
    assert t2[0]["type"] == "CANDIDATE", f"Expected type CANDIDATE, got {t2[0]['type']}"
    assert t2[0]["confirmed"] is True, "Candidate should be confirmed after 2 frames"
    results["TEST_2_SINGLE_PERSON"] = "PASSED"
    print(f"  Candidate: {env2['person_count']}, Status: {env2['person_status']}, Type: {t2[0]['type']}, Confirmed: {t2[0]['confirmed']}")
    print("  -> TEST 2 PASSED\n")

    # ────────────────────────────────────────────────────────────
    # TEST 3: Duplicate Person Bounding Box De-duplication (Nested IoM)
    # ────────────────────────────────────────────────────────────
    print("[TEST 3] Testing Nested Person Bounding Box Suppression...")
    # Simulate single person where YOLO detects full body AND an overlapping torso sub-box
    raw_person_boxes = [
        {"label": "person", "confidence": 0.89, "box": [150, 80, 490, 470], "aspect_ratio": 1.15}, # Full body
        {"label": "person", "confidence": 0.62, "box": [180, 90, 460, 320], "aspect_ratio": 1.22}, # Torso / chest sub-box
    ]
    merged = YoloDetector._nms_merge(raw_person_boxes)
    assert len(merged) == 1, f"Expected nested person box to be suppressed into 1, got {len(merged)}"
    print(f"  Input person boxes: {len(raw_person_boxes)}, After De-dup NMS: {len(merged)}")
    results["TEST_3_PERSON_DEDUP"] = "PASSED"
    print("  -> TEST 3 PASSED\n")

    # ────────────────────────────────────────────────────────────
    # TEST 4: Multiple People Temporal Validation (Glitch vs Real)
    # ────────────────────────────────────────────────────────────
    print("[TEST 4] Testing Multiple People Detection & Temporal Confirmation...")
    tracker.reset()
    monitor.reset()

    # Initial frame: Candidate only
    candidate_box = {"label": "person", "confidence": 0.90, "box": [100, 80, 350, 460], "aspect_ratio": 1.5}
    tracker.update_tracks([candidate_box])
    time.sleep(0.05)
    tracker.update_tracks([candidate_box])

    # Next frame: Glitch / 1-frame second person appears on the right
    second_person_box = {"label": "person", "confidence": 0.68, "box": [450, 100, 620, 440], "aspect_ratio": 2.0}
    t_glitch = tracker.update_tracks([candidate_box, second_person_box])
    env_glitch = monitor.monitor_environment(t_glitch)

    # Must NOT immediately trigger multiple_persons violation!
    assert env_glitch["person_count"] == 1, f"1-frame glitch must not bump confirmed person count! Got {env_glitch['person_count']}"
    assert env_glitch["validating_person_count"] == 1, "Second person must be in validating state"
    assert env_glitch["person_status"] == "single_person", f"Status must remain single_person during validation! Got {env_glitch['person_status']}"
    assert len(env_glitch["events"]) == 0, f"No event should be fired for 1-frame glitch! Got {env_glitch['events']}"
    print(f"  Frame with 1-frame glitch: Confirmed Candidate = {env_glitch['person_count']}, Validating = {env_glitch['validating_person_count']}, Status = {env_glitch['person_status']}")

    # Now simulate persistent second person for PERSON_CONFIRMATION_FRAMES (6 frames) & >= 450ms
    print("  Simulating persistent second person over 500ms...")
    time.sleep(0.50) # Ensure duration >= 450ms
    all_multi_events = []
    for i in range(PERSON_CONFIRMATION_FRAMES + 1):
        t_multi = tracker.update_tracks([candidate_box, second_person_box])
        env_multi = monitor.monitor_environment(t_multi)
        all_multi_events.extend(env_multi["events"])

    assert env_multi["person_count"] == 2, f"Expected 2 confirmed persons after temporal persistence, got {env_multi['person_count']}"
    assert env_multi["person_status"] == "multiple_persons", f"Expected multiple_persons, got {env_multi['person_status']}"
    assert any(e["type"] == "MULTIPLE_PEOPLE_DETECTED" for e in all_multi_events), "MULTIPLE_PEOPLE_DETECTED event should be emitted"
    print(f"  After temporal confirmation: Confirmed Candidates = {env_multi['person_count']}, Status = {env_multi['person_status']}")
    print(f"  Transition event captured: {[e['type'] for e in all_multi_events]}")
    results["TEST_4_MULTIPLE_PEOPLE"] = "PASSED"
    print("  -> TEST 4 PASSED\n")

    # ────────────────────────────────────────────────────────────
    # TEST 5: Single-Frame Phone Glitch (Raw 48% -> Validating, NO Violation)
    # ────────────────────────────────────────────────────────────
    print("[TEST 5] Testing Single-Frame Phone Glitch (48% confidence)...")
    tracker.reset()
    monitor.reset()

    # Candidate + 1 frame raw phone detection
    phone_glitch = {"label": "phone", "confidence": 0.48, "box": [220, 300, 270, 390], "aspect_ratio": 1.8}
    t_pg = tracker.update_tracks([candidate_box, phone_glitch])
    env_pg = monitor.monitor_environment(t_pg)

    assert env_pg["phone_status"] == "VALIDATING", f"Expected phone_status VALIDATING, got {env_pg['phone_status']}"
    assert env_pg["phone_detected"] is False, f"phone_detected must be False for raw 48% glitch! Got {env_pg['phone_detected']}"
    assert len(env_pg["events"]) == 0, f"No violation event should be generated for raw glitch! Got {env_pg['events']}"
    print(f"  Raw Phone Detection: Status = {env_pg['phone_status']}, phone_detected = {env_pg['phone_detected']}, Events = {env_pg['events']}")
    results["TEST_5_PHONE_GLITCH"] = "PASSED"
    print("  -> TEST 5 PASSED\n")

    # ────────────────────────────────────────────────────────────
    # TEST 6: Persistent Mobile Phone Confirmation (Verified Violation)
    # ────────────────────────────────────────────────────────────
    print("[TEST 6] Testing Persistent Phone Confirmation...")
    tracker.reset()
    monitor.reset()
    # Real phone: Confidence 86%, persists for >= 5 frames and >= 350ms
    real_phone = {"label": "phone", "confidence": 0.86, "box": [220, 300, 270, 390], "aspect_ratio": 1.8}
    
    all_phone_events = []
    for i in range(PHONE_CONFIRMATION_FRAMES + 2):
        t_real = tracker.update_tracks([candidate_box, real_phone])
        env_real = monitor.monitor_environment(t_real)
        all_phone_events.extend(env_real["events"])
        time.sleep(0.08) # 80ms per frame -> 7 * 80ms = 560ms (> 350ms)

    assert env_real["phone_status"] == "DETECTED", f"Expected phone_status DETECTED, got {env_real['phone_status']}"
    assert env_real["phone_detected"] is True, f"Expected phone_detected True, got {env_real['phone_detected']}"
    assert any(e["type"] == "MOBILE_PHONE_DETECTED" for e in all_phone_events), "Expected MOBILE_PHONE_DETECTED event"
    print(f"  Confirmed Phone: Status = {env_real['phone_status']}, phone_detected = {env_real['phone_detected']}")
    print(f"  Security Event captured: {[e['type'] for e in all_phone_events]}")
    results["TEST_6_PHONE_CONFIRMATION"] = "PASSED"
    print("  -> TEST 6 PASSED\n")

    # ────────────────────────────────────────────────────────────
    # TEST 7: TV Remote Distinction & Cross-Class Suppression
    # ────────────────────────────────────────────────────────────
    print("[TEST 7] Testing TV Remote Distinction & Phone Suppression...")
    tracker.reset()
    monitor.reset()

    # Elongated TV remote (aspect ratio = 3.2, typical remote)
    remote_box = {"label": "phone", "confidence": 0.58, "box": [200, 300, 240, 430], "aspect_ratio": 3.25}
    merged_remote = YoloDetector._nms_merge([remote_box])
    
    assert merged_remote[0]["label"] == "remote", f"Expected elongated object to resolve to remote, got {merged_remote[0]['label']}"
    t_rem = tracker.update_tracks([candidate_box, merged_remote[0]])
    env_rem = monitor.monitor_environment(t_rem)

    assert env_rem["phone_detected"] is False, "Remote control must NOT trigger phone violation!"
    print(f"  Elongated remote resolved to: {merged_remote[0]['label']}, Phone detected: {env_rem['phone_detected']}")
    results["TEST_7_REMOTE_DISTINCTION"] = "PASSED"
    print("  -> TEST 7 PASSED\n")

    # ────────────────────────────────────────────────────────────
    # TEST 8: Phone Disappearance & Grace Period Transition
    # ────────────────────────────────────────────────────────────
    print("[TEST 8] Testing Phone Disappearance & PHONE_CLEARED Lifecycle...")
    tracker.reset()
    monitor.reset()
    for _ in range(PHONE_CONFIRMATION_FRAMES + 2):
        t_active = tracker.update_tracks([candidate_box, real_phone])
        env_active = monitor.monitor_environment(t_active)
        time.sleep(0.08)
    assert env_active["phone_detected"] is True, f"Expected phone_detected True, got {env_active['phone_detected']}"

    # Now remove phone from frame. Frame 1 after removal (within grace period of 1000ms)
    t_lost1 = tracker.update_tracks([candidate_box])
    env_lost1 = monitor.monitor_environment(t_lost1)
    assert env_lost1["phone_status"] == "DETECTED", "Phone should remain DETECTED during grace period to prevent flickering"

    # Wait for grace period to expire (> 1000ms)
    print("  Waiting for grace period (1.1s) to expire...")
    time.sleep(1.1)
    t_cleared = tracker.update_tracks([candidate_box])
    env_cleared = monitor.monitor_environment(t_cleared)

    assert env_cleared["phone_status"] == "CLEAN", f"Expected phone_status CLEAN, got {env_cleared['phone_status']}"
    assert env_cleared["phone_detected"] is False
    assert any(e["type"] == "PHONE_CLEARED" for e in env_cleared["events"]), "Expected PHONE_CLEARED event on transition!"
    print(f"  After grace period: Status = {env_cleared['phone_status']}, Event = {env_cleared['events']}")
    results["TEST_8_PHONE_CLEARED"] = "PASSED"
    print("  -> TEST 8 PASSED\n")

    # ────────────────────────────────────────────────────────────
    # TEST 9: Electronic Device & Study Material Taxonomy
    # ────────────────────────────────────────────────────────────
    print("[TEST 9] Testing Taxonomy Mapping for Supported Electronics & Materials...")
    for label, info in TAXONOMY_MAP.items():
        assert "category" in info, f"Missing category for {label}"
        assert "type" in info, f"Missing type for {label}"
        assert "is_prohibited" in info, f"Missing is_prohibited for {label}"
    print(f"  Validated {len(TAXONOMY_MAP)} taxonomy mappings:")
    for k, v in TAXONOMY_MAP.items():
        print(f"    - {k.upper()}: Category = {v['category']}, Type = {v['type']}, Prohibited = {v['is_prohibited']}")
    results["TEST_9_TAXONOMY"] = "PASSED"
    print("  -> TEST 9 PASSED\n")

    # ────────────────────────────────────────────────────────────
    # TEST 10: Real Frame Performance Benchmark (Latency & FPS)
    # ────────────────────────────────────────────────────────────
    print("[TEST 10] Running Real Inference Performance Benchmark...")
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    # Draw simple shapes to simulate a scene
    cv2.circle(dummy_frame, (320, 240), 100, (200, 200, 200), -1)

    latencies = []
    # Warmup
    detector.detect_and_track(dummy_frame)

    for _ in range(15):
        t0 = time.time()
        dets = detector.detect_and_track(dummy_frame)
        trks = tracker.update_tracks(dets)
        env = monitor.monitor_environment(trks)
        elapsed_ms = (time.time() - t0) * 1000.0
        latencies.append(elapsed_ms)

    avg_latency = np.mean(latencies)
    max_latency = np.max(latencies)
    est_fps = 1000.0 / avg_latency if avg_latency > 0 else 0

    print(f"  Benchmark Iterations: 15 frames")
    print(f"  Average Latency: {avg_latency:.2f} ms")
    print(f"  Max Latency:     {max_latency:.2f} ms")
    print(f"  Effective AI Processing Rate: {est_fps:.1f} FPS")

    assert avg_latency < 150.0, f"Average latency too high: {avg_latency} ms"
    results["TEST_10_PERFORMANCE"] = "PASSED"
    print("  -> TEST 10 PASSED\n")

    # ────────────────────────────────────────────────────────────
    # SUMMARY
    # ────────────────────────────────────────────────────────────
    print("============================================================")
    print("ALL 10 ENGINEERING AUDIT TESTS COMPLETED SUCCESSFULLY!")
    print("============================================================")
    for test_name, status in results.items():
        print(f"  {test_name}: {status}")

if __name__ == "__main__":
    run_all_tests()
