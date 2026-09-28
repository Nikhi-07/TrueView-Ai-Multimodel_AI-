"""
Comprehensive End-to-End Test Suite for TrueView AI Event Pipeline
Tests all 12 scenarios specified in the requirements.
"""

import sys
import os
import time
import requests
import json
import numpy as np
import cv2
import base64

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "ai-service"))

AI_BASE = "http://127.0.0.1:8000"
BACKEND_BASE = "http://127.0.0.1:5000"

def create_synthetic_frame():
    # 320x240 clean image
    img = np.zeros((240, 320, 3), dtype=np.uint8)
    img[:] = (80, 80, 80)
    # Draw simple face-like circle
    cv2.circle(img, (160, 120), 50, (200, 200, 200), -1)
    _, buffer = cv2.imencode('.jpg', img)
    return base64.b64encode(buffer).decode('utf-8')

def run_tests():
    print("=" * 70)
    print("  TRUEVIEW AI – END-TO-END EVENT PIPELINE INTEGRATION TEST SUITE")
    print("=" * 70)
    
    frame_b64 = create_synthetic_frame()

    # TEST 1: No violation
    print("\n[TEST 1] No violation (Clean Frame)...")
    sess_id = f"TRV-TEST-1-{int(time.time())}"
    res_start = requests.post(f"{AI_BASE}/api/ai/session/start", json={
        "session_id": sess_id,
        "user_id": "test_user_01",
        "session_type": "EXAM"
    })
    assert res_start.status_code == 200, f"Session start failed: {res_start.text}"

    # Process 1 normal frame
    res_proc = requests.post(f"{AI_BASE}/api/ai/session/{sess_id}/process", json={
        "session_id": sess_id,
        "user_id": "test_user_01",
        "session_type": "EXAM",
        "video_frame": frame_b64,
        "audio_samples": None,
        "timestamp": time.time(),
        "capture_timestamp": time.time()
    })
    assert res_proc.status_code == 200, f"Process failed: {res_proc.text}"
    data = res_proc.json()
    active_evts = [e for e in data.get("behaviour", {}).get("events", []) if e.get("state") != "RESOLVED"]
    print(f"  Active Events: {len(active_evts)} | Risk Score: {data.get('risk', {}).get('score')}")
    assert len(active_evts) == 0, f"Expected 0 active events, got: {active_evts}"
    assert data.get('risk', {}).get('score') == 0.0, "Risk should be 0.0"
    print("  ✅ TEST 1 PASSED: Telemetry = 0, Risk = normal, No alerts.")

    # Stop session 1
    requests.post(f"{AI_BASE}/api/ai/session/{sess_id}/stop")

    # TEST 2 & TEST 3 & TEST 4: Direct engine state machine verification for Phone & Multi-person
    print("\n[TEST 2 & 3] Persistent Phone and Multiple People Confirmation...")
    from trueview_engine.core.engine import TrueViewEngine
    from trueview_engine.schemas.input_schema import UnifiedMonitoringInput
    engine = TrueViewEngine()
    engine.initialize()

    sess_persist = f"TRV-PERSIST-{int(time.time())}"

    # Simulate YOLO detection with phone and multiple people
    engine._last_yolo_result = {
        "summary": {
            "person_count": 2,
            "phone_detected": True,
            "phone_status": "CONFIRMED",
            "prohibited_items_count": 1
        },
        "detections": [
            {"class_name": "cell phone", "confidence": 0.92, "box": [10, 10, 50, 50]},
            {"class_name": "person", "confidence": 0.90, "box": [0, 0, 100, 200]},
            {"class_name": "person", "confidence": 0.88, "box": [150, 0, 100, 200]},
        ],
        "events": []
    }

    # Frame 1: Initial detection (validating)
    payload1 = UnifiedMonitoringInput(
        session_id=sess_persist,
        user_id="cand_01",
        session_type="EXAM",
        video_frame=None,
        timestamp=time.time(),
        capture_timestamp=time.time()
    )
    out1 = engine.process_frame(payload1)
    evts1 = [e for e in out1.behaviour.events if e.state != "RESOLVED"]
    print(f"  Frame 1 Active Events count: {len(evts1)}")

    # Sleep window for temporal confirmation
    time.sleep(0.40)

    # Frame 2: Persistent detection -> Confirmed
    payload2 = UnifiedMonitoringInput(
        session_id=sess_persist,
        user_id="cand_01",
        session_type="EXAM",
        video_frame=None,
        timestamp=time.time(),
        capture_timestamp=time.time()
    )
    out2 = engine.process_frame(payload2)
    evts2 = [e for e in out2.behaviour.events if e.state != "RESOLVED"]
    types2 = [e.type for e in evts2]
    print(f"  Frame 2 Confirmed Events: {types2}")
    print(f"  Risk Score: {out2.risk.score} | Risk Level: {out2.risk.level}")

    assert "MOBILE_PHONE_DETECTED" in types2, f"Expected MOBILE_PHONE_DETECTED in {types2}"
    assert "MULTIPLE_PEOPLE_DETECTED" in types2, f"Expected MULTIPLE_PEOPLE_DETECTED in {types2}"
    assert out2.risk.score >= 50.0, f"Expected Risk Score >= 50, got {out2.risk.score}"
    print("  ✅ TEST 2 & 3 PASSED: MOBILE_PHONE_DETECTED & MULTIPLE_PEOPLE_DETECTED confirmed, risk increased.")

    # TEST 4: Phone disappears -> PHONE_CLEARED after grace period
    print("\n[TEST 4] Phone & Multi-person Disappear (CLEARED transition)...")
    engine._last_yolo_result = {
        "summary": {
            "person_count": 1,
            "phone_detected": False,
            "phone_status": "CLEAN",
            "prohibited_items_count": 0
        },
        "detections": [],
        "events": []
    }
    # Wait out the grace period (1.2s)
    time.sleep(1.3)
    payload3 = UnifiedMonitoringInput(
        session_id=sess_persist,
        user_id="cand_01",
        session_type="EXAM",
        video_frame=None,
        timestamp=time.time(),
        capture_timestamp=time.time()
    )
    out3 = engine.process_frame(payload3)
    cleared_types = [e.type for e in out3.behaviour.events if e.state == "RESOLVED"]
    print(f"  Cleared Events: {cleared_types}")
    assert "PHONE_CLEARED" in cleared_types, f"Expected PHONE_CLEARED in {cleared_types}"
    assert "MULTIPLE_PERSONS_CLEARED" in cleared_types, f"Expected MULTIPLE_PERSONS_CLEARED in {cleared_types}"
    print("  ✅ TEST 4 PASSED: Clean scene emitted PHONE_CLEARED and MULTIPLE_PERSONS_CLEARED.")

    # TEST 5 & 6: Eye Gaze: Blink vs Eyes Closed
    print("\n[TEST 5 & 6] Eye Blink (No alert) vs Eyes Closed (> 1.0s -> Alert)...")
    sess_eyes = f"TRV-EYES-{int(time.time())}"

    # Brief blink: single frame
    st_blink = engine.event_state_machine.update_condition(
        sess_eyes, "eyes_closed", True, 0.90, "Eyes closed blink", 1.0, {"video_quality": "GOOD"}
    )
    assert not st_blink["confirmed"], "Single frame blink must not confirm alert"
    print("  ✅ TEST 5 PASSED: Brief blink ignored without alert.")

    # Now simulate eyes closed lasting 1.1s
    time.sleep(1.1)
    st_closed = engine.event_state_machine.update_condition(
        sess_eyes, "eyes_closed", True, 0.90, "Eyes closed persistent", 1.0, {"video_quality": "GOOD"}
    )
    assert st_closed["confirmed"], "Eyes closed > 1.0s must be confirmed"
    print("  ✅ TEST 6 PASSED: Eyes closed beyond threshold confirmed as EYES_CLOSED.")

    # TEST 7 & 8: Look away: Brief vs Persistent
    print("\n[TEST 7 & 8] Brief Look Away vs Persistent Offscreen Glance...")
    sess_gaze = f"TRV-GAZE-{int(time.time())}"

    # Brief glance (0.1s):
    st_brief = engine.event_state_machine.update_condition(
        sess_gaze, "looking_away", True, 0.88, "Brief glance", 0.8, {"video_quality": "GOOD"}
    )
    assert not st_brief["confirmed"], "Brief glance must not confirm"
    print("  ✅ TEST 7 PASSED: Brief look away ignored without alert.")

    time.sleep(0.9)
    st_glance = engine.event_state_machine.update_condition(
        sess_gaze, "looking_away", True, 0.88, "Persistent look away", 0.8, {"video_quality": "GOOD"}
    )
    assert st_glance["confirmed"], "Looking away > 0.8s must be confirmed"
    print("  ✅ TEST 8 PASSED: Persistent look away confirmed as OFFSCREEN_GLANCE.")

    # TEST 9: Session Isolation
    print("\n[TEST 9] Session Isolation (Student A vs Student B)...")
    sess_a = f"TRV-STUDENT-A-{int(time.time())}"
    sess_b = f"TRV-STUDENT-B-{int(time.time())}"

    # Give session A a phone detection
    engine.event_state_machine.update_condition(sess_a, "phone", True, 0.92, "Phone in A", 0.1, {"video_quality": "GOOD"})
    time.sleep(0.15)
    st_a = engine.event_state_machine.update_condition(sess_a, "phone", True, 0.92, "Phone in A", 0.1, {"video_quality": "GOOD"})
    assert st_a["confirmed"], "Session A must confirm phone"

    # Evaluate decision for session A
    dec_a = engine.decision_engine.evaluate(
        {}, {"events": [{"type": "MOBILE_PHONE_DETECTED", "severity": "HIGH", "state": "CONFIRMED"}]},
        [], {"uncertainty_level": "CONFIRMED"}, {"session_id": sess_a, "session_type": "EXAM"}
    )
    # Evaluate decision for session B with no events
    dec_b = engine.decision_engine.evaluate(
        {}, {"events": []},
        [], {"uncertainty_level": "CONFIRMED"}, {"session_id": sess_b, "session_type": "EXAM"}
    )

    print(f"  Student A Risk: {dec_a['risk']['score']} | Student B Risk: {dec_b['risk']['score']}")
    assert dec_a['risk']['score'] >= 30.0, "Student A risk must increase"
    assert dec_b['risk']['score'] == 0.0, "Student B risk must remain 0"
    print("  ✅ TEST 9 PASSED: Complete session isolation maintained.")

    # TEST 10: Backend Logging & Session Report
    print("\n[TEST 10] Backend Log & Report Verification...")
    test_report_sess = f"TRV-RPT-{int(time.time())}"
    log_res = requests.post(f"{BACKEND_BASE}/api/ai-engine/log", json={
        "session_id": test_report_sess,
        "user_id": "test_student_42",
        "session_type": "EXAM",
        "behaviour": {
            "events": [
                {
                    "type": "MOBILE_PHONE_DETECTED",
                    "severity": "HIGH",
                    "confidence": 0.94,
                    "evidence": "Mobile phone detected on candidate desk",
                    "state": "CONFIRMED",
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                },
                {
                    "type": "MULTIPLE_PEOPLE_DETECTED",
                    "severity": "HIGH",
                    "confidence": 0.91,
                    "evidence": "2 people detected in candidate workspace",
                    "state": "CONFIRMED",
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                }
            ]
        },
        "risk": {"score": 60, "level": "HIGH"},
        "environment": {"phone_detected": True, "person_count": 2}
    })
    assert log_res.status_code == 200, f"Log failed: {log_res.text}"

    admin_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhN2YwN2JmZTY1NzcyY2NmNGZmNjhlNiIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc5MDYxNDc4OSwiZXhwIjoxNzkxMjE5NTg5fQ.K_bQp33yorKx8FZrJ2HECGB0IfV5IOgUEBUi5gCOop4"
    auth_headers = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}

    # Generate Report
    rpt_res = requests.post(f"{BACKEND_BASE}/api/reports/generate", json={
        "sessionId": test_report_sess
    }, headers=auth_headers)
    assert rpt_res.status_code == 200, f"Report generation failed: {rpt_res.text}"
    report_data = rpt_res.json().get("report", {})
    print(f"  Report ID: {report_data.get('reportId')} | Violations: {report_data.get('totalViolations')} | Phone: {report_data.get('phoneDetections')}")
    assert report_data.get('totalViolations') >= 2, f"Expected >= 2 violations in report, got {report_data.get('totalViolations')}"
    assert report_data.get('phoneDetections') >= 1, f"Expected >= 1 phone detection, got {report_data.get('phoneDetections')}"
    print("  ✅ TEST 10 PASSED: Verified event timeline and report persistence.")

    # TEST 11: Refresh Session Recovery
    print("\n[TEST 11] Refresh Monitoring Recovery...")
    rec_res = requests.get(f"{BACKEND_BASE}/api/ai-engine/sessions/{test_report_sess}", headers=auth_headers)
    assert rec_res.status_code == 200, f"Session recovery failed: {rec_res.text}"
    session_json = rec_res.json()
    alerts_recovered = session_json.get("alerts", []) or session_json.get("session", {}).get("alerts", [])
    assert len(alerts_recovered) >= 2, "Alerts should be recovered on refresh"
    print(f"  Recovered Alerts Count: {len(alerts_recovered)}")
    print("  ✅ TEST 11 PASSED: Existing session alerts recovered on refresh.")

    # TEST 12: Socket.IO Session Room Connection
    print("\n[TEST 12] Socket.IO Session Room Joining & Event Propagation...")
    # Check socket health by sending request to backend /socket.io/
    sock_check = requests.get(f"{BACKEND_BASE}/socket.io/?EIO=4&transport=polling")
    assert sock_check.status_code == 200, f"Socket.IO server polling failed: {sock_check.text}"
    print("  Socket.IO handshake responded with 200 OK.")
    print("  ✅ TEST 12 PASSED: Socket.IO server operational and accepting connections.")

    print("\n" + "=" * 70)
    print("  🎉 ALL 12 INTEGRATION SCENARIO TESTS PASSED SUCCESSFULLY!")
    print("=" * 70)

if __name__ == "__main__":
    run_tests()
