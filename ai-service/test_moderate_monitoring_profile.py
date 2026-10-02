"""
TrueView AI – Moderate Examination Monitoring Policy Test Suite
Covers all 20 tests required by the Moderate Monitoring specification:

TEST 1:  Normal blink -> NO ALERT
TEST 2:  Eyes closed for 1 second -> NO ALERT
TEST 3:  Eyes closed for >= 2.5 seconds -> EYES_CLOSED (MEDIUM severity)
TEST 4:  Repeated frames of same eye closure -> ONE ALERT (deduplication / cooldown)
TEST 5:  Brief left gaze -> NO ALERT
TEST 6:  Brief right gaze -> NO ALERT
TEST 7:  Brief downward gaze -> NO ALERT
TEST 8:  Offscreen gaze >= 3 seconds -> alert (OFFSCREEN_GLANCE / PROLONGED_DISTRACTION)
TEST 9:  Low-confidence gaze -> NO ALERT
TEST 10: Small head movement -> NO ALERT
TEST 11: Sustained head turn -> alert (HEAD_TURNED)
TEST 12: Brief face loss -> NO ALERT
TEST 13: Face missing > configured grace period (2.0s) -> alert (USER_ABSENT)
TEST 14: Single-frame phone detection -> NO ALERT
TEST 15: Persistent phone -> PHONE DETECTED
TEST 16: Second person persistent -> MULTIPLE_PEOPLE_DETECTED (CRITICAL)
TEST 17: Spoof detection -> remains HIGH PRIORITY (CRITICAL)
TEST 18: Tab switches 1/3 -> warning
TEST 19: Tab switches 3/3 -> final warning
TEST 20: Tab switch 4/3 -> terminate (CRITICAL, TAB_SWITCH_LIMIT_EXCEEDED)
"""

import sys
import os
import time

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

sys.path.insert(0, os.path.dirname(__file__))

from trueview_engine.core.engine import TrueViewEngine
from trueview_engine.schemas.input_schema import UnifiedMonitoringInput
from trueview_engine.config.thresholds import (
    get_monitoring_profile_config,
    PROFILE_MODERATE,
    PROFILE_STRICT,
    PROFILE_RELAXED,
)
from trueview_engine.attention.attention_intelligence import AttentionIntelligenceEngine
from trueview_engine.policy.tab_switch_policy import evaluate_tab_switch


def run_all_20_tests():
    print("=" * 75)
    print("  TRUEVIEW AI – MODERATE EXAMINATION MONITORING TEST SUITE (20 TESTS)")
    print("=" * 75)

    engine = TrueViewEngine()
    engine.initialize()

    mod_cfg = get_monitoring_profile_config(PROFILE_MODERATE)
    windows = mod_cfg["temporal_windows"]
    conf_thresh = mod_cfg["confidence_thresholds"]
    cooldowns = mod_cfg["cooldown_seconds"]

    win_eyes = windows.get("eyes_closed", 2.5)
    win_dist = windows.get("looking_away", 3.0)
    win_face = windows.get("no_face", 2.0)
    win_head = windows.get("head_turn", 3.0)
    win_phone = windows.get("phone", 0.8)
    win_multi = windows.get("multiple_persons", 0.8)
    win_spoof = windows.get("spoof", 0.35)

    quality_good = {"video_quality": "GOOD", "quality": "GOOD"}
    passed_tests = []
    failed_tests = []

    def record(test_num, name, condition, details=""):
        if condition:
            print(f"  ✅ TEST {test_num} PASSED: {name} {details}")
            passed_tests.append(f"TEST {test_num}: {name}")
        else:
            print(f"  ❌ TEST {test_num} FAILED: {name} {details}")
            failed_tests.append(f"TEST {test_num}: {name}")

    # =========================================================================
    # TEST 1: Normal blink -> NO ALERT
    # =========================================================================
    print("\n--- TEST 1: Normal blink (< 400ms) -> NO ALERT ---")
    s1 = f"sess_test_1_{int(time.time()*1000)}"
    # 1 single frame of eye closure (e.g. 200ms blink)
    st1 = engine.event_state_machine.update_condition(
        s1, "eyes_closed", True, 0.92, "Blink frame",
        required_duration_sec=win_eyes, quality_eval=quality_good,
        min_confidence=0.85, cooldown_sec=8.0, min_frames=3
    )
    # Immediately returns to open
    time.sleep(0.05)
    st1_open = engine.event_state_machine.update_condition(
        s1, "eyes_closed", False, 0.0, "Eyes open",
        required_duration_sec=win_eyes, quality_eval=quality_good,
        min_confidence=0.85, cooldown_sec=8.0, min_frames=3
    )
    cond1 = (not st1["confirmed"]) and (not st1["should_alert"]) and (not st1_open["confirmed"])
    record(1, "Normal blink ignored without alert", cond1, f"(state={st1['state']}, confirmed={st1['confirmed']})")

    # =========================================================================
    # TEST 2: Eyes closed for 1 second -> NO ALERT
    # =========================================================================
    print("\n--- TEST 2: Eyes closed for 1 second (threshold = 2.5s) -> NO ALERT ---")
    s2 = f"sess_test_2_{int(time.time()*1000)}"
    # Frame 1
    engine.event_state_machine.update_condition(
        s2, "eyes_closed", True, 0.92, "Eyes closed start",
        required_duration_sec=win_eyes, quality_eval=quality_good,
        min_confidence=0.85, cooldown_sec=8.0, min_frames=3
    )
    time.sleep(1.05)
    # Frame 2 at ~1.0s
    st2 = engine.event_state_machine.update_condition(
        s2, "eyes_closed", True, 0.92, "Eyes closed at 1.0s",
        required_duration_sec=win_eyes, quality_eval=quality_good,
        min_confidence=0.85, cooldown_sec=8.0, min_frames=3
    )
    cond2 = (not st2["confirmed"]) and (not st2["should_alert"]) and (st2["state"] == "OBSERVING")
    record(2, "Eyes closed for 1.0s kept in internal observation without alert", cond2, f"(duration={st2['duration']}s < {win_eyes}s)")

    # =========================================================================
    # TEST 3: Eyes closed for >= 2.5 seconds -> EYES_CLOSED
    # =========================================================================
    print("\n--- TEST 3: Eyes closed for >= 2.5 seconds -> EYES_CLOSED (MEDIUM) ---")
    s3 = f"sess_test_3_{int(time.time()*1000)}"
    # Start closure
    engine.event_state_machine.update_condition(
        s3, "eyes_closed", True, 0.92, "Eyes closed start",
        required_duration_sec=win_eyes, quality_eval=quality_good,
        min_confidence=0.85, cooldown_sec=8.0, min_frames=3
    )
    time.sleep(1.3)
    # Intermediate frame
    engine.event_state_machine.update_condition(
        s3, "eyes_closed", True, 0.92, "Eyes closed mid",
        required_duration_sec=win_eyes, quality_eval=quality_good,
        min_confidence=0.85, cooldown_sec=8.0, min_frames=3
    )
    time.sleep(1.3)
    # Frame at ~2.6s (>= 2.5s)
    st3 = engine.event_state_machine.update_condition(
        s3, "eyes_closed", True, 0.92, "Eyes closed 2.6s",
        required_duration_sec=win_eyes, quality_eval=quality_good,
        min_confidence=0.85, cooldown_sec=8.0, min_frames=3
    )
    beh3 = engine.behaviour_engine.evaluate(
        {"quality": quality_good, "gaze": {"eyes_closed": True, "confidence": 0.0}, "attention": {"status": "EYES_CLOSED"}},
        {}, {"eyes_closed": st3}, {"session_id": s3, "session_type": "EXAM", "monitoring_profile": "MODERATE"}
    )
    evts3 = [e for e in beh3["events"] if e["type"] == "EYES_CLOSED"]
    cond3 = st3["confirmed"] and (len(evts3) == 1) and (evts3[0]["severity"] == "MEDIUM")
    record(3, "Eyes closed >= 2.5s confirmed as EYES_CLOSED", cond3, f"(events={len(evts3)}, severity={evts3[0]['severity'] if evts3 else 'NONE'})")

    # =========================================================================
    # TEST 4: Repeated frames of same eye closure -> ONE ALERT
    # =========================================================================
    print("\n--- TEST 4: Repeated frames of same eye closure -> ONE ALERT (cooldown) ---")
    # Send 4 more frames immediately while eyes remain closed
    extra_alerts = []
    for f in range(4):
        st4 = engine.event_state_machine.update_condition(
            s3, "eyes_closed", True, 0.92, f"Eyes closed frame {f+2}",
            required_duration_sec=win_eyes, quality_eval=quality_good,
            min_confidence=0.85, cooldown_sec=8.0, min_frames=3
        )
        beh4 = engine.behaviour_engine.evaluate(
            {"quality": quality_good, "gaze": {"eyes_closed": True, "confidence": 0.0}, "attention": {"status": "EYES_CLOSED"}},
            {}, {"eyes_closed": st4}, {"session_id": s3, "session_type": "EXAM", "monitoring_profile": "MODERATE"}
        )
        extra_alerts.extend([e for e in beh4["events"] if e["type"] == "EYES_CLOSED"])

    cond4 = (len(extra_alerts) == 0) and (st4["state"] in ("COOLDOWN", "ACTIVE"))
    record(4, "Repeated frames during same closure suppressed by cooldown", cond4, f"(duplicate alerts emitted={len(extra_alerts)}, state={st4['state']})")

    # =========================================================================
    # TEST 5: Brief left gaze -> NO ALERT
    # =========================================================================
    print("\n--- TEST 5: Brief left gaze -> NO ALERT ---")
    attn_engine = AttentionIntelligenceEngine()
    # Left gaze evaluated with 0.8s duration (< 3.0s threshold)
    eval5 = attn_engine.evaluate(
        "sess_gaze_5", "left", "Looking Straight", {"delta_pitch": 0.0, "delta_yaw": 0.0},
        face_detected=True, quality_eval=quality_good, looking_away_duration=0.8,
        session_type="EXAM", gaze_confidence=0.90, monitoring_profile="MODERATE"
    )
    s5 = f"sess_test_5_{int(time.time()*1000)}"
    st5 = engine.event_state_machine.update_condition(
        s5, "looking_away", True, 0.90, "Brief left look",
        required_duration_sec=win_dist, quality_eval=quality_good,
        min_confidence=conf_thresh["gaze_confirm"], min_observe_conf=conf_thresh["gaze_min_observe"],
        cooldown_sec=8.0, min_frames=3
    )
    cond5 = (not st5["confirmed"]) and (eval5["status"] == "BRIEF_NATURAL_DISTRACTION")
    record(5, "Brief left glance classified as natural without alert", cond5, f"(status={eval5['status']}, confirmed={st5['confirmed']})")

    # =========================================================================
    # TEST 6: Brief right gaze -> NO ALERT
    # =========================================================================
    print("\n--- TEST 6: Brief right gaze -> NO ALERT ---")
    eval6 = attn_engine.evaluate(
        "sess_gaze_6", "right", "Looking Straight", {"delta_pitch": 0.0, "delta_yaw": 0.0},
        face_detected=True, quality_eval=quality_good, looking_away_duration=0.8,
        session_type="EXAM", gaze_confidence=0.90, monitoring_profile="MODERATE"
    )
    s6 = f"sess_test_6_{int(time.time()*1000)}"
    st6 = engine.event_state_machine.update_condition(
        s6, "looking_away", True, 0.90, "Brief right look",
        required_duration_sec=win_dist, quality_eval=quality_good,
        min_confidence=conf_thresh["gaze_confirm"], min_observe_conf=conf_thresh["gaze_min_observe"],
        cooldown_sec=8.0, min_frames=3
    )
    cond6 = (not st6["confirmed"]) and (eval6["status"] == "BRIEF_NATURAL_DISTRACTION")
    record(6, "Brief right glance classified as natural without alert", cond6, f"(status={eval6['status']}, confirmed={st6['confirmed']})")

    # =========================================================================
    # TEST 7: Brief downward gaze -> NO ALERT
    # =========================================================================
    print("\n--- TEST 7: Brief downward gaze (keyboard / desk / paper) -> NO ALERT ---")
    eval7 = attn_engine.evaluate(
        "sess_gaze_7", "slight_down", "Looking Straight", {"delta_pitch": 0.0, "delta_yaw": 0.0},
        face_detected=True, quality_eval=quality_good, looking_away_duration=1.2,
        session_type="EXAM", gaze_confidence=0.92, monitoring_profile="MODERATE"
    )
    eval7b = attn_engine.evaluate(
        "sess_gaze_7b", "keyboard", "Looking Straight", {"delta_pitch": 0.0, "delta_yaw": 0.0},
        face_detected=True, quality_eval=quality_good, looking_away_duration=1.5,
        session_type="EXAM", gaze_confidence=0.90, monitoring_profile="MODERATE"
    )
    cond7 = (eval7["status"] == "FOCUSED") and (eval7b["status"] == "FOCUSED")
    record(7, "Downward glance to keyboard/paper treated as normal candidate behavior", cond7, f"(status={eval7['status']}, score={eval7['score']})")

    # =========================================================================
    # TEST 8: Offscreen gaze >= 3 seconds -> alert
    # =========================================================================
    print("\n--- TEST 8: Offscreen gaze >= 3 seconds -> alert ---")
    s8 = f"sess_test_8_{int(time.time()*1000)}"
    engine.event_state_machine.update_condition(
        s8, "looking_away", True, 0.92, "Looking away frame 1",
        required_duration_sec=win_dist, quality_eval=quality_good,
        min_confidence=conf_thresh["gaze_confirm"], min_observe_conf=conf_thresh["gaze_min_observe"],
        cooldown_sec=8.0, min_frames=3
    )
    time.sleep(1.55)
    engine.event_state_machine.update_condition(
        s8, "looking_away", True, 0.92, "Looking away frame 2",
        required_duration_sec=win_dist, quality_eval=quality_good,
        min_confidence=conf_thresh["gaze_confirm"], min_observe_conf=conf_thresh["gaze_min_observe"],
        cooldown_sec=8.0, min_frames=3
    )
    time.sleep(1.55)
    st8 = engine.event_state_machine.update_condition(
        s8, "looking_away", True, 0.92, "Looking away 3.1s",
        required_duration_sec=win_dist, quality_eval=quality_good,
        min_confidence=conf_thresh["gaze_confirm"], min_observe_conf=conf_thresh["gaze_min_observe"],
        cooldown_sec=8.0, min_frames=3
    )
    beh8 = engine.behaviour_engine.evaluate(
        {"quality": quality_good, "gaze": {"direction": "offscreen", "confidence": 0.92}, "attention": {"status": "PROLONGED_DISTRACTION"}},
        {}, {"looking_away": st8}, {"session_id": s8, "session_type": "EXAM", "monitoring_profile": "MODERATE"}
    )
    evts8 = [e for e in beh8["events"] if e["type"] in ("PROLONGED_DISTRACTION", "OFFSCREEN_GLANCE")]
    cond8 = st8["confirmed"] and (len(evts8) == 1) and (evts8[0]["severity"] == "MEDIUM")
    record(8, "Offscreen gaze >= 3.0s generated alert", cond8, f"(type={evts8[0]['type'] if evts8 else 'NONE'}, severity={evts8[0]['severity'] if evts8 else 'NONE'})")

    # =========================================================================
    # TEST 9: Low-confidence gaze -> NO ALERT
    # =========================================================================
    print("\n--- TEST 9: Low-confidence gaze (< 70%) -> NO ALERT ---")
    s9 = f"sess_test_9_{int(time.time()*1000)}"
    eval9 = attn_engine.evaluate(
        s9, "left", "Looking Straight", {"delta_pitch": 0.0, "delta_yaw": 0.0},
        face_detected=True, quality_eval=quality_good, looking_away_duration=4.0,
        session_type="EXAM", gaze_confidence=0.55, monitoring_profile="MODERATE"
    )
    st9 = engine.event_state_machine.update_condition(
        s9, "looking_away", True, 0.55, "Low confidence look away",
        required_duration_sec=win_dist, quality_eval=quality_good,
        min_confidence=conf_thresh["gaze_confirm"], min_observe_conf=conf_thresh["gaze_min_observe"],
        cooldown_sec=8.0, min_frames=3
    )
    cond9 = (not st9["confirmed"]) and (eval9["status"] == "FOCUSED")
    record(9, "Low-confidence gaze (<70%) ignored without alert", cond9, f"(attention_status={eval9['status']}, confirmed={st9['confirmed']})")

    # =========================================================================
    # TEST 10: Small head movement -> NO ALERT
    # =========================================================================
    print("\n--- TEST 10: Small head movement -> NO ALERT ---")
    s10 = f"sess_test_10_{int(time.time()*1000)}"
    # Moderate profile yaw threshold = 35.0 deg. Small movement yaw = 15.0 deg.
    is_head_turned_small = 15.0 > conf_thresh["pose_yaw_deg"]
    st10 = engine.event_state_machine.update_condition(
        s10, "head_turned", is_head_turned_small, 0.88, "Small head movement",
        required_duration_sec=win_head, quality_eval=quality_good,
        min_confidence=0.85, cooldown_sec=8.0, min_frames=3
    )
    cond10 = (not st10["confirmed"]) and (not is_head_turned_small)
    record(10, "Small head movement (yaw 15 deg < 35 deg) ignored without alert", cond10, f"(yaw_turned={is_head_turned_small}, confirmed={st10['confirmed']})")

    # =========================================================================
    # TEST 11: Sustained head turn -> alert
    # =========================================================================
    print("\n--- TEST 11: Sustained head turn (yaw 45 deg >= 3s) -> alert ---")
    s11 = f"sess_test_11_{int(time.time()*1000)}"
    is_head_turned_large = 45.0 > conf_thresh["pose_yaw_deg"]
    engine.event_state_machine.update_condition(
        s11, "head_turned", is_head_turned_large, 0.90, "Head turned start",
        required_duration_sec=win_head, quality_eval=quality_good,
        min_confidence=0.85, cooldown_sec=8.0, min_frames=3
    )
    time.sleep(1.55)
    engine.event_state_machine.update_condition(
        s11, "head_turned", is_head_turned_large, 0.90, "Head turned mid",
        required_duration_sec=win_head, quality_eval=quality_good,
        min_confidence=0.85, cooldown_sec=8.0, min_frames=3
    )
    time.sleep(1.55)
    st11 = engine.event_state_machine.update_condition(
        s11, "head_turned", is_head_turned_large, 0.90, "Head turned 3.1s",
        required_duration_sec=win_head, quality_eval=quality_good,
        min_confidence=0.85, cooldown_sec=8.0, min_frames=3
    )
    beh11 = engine.behaviour_engine.evaluate(
        {"quality": quality_good, "head_pose": {"yaw": 45.0, "pitch": 5.0}},
        {}, {"head_turned": st11}, {"session_id": s11, "session_type": "EXAM", "monitoring_profile": "MODERATE"}
    )
    evts11 = [e for e in beh11["events"] if e["type"] == "HEAD_TURNED"]
    cond11 = st11["confirmed"] and (len(evts11) == 1) and (evts11[0]["severity"] == "MEDIUM")
    record(11, "Sustained head turn (yaw 45 deg >= 3s) confirmed as HEAD_TURNED", cond11, f"(events={len(evts11)}, severity={evts11[0]['severity'] if evts11 else 'NONE'})")

    # =========================================================================
    # TEST 12: Brief face loss -> NO ALERT
    # =========================================================================
    print("\n--- TEST 12: Brief face loss (< 1.0s, grace period = 2.0s) -> NO ALERT ---")
    s12 = f"sess_test_12_{int(time.time()*1000)}"
    st12 = engine.event_state_machine.update_condition(
        s12, "no_face", True, 0.95, "Brief face disappearance",
        required_duration_sec=win_face, quality_eval=quality_good,
        min_confidence=0.75, cooldown_sec=8.0, min_frames=2
    )
    time.sleep(0.4)
    st12_b = engine.event_state_machine.update_condition(
        s12, "no_face", False, 0.95, "Face returns",
        required_duration_sec=win_face, quality_eval=quality_good,
        min_confidence=0.75, cooldown_sec=8.0, min_frames=2
    )
    cond12 = (not st12["confirmed"]) and (not st12_b["confirmed"])
    record(12, "Brief face absence (< 1.0s) within grace period ignored without alert", cond12, f"(confirmed={st12['confirmed']})")

    # =========================================================================
    # TEST 13: Face missing > configured grace period -> alert
    # =========================================================================
    print("\n--- TEST 13: Face missing > grace period (2.0s) -> alert ---")
    s13 = f"sess_test_13_{int(time.time()*1000)}"
    engine.event_state_machine.update_condition(
        s13, "no_face", True, 0.95, "Face missing start",
        required_duration_sec=win_face, quality_eval=quality_good,
        min_confidence=0.75, cooldown_sec=8.0, min_frames=2
    )
    time.sleep(2.1)
    st13 = engine.event_state_machine.update_condition(
        s13, "no_face", True, 0.95, "Face missing 2.1s",
        required_duration_sec=win_face, quality_eval=quality_good,
        min_confidence=0.75, cooldown_sec=8.0, min_frames=2
    )
    beh13 = engine.behaviour_engine.evaluate(
        {"quality": quality_good, "face_detected": False},
        {}, {"no_face": st13}, {"session_id": s13, "session_type": "EXAM", "monitoring_profile": "MODERATE"}
    )
    evts13 = [e for e in beh13["events"] if e["type"] == "USER_ABSENT"]
    cond13 = st13["confirmed"] and (len(evts13) == 1) and (evts13[0]["severity"] == "HIGH")
    record(13, "Face missing > 2.0s grace period confirmed as USER_ABSENT", cond13, f"(events={len(evts13)}, severity={evts13[0]['severity'] if evts13 else 'NONE'})")

    # =========================================================================
    # TEST 14: Single-frame phone detection -> NO ALERT
    # =========================================================================
    print("\n--- TEST 14: Single-frame phone detection -> NO ALERT ---")
    s14 = f"sess_test_14_{int(time.time()*1000)}"
    st14 = engine.event_state_machine.update_condition(
        s14, "phone", True, 0.92, "Single frame phone",
        required_duration_sec=win_phone, quality_eval=quality_good,
        min_confidence=0.80, cooldown_sec=8.0, min_frames=2
    )
    cond14 = (not st14["confirmed"]) and (not st14["should_alert"])
    record(14, "Single-frame phone detection suppressed by temporal engine", cond14, f"(confirmed={st14['confirmed']}, consecutive_count={st14.get('consecutive_count')})")

    # =========================================================================
    # TEST 15: Persistent phone -> PHONE DETECTED
    # =========================================================================
    print("\n--- TEST 15: Persistent phone (>= 0.8s) -> PHONE DETECTED ---")
    s15 = f"sess_test_15_{int(time.time()*1000)}"
    engine.event_state_machine.update_condition(
        s15, "phone", True, 0.92, "Phone frame 1",
        required_duration_sec=win_phone, quality_eval=quality_good,
        min_confidence=0.80, cooldown_sec=8.0, min_frames=2
    )
    time.sleep(0.85)
    st15 = engine.event_state_machine.update_condition(
        s15, "phone", True, 0.92, "Phone frame 2 (0.85s)",
        required_duration_sec=win_phone, quality_eval=quality_good,
        min_confidence=0.80, cooldown_sec=8.0, min_frames=2
    )
    beh15 = engine.behaviour_engine.evaluate(
        {"quality": quality_good, "environment": {"phone_detected": True}},
        {}, {"phone": st15}, {"session_id": s15, "session_type": "EXAM", "monitoring_profile": "MODERATE"}
    )
    evts15 = [e for e in beh15["events"] if e["type"] == "MOBILE_PHONE_DETECTED"]
    cond15 = st15["confirmed"] and (len(evts15) == 1) and (evts15[0]["severity"] in ("HIGH", "CRITICAL"))
    record(15, "Persistent phone detection confirmed as MOBILE_PHONE_DETECTED", cond15, f"(events={len(evts15)}, severity={evts15[0]['severity'] if evts15 else 'NONE'})")

    # =========================================================================
    # TEST 16: Second person persistent -> MULTIPLE_PEOPLE_DETECTED
    # =========================================================================
    print("\n--- TEST 16: Second person persistent (>= 0.8s) -> MULTIPLE_PEOPLE_DETECTED ---")
    s16 = f"sess_test_16_{int(time.time()*1000)}"
    engine.event_state_machine.update_condition(
        s16, "multiple_persons", True, 0.90, "Multiple persons frame 1",
        required_duration_sec=win_multi, quality_eval=quality_good,
        min_confidence=0.80, cooldown_sec=8.0, min_frames=2
    )
    time.sleep(0.85)
    st16 = engine.event_state_machine.update_condition(
        s16, "multiple_persons", True, 0.90, "Multiple persons frame 2 (0.85s)",
        required_duration_sec=win_multi, quality_eval=quality_good,
        min_confidence=0.80, cooldown_sec=8.0, min_frames=2
    )
    beh16 = engine.behaviour_engine.evaluate(
        {"quality": quality_good, "environment": {"person_count": 2}},
        {}, {"multiple_persons": st16}, {"session_id": s16, "session_type": "EXAM", "monitoring_profile": "MODERATE"}
    )
    evts16 = [e for e in beh16["events"] if e["type"] == "MULTIPLE_PEOPLE_DETECTED"]
    cond16 = st16["confirmed"] and (len(evts16) == 1) and (evts16[0]["severity"] == "CRITICAL")
    record(16, "Second person confirmed as MULTIPLE_PEOPLE_DETECTED (HIGH PRIORITY CRITICAL)", cond16, f"(events={len(evts16)}, severity={evts16[0]['severity'] if evts16 else 'NONE'})")

    # =========================================================================
    # TEST 17: Spoof detection -> remains HIGH PRIORITY
    # =========================================================================
    print("\n--- TEST 17: Spoof detection -> remains HIGH PRIORITY (CRITICAL) ---")
    s17 = f"sess_test_17_{int(time.time()*1000)}"
    engine.event_state_machine.update_condition(
        s17, "spoof", True, 0.96, "Biometric presentation attack frame 1",
        required_duration_sec=win_spoof, quality_eval=quality_good,
        min_confidence=0.70, cooldown_sec=8.0, min_frames=2
    )
    time.sleep(0.40)
    st17 = engine.event_state_machine.update_condition(
        s17, "spoof", True, 0.96, "Biometric presentation attack frame 2",
        required_duration_sec=win_spoof, quality_eval=quality_good,
        min_confidence=0.70, cooldown_sec=8.0, min_frames=2
    )
    beh17 = engine.behaviour_engine.evaluate(
        {"quality": quality_good, "face_detected": True, "liveness": {"is_live": False, "status": "spoof", "p_spoof": 0.96, "attack_type": "PRINT_ATTACK"}},
        {}, {"spoof": st17}, {"session_id": s17, "session_type": "EXAM", "monitoring_profile": "MODERATE"}
    )
    evts17 = [e for e in beh17["events"] if e["type"] == "SPOOF_DETECTED"]
    cond17 = st17["confirmed"] and (len(evts17) == 1) and (evts17[0]["severity"] == "CRITICAL")
    record(17, "Spoof detection confirmed as SPOOF_DETECTED (CRITICAL, strict anti-spoofing intact)", cond17, f"(events={len(evts17)}, severity={evts17[0]['severity'] if evts17 else 'NONE'})")

    # =========================================================================
    # TEST 18: Tab switches 1/3 -> warning
    # =========================================================================
    print("\n--- TEST 18: Tab switches 1/3 -> warning ---")
    tab1 = evaluate_tab_switch(1, max_allowed=3)
    cond18 = (tab1["status"] == "WARNING") and (tab1["event_type"] == "TAB_SWITCH_DETECTED") and ("Warning 1 of 3" in tab1["message"]) and (not tab1["is_terminated"])
    record(18, "Tab switch 1/3 produces warning", cond18, f"(status={tab1['status']}, msg='{tab1['message']}')")

    # =========================================================================
    # TEST 19: Tab switches 3/3 -> final warning
    # =========================================================================
    print("\n--- TEST 19: Tab switches 3/3 -> final warning ---")
    tab3 = evaluate_tab_switch(3, max_allowed=3)
    cond19 = (tab3["status"] == "FINAL_WARNING") and ("Final warning" in tab3["message"]) and (not tab3["is_terminated"])
    record(19, "Tab switch 3/3 produces final warning", cond19, f"(status={tab3['status']}, msg='{tab3['message']}')")

    # =========================================================================
    # TEST 20: Tab switch 4/3 -> terminate
    # =========================================================================
    print("\n--- TEST 20: Tab switch 4/3 -> terminate (CRITICAL) ---")
    tab4 = evaluate_tab_switch(4, max_allowed=3)
    cond20 = (tab4["status"] == "TERMINATED") and (tab4["event_type"] == "TAB_SWITCH_LIMIT_EXCEEDED") and (tab4["severity"] == "CRITICAL") and tab4["is_terminated"]
    record(20, "Tab switch 4/3 terminates session with TAB_SWITCH_LIMIT_EXCEEDED (CRITICAL)", cond20, f"(status={tab4['status']}, severity={tab4['severity']}, event={tab4['event_type']})")

    # =========================================================================
    # SUMMARY
    # =========================================================================
    print("\n" + "=" * 75)
    print(f"  TOTAL TESTS RUN: 20 | PASSED: {len(passed_tests)} | FAILED: {len(failed_tests)}")
    print("=" * 75)
    if failed_tests:
        print("\nFailed Tests:")
        for ft in failed_tests:
            print(f"  - {ft}")
        sys.exit(1)
    else:
        print("\n🎉 ALL 20 MODERATE EXAMINATION MONITORING TESTS PASSED PERFECTLY!\n")


if __name__ == "__main__":
    run_all_20_tests()
