import base64
import json
import time
import requests
import numpy as np
import cv2

# Create a dummy test image
def create_test_frame():
    img = np.ones((480, 640, 3), dtype=np.uint8) * 180
    cv2.ellipse(img, (320, 240), (120, 160), 0, 0, 360, (220, 200, 190), -1)
    cv2.circle(img, (270, 210), 18, (255, 255, 255), -1)
    cv2.circle(img, (270, 210), 8, (30, 30, 30), -1)
    cv2.circle(img, (370, 210), 18, (255, 255, 255), -1)
    cv2.circle(img, (370, 210), 8, (30, 30, 30), -1)
    _, buffer = cv2.imencode('.jpg', img)
    return base64.b64encode(buffer).decode('utf-8')

BASE_URL = "http://localhost:8000/api/eye-gaze"
frame_b64 = create_test_frame()

print("=" * 60)
print("TESTING AI PERCEPTION EYE GAZE PIPELINE")
print("=" * 60)

# Reset session first
requests.post(f"{BASE_URL}/reset-session", json={"session_id": "test-session"})

# TEST 1: Eyes Fully Open (Looking Center)
print("\n--- TEST 1: Eyes Fully Open (Looking Center) ---")
payload_open = {
    "image": frame_b64,
    "draw_overlay": False,
    "eye_metrics": {
        "faceDetected": True,
        "confidence": 0.95,
        "leftEAR": 0.32,
        "rightEAR": 0.31,
        "averageEAR": 0.315,
        "gazeDirection": "center"
    }
}
resp1 = requests.post(f"{BASE_URL}/process-eye-gaze", json=payload_open).json()
print("Response:", json.dumps({
    "eye_status": resp1.get("eye_status"),
    "gaze_direction": resp1.get("gaze_direction"),
    "focus_state": resp1.get("focus_state"),
    "attention_score": resp1.get("attention_score"),
    "ear": resp1.get("ear")
}, indent=2))
assert resp1.get("eye_status") == "OPEN", f"Expected OPEN, got {resp1.get('eye_status')}"
assert resp1.get("gaze_direction") == "center", f"Expected center, got {resp1.get('gaze_direction')}"
assert resp1.get("focus_state") == "FOCUSED", f"Expected FOCUSED, got {resp1.get('focus_state')}"
assert resp1.get("attention_score") >= 90.0, f"Expected high attention, got {resp1.get('attention_score')}"

# TEST 2: Normal Blink (< 400ms)
print("\n--- TEST 2: Normal Blink (< 400ms) ---")
payload_blink = {
    "image": frame_b64,
    "draw_overlay": False,
    "eye_metrics": {
        "faceDetected": True,
        "confidence": 0.95,
        "leftEAR": 0.08,
        "rightEAR": 0.09,
        "averageEAR": 0.085
    }
}
resp2 = requests.post(f"{BASE_URL}/process-eye-gaze", json=payload_blink).json()
print("Response (First blink frame):", json.dumps({
    "eye_status": resp2.get("eye_status"),
    "gaze_direction": resp2.get("gaze_direction"),
    "focus_state": resp2.get("focus_state"),
    "attention_score": resp2.get("attention_score")
}, indent=2))
assert resp2.get("eye_status") == "BLINKING", f"Expected BLINKING, got {resp2.get('eye_status')}"
assert resp2.get("gaze_direction") == "unknown", f"Expected unknown gaze during blink, got {resp2.get('gaze_direction')}"

# TEST 3: Prolonged Eye Closure (> 1.0s)
print("\n--- TEST 3: Close Both Eyes Continuously (1.2s closure) ---")
time.sleep(1.2)
resp3 = requests.post(f"{BASE_URL}/process-eye-gaze", json=payload_blink).json()
print("Response (After 1.2s closed):", json.dumps({
    "eye_status": resp3.get("eye_status"),
    "gaze_direction": resp3.get("gaze_direction"),
    "focus_state": resp3.get("focus_state"),
    "attention_score": resp3.get("attention_score")
}, indent=2))
assert resp3.get("eye_status") == "CLOSED", f"Expected CLOSED, got {resp3.get('eye_status')}"
assert resp3.get("gaze_direction") == "unknown", f"Expected unknown gaze when closed, got {resp3.get('gaze_direction')}"
assert resp3.get("focus_state") == "EYES_CLOSED", f"Expected EYES_CLOSED, got {resp3.get('focus_state')}"
assert resp3.get("attention_score") < 90, f"Expected decayed attention, got {resp3.get('attention_score')}"

# CRITICAL BUG CHECK: Verify that (EYES CLOSED + CENTER + FOCUSED + 100%) is impossible
is_bug_present = (
    resp3.get("eye_status") == "CLOSED" and
    resp3.get("gaze_direction") == "center" and
    resp3.get("focus_state") == "FOCUSED" and
    resp3.get("attention_score") == 100
)
print(f"CRITICAL BUG CHECK (CLOSED + CENTER + FOCUSED + 100%): {'FAIL' if is_bug_present else 'PASS (Impossible)'}")
assert not is_bug_present, "CRITICAL: Eyes closed returned CENTER / FOCUSED / 100%!"

# TEST 4: Open Eyes Again
print("\n--- TEST 4: Open Eyes Again ---")
resp4 = requests.post(f"{BASE_URL}/process-eye-gaze", json=payload_open).json()
print("Response:", json.dumps({
    "eye_status": resp4.get("eye_status"),
    "gaze_direction": resp4.get("gaze_direction"),
    "focus_state": resp4.get("focus_state"),
    "attention_score": resp4.get("attention_score")
}, indent=2))
assert resp4.get("eye_status") == "OPEN"
assert resp4.get("gaze_direction") == "center"
assert resp4.get("focus_state") == "FOCUSED"

# TEST 5: Eyes Open + Look Left
print("\n--- TEST 5: Eyes Open + Look Left ---")
payload_left = {
    "image": frame_b64,
    "draw_overlay": False,
    "eye_metrics": {
        "faceDetected": True,
        "confidence": 0.95,
        "leftEAR": 0.30,
        "rightEAR": 0.29,
        "averageEAR": 0.295,
        "gazeDirection": "left"
    }
}
resp5 = requests.post(f"{BASE_URL}/process-eye-gaze", json=payload_left).json()
print("Response:", json.dumps({
    "eye_status": resp5.get("eye_status"),
    "gaze_direction": resp5.get("gaze_direction"),
    "focus_state": resp5.get("focus_state"),
    "attention_score": resp5.get("attention_score")
}, indent=2))
assert resp5.get("eye_status") == "OPEN", f"Expected OPEN, got {resp5.get('eye_status')}"
assert resp5.get("gaze_direction") == "left", f"Expected left, got {resp5.get('gaze_direction')}"
assert resp5.get("focus_state") == "OFFSCREEN", f"Expected OFFSCREEN, got {resp5.get('focus_state')}"

# TEST 6: Eyes Open + Look Right
print("\n--- TEST 6: Eyes Open + Look Right ---")
payload_right = {
    "image": frame_b64,
    "draw_overlay": False,
    "eye_metrics": {
        "faceDetected": True,
        "confidence": 0.95,
        "leftEAR": 0.30,
        "rightEAR": 0.29,
        "averageEAR": 0.295,
        "gazeDirection": "right"
    }
}
resp6 = requests.post(f"{BASE_URL}/process-eye-gaze", json=payload_right).json()
print("Response:", json.dumps({
    "eye_status": resp6.get("eye_status"),
    "gaze_direction": resp6.get("gaze_direction"),
    "focus_state": resp6.get("focus_state"),
    "attention_score": resp6.get("attention_score")
}, indent=2))
assert resp6.get("eye_status") == "OPEN", f"Expected OPEN, got {resp6.get('eye_status')}"
assert resp6.get("gaze_direction") == "right", f"Expected right, got {resp6.get('gaze_direction')}"
assert resp6.get("focus_state") == "OFFSCREEN", f"Expected OFFSCREEN, got {resp6.get('focus_state')}"

# TEST 7: Move Face Away From Camera (Face Not Detected)
print("\n--- TEST 7: Move Face Away (Face Not Detected) ---")
payload_no_face = {
    "image": frame_b64,
    "draw_overlay": False,
    "eye_metrics": {
        "faceDetected": False,
        "confidence": 0.0,
        "leftEAR": 0.0,
        "rightEAR": 0.0,
        "averageEAR": 0.0
    }
}
resp7 = requests.post(f"{BASE_URL}/process-eye-gaze", json=payload_no_face).json()
print("Response:", json.dumps({
    "eye_status": resp7.get("eye_status"),
    "gaze_direction": resp7.get("gaze_direction"),
    "focus_state": resp7.get("focus_state"),
    "attention_score": resp7.get("attention_score")
}, indent=2))
assert resp7.get("eye_status") == "UNKNOWN", f"Expected UNKNOWN, got {resp7.get('eye_status')}"
assert resp7.get("gaze_direction") == "unknown", f"Expected unknown, got {resp7.get('gaze_direction')}"
assert resp7.get("focus_state") == "FACE_NOT_DETECTED", f"Expected FACE_NOT_DETECTED, got {resp7.get('focus_state')}"

# TEST 8: One Eye Closed (Wink / Partial Closure)
print("\n--- TEST 8: One Eye Closed (Wink / Partial Closure) ---")
payload_partial = {
    "image": frame_b64,
    "draw_overlay": False,
    "eye_metrics": {
        "faceDetected": True,
        "confidence": 0.95,
        "leftEAR": 0.08,
        "rightEAR": 0.32,
        "averageEAR": 0.20
    }
}
resp8 = requests.post(f"{BASE_URL}/process-eye-gaze", json=payload_partial).json()
print("Response:", json.dumps({
    "eye_status": resp8.get("eye_status"),
    "left_ear": resp8.get("left_ear"),
    "right_ear": resp8.get("right_ear")
}, indent=2))
assert resp8.get("eye_status") == "PARTIALLY_CLOSED", f"Expected PARTIALLY_CLOSED, got {resp8.get('eye_status')}"

print("\n" + "=" * 60)
print("ALL 8 VERIFICATION TESTS PASSED SUCCESSFULLY!")
print("=" * 60)
