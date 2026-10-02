"""
Context-Aware Behaviour Engine – TrueView AI Engine

Evaluates temporal confirmation states, context policies, and quality metrics
to produce confirmed behavioural events with non-judgmental classifications.
"""

import time
import uuid
from typing import Dict, Any, List, Optional
from trueview_engine.policy.policy_engine import PolicyEngine


def _should_emit(st: Optional[Dict[str, Any]]) -> bool:
    if not st:
        return False
    if "should_alert" in st:
        return bool(st["should_alert"])
    if "state" in st:
        return st["state"] == "ALERTED"
    return bool(st.get("confirmed", False))


class BehaviourEngine:
    """
    Context-aware Behaviour Analysis Engine.
    """

    def __init__(self):
        self.policy_engine = PolicyEngine()

    def evaluate(
        self,
        fused_features: Dict[str, Any],
        temporal_analysis: Dict[str, Any],
        confirmed_states: Dict[str, Any],
        session_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Evaluate multimodal features against context rule profile.
        """
        session_id = session_context.get("session_id", "session_unknown")
        session_type = session_context.get("session_type", "EXAM").upper()
        now_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        policy = self.policy_engine.get_policy(session_type)
        events: List[Dict[str, Any]] = []
        active_violation_types: List[str] = []

        # 1. Phone Detection (Temporal Confirmation >= 0.8s)
        phone_st = confirmed_states.get("phone", {})
        if phone_st.get("confirmed") and not policy.phone_allowed:
            active_violation_types.append("MOBILE_PHONE_DETECTED")
            if _should_emit(phone_st):
                events.append({
                    "event_id": f"evt_{uuid.uuid4().hex[:8]}",
                    "session_id": session_id,
                    "timestamp": now_str,
                    "type": "MOBILE_PHONE_DETECTED",
                    "category": "PROHIBITED_OBJECT",
                    "severity": "HIGH" if session_context.get("monitoring_profile") == "MODERATE" else ("CRITICAL" if session_type == "EXAM" else "HIGH"),
                    "confidence": phone_st.get("confidence", 0.92),
                    "duration": phone_st.get("duration", 0.0),
                    "source": "YOLO",
                    "message": "Mobile phone detected in candidate workspace",
                    "evidence": "Mobile phone visible in camera view.",
                    "state": "ALERTED",
                    "should_alert": True,
                    "in_cooldown": False,
                    "metadata": {"source": "yolo", "policy": session_type}
                })

        # Check secondary prohibited objects in environment (with temporal confirmation)
        sec_objs = confirmed_states.get("secondary_objects", {})
        for obj_label, obj_st in sec_objs.items():
            if obj_label in policy.restricted_objects or not policy.phone_allowed:
                if obj_st.get("confirmed"):
                    canon_label = f"{obj_label.upper()}_DETECTED"
                    active_violation_types.append(canon_label)
                    if _should_emit(obj_st):
                        events.append({
                            "event_id": f"evt_{uuid.uuid4().hex[:8]}",
                            "session_id": session_id,
                            "timestamp": now_str,
                            "type": canon_label,
                            "category": "PROHIBITED_OBJECT",
                            "severity": "HIGH" if session_type == "EXAM" else "MEDIUM",
                            "confidence": obj_st.get("confidence", 0.80),
                            "duration": obj_st.get("duration", 0.0),
                            "source": "YOLO",
                            "message": f"Restricted object ({obj_label}) detected in frame.",
                            "evidence": f"Restricted object ({obj_label}) confirmed in frame ({obj_st.get('duration', 0.0)}s).",
                            "state": "ALERTED",
                            "should_alert": True,
                            "in_cooldown": False,
                            "metadata": {"label": obj_label}
                        })

        # 2. Multiple Persons (HIGH PRIORITY)
        multi_st = confirmed_states.get("multiple_persons", {})
        if multi_st.get("confirmed") and not policy.multi_person_allowed:
            active_violation_types.append("MULTIPLE_PEOPLE_DETECTED")
            if _should_emit(multi_st):
                person_cnt = fused_features.get("environment", {}).get("person_count", 2)
                events.append({
                    "event_id": f"evt_{uuid.uuid4().hex[:8]}",
                    "session_id": session_id,
                    "timestamp": now_str,
                    "type": "MULTIPLE_PEOPLE_DETECTED",
                    "category": "OBJECT_DETECTION",
                    "severity": "CRITICAL" if session_type == "EXAM" else "HIGH",
                    "confidence": multi_st.get("confidence", 0.90),
                    "duration": multi_st.get("duration", 0.0),
                    "source": "YOLO",
                    "message": f"Multiple people detected in candidate workspace ({person_cnt} persons)",
                    "evidence": f"{person_cnt} persons detected in frame.",
                    "state": "ALERTED",
                    "should_alert": True,
                    "in_cooldown": False,
                    "metadata": {"person_count": person_cnt}
                })

        # 3. User Absent / No Face (Quality-aware with >= 2.0s grace period)
        quality_eval = fused_features.get("quality", {})
        no_face_st = confirmed_states.get("no_face", {})
        if no_face_st.get("confirmed"):
            if quality_eval.get("video_quality") in ("POOR", "UNRELIABLE"):
                active_violation_types.append("MONITORING_UNCERTAIN_DUE_TO_POOR_VISIBILITY")
                if _should_emit(no_face_st):
                    events.append({
                        "event_id": f"evt_{uuid.uuid4().hex[:8]}",
                        "session_id": session_id,
                        "timestamp": now_str,
                        "type": "MONITORING_UNCERTAIN_DUE_TO_POOR_VISIBILITY",
                        "category": "QUALITY",
                        "severity": "LOW",
                        "confidence": 0.60,
                        "duration": no_face_st.get("duration", 0.0),
                        "source": "VISION",
                        "message": "Face not detected due to low lighting or camera obstruction.",
                        "evidence": "Face not detected due to low lighting or camera obstruction.",
                        "state": "ALERTED",
                        "should_alert": True,
                        "in_cooldown": False,
                        "metadata": {}
                    })
            else:
                active_violation_types.append("USER_ABSENT")
                if _should_emit(no_face_st):
                    events.append({
                        "event_id": f"evt_{uuid.uuid4().hex[:8]}",
                        "session_id": session_id,
                        "timestamp": now_str,
                        "type": "USER_ABSENT",
                        "category": "PRESENCE",
                        "severity": "HIGH",
                        "confidence": no_face_st.get("confidence", 0.95),
                        "duration": no_face_st.get("duration", 0.0),
                        "source": "VISION",
                        "message": "Candidate not visible in camera view.",
                        "evidence": "Candidate not visible in camera view.",
                        "state": "ALERTED",
                        "should_alert": True,
                        "in_cooldown": False,
                        "metadata": {}
                    })

        # 4. Looking Away / Prolonged Distraction (Sustained >= 3.0s in moderate, MEDIUM severity)
        dist_st = confirmed_states.get("looking_away", {})
        if dist_st.get("confirmed"):
            dur = dist_st.get("duration", 0.0)
            attn_st = fused_features.get("attention", {}).get("status", "PROLONGED_DISTRACTION")
            canon_type = "PROLONGED_DISTRACTION" if dur >= 3.0 else "OFFSCREEN_GLANCE"
            active_violation_types.append(canon_type)
            if _should_emit(dist_st):
                events.append({
                    "event_id": f"evt_{uuid.uuid4().hex[:8]}",
                    "session_id": session_id,
                    "timestamp": now_str,
                    "type": canon_type,
                    "category": "GAZE",
                    "severity": "MEDIUM",
                    "confidence": dist_st.get("confidence", 0.88),
                    "duration": dur,
                    "source": "EYE_GAZE",
                    "message": "Candidate looking away from screen",
                    "evidence": f"Candidate attention status: {attn_st} ({dur}s).",
                    "state": "ALERTED",
                    "should_alert": True,
                    "in_cooldown": False,
                    "metadata": {"duration_sec": dur}
                })

        # 5. Eyes Closed Detection (Continuous >= 2.5s in moderate, MEDIUM severity)
        eyes_st = confirmed_states.get("eyes_closed", {})
        if eyes_st.get("confirmed"):
            dur = eyes_st.get("duration", 0.0)
            active_violation_types.append("EYES_CLOSED")
            if _should_emit(eyes_st):
                events.append({
                    "event_id": f"evt_{uuid.uuid4().hex[:8]}",
                    "session_id": session_id,
                    "timestamp": now_str,
                    "type": "EYES_CLOSED",
                    "category": "EYE_GAZE",
                    "severity": "MEDIUM",
                    "confidence": eyes_st.get("confidence", 0.90),
                    "duration": dur,
                    "source": "EYE_GAZE",
                    "message": "Candidate eyes appear closed",
                    "evidence": f"Candidate eyes closed continuously beyond threshold ({dur}s).",
                    "state": "ALERTED",
                    "should_alert": True,
                    "in_cooldown": False,
                    "metadata": {"duration_sec": dur}
                })

        # 6. Head Pose Deviation (Head Turned / Head Movement >= 3.0s, MEDIUM severity)
        head_turn_st = confirmed_states.get("head_turned", {})
        if head_turn_st.get("confirmed"):
            dur = head_turn_st.get("duration", 0.0)
            active_violation_types.append("HEAD_TURNED")
            if _should_emit(head_turn_st):
                events.append({
                    "event_id": f"evt_{uuid.uuid4().hex[:8]}",
                    "session_id": session_id,
                    "timestamp": now_str,
                    "type": "HEAD_TURNED",
                    "category": "HEAD_POSE",
                    "severity": "MEDIUM",
                    "confidence": head_turn_st.get("confidence", 0.88),
                    "duration": dur,
                    "source": "HEAD_POSE",
                    "message": "Candidate head turned away from screen",
                    "evidence": head_turn_st.get("evidence", "Candidate head turned sideways."),
                    "state": "ALERTED",
                    "should_alert": True,
                    "in_cooldown": False,
                    "metadata": {"duration_sec": dur}
                })

        head_move_st = confirmed_states.get("head_movement", {})
        if head_move_st.get("confirmed"):
            dur = head_move_st.get("duration", 0.0)
            active_violation_types.append("HEAD_MOVEMENT")
            if _should_emit(head_move_st):
                events.append({
                    "event_id": f"evt_{uuid.uuid4().hex[:8]}",
                    "session_id": session_id,
                    "timestamp": now_str,
                    "type": "HEAD_MOVEMENT",
                    "category": "HEAD_POSE",
                    "severity": "MEDIUM",
                    "confidence": head_move_st.get("confidence", 0.85),
                    "duration": dur,
                    "source": "HEAD_POSE",
                    "message": "Significant vertical head movement",
                    "evidence": head_move_st.get("evidence", "Significant vertical head tilt or movement."),
                    "state": "ALERTED",
                    "should_alert": True,
                    "in_cooldown": False,
                    "metadata": {"duration_sec": dur}
                })

        # 7. Speaking Detection (Persistent >= 2.0s, MEDIUM severity)
        speak_st = confirmed_states.get("speaking", {})
        if speak_st.get("confirmed") and not policy.speaking_allowed:
            dur = speak_st.get("duration", 0.0)
            active_violation_types.append("SPEAKING_DETECTED")
            if _should_emit(speak_st):
                events.append({
                    "event_id": f"evt_{uuid.uuid4().hex[:8]}",
                    "session_id": session_id,
                    "timestamp": now_str,
                    "type": "SPEAKING_DETECTED",
                    "category": "VOICE",
                    "severity": "MEDIUM" if session_type == "EXAM" else "LOW",
                    "confidence": speak_st.get("confidence", 0.85),
                    "duration": dur,
                    "source": "VOICE_VAD",
                    "message": "Voice activity detected during monitored session",
                    "evidence": f"Voice activity detected during examination ({dur}s).",
                    "state": "ALERTED",
                    "should_alert": True,
                    "in_cooldown": False,
                    "metadata": {}
                })

        # 8. Presentation Attack / Liveness Failure (ConvNeXt-Tiny Run 04) - remains strict, HIGH PRIORITY
        liv_eval = fused_features.get("liveness", {})
        if fused_features.get("face_detected", False) and (liv_eval.get("is_live") is False or liv_eval.get("status") in ("fake", "spoof")):
            attack_type = liv_eval.get("attack_type", "NONE")
            p_spoof = float(liv_eval.get("p_spoof", 0.95))
            active_violation_types.append("SPOOF_DETECTED")
            spoof_st = confirmed_states.get("spoof", {})
            if not spoof_st or _should_emit(spoof_st):
                events.append({
                    "event_id": f"evt_{uuid.uuid4().hex[:8]}",
                    "session_id": session_id,
                    "timestamp": now_str,
                    "type": "SPOOF_DETECTED",
                    "category": "LIVENESS",
                    "severity": "CRITICAL",
                    "confidence": round(p_spoof, 4),
                    "duration": spoof_st.get("duration", 1.0),
                    "source": "CONVNEXT_PAD",
                    "message": "Presentation attack / spoof detected",
                    "evidence": f"Presentation attack detected ({attack_type}).",
                    "state": "ALERTED",
                    "should_alert": True,
                    "in_cooldown": False,
                    "metadata": {"attack_type": attack_type, "p_spoof": p_spoof}
                })

        # 9. Identity Mismatch / Candidate Replacement - remains strict, HIGH PRIORITY
        ident_eval = fused_features.get("identity", {})
        ident_status = ident_eval.get("status")
        if (
            ident_status in ("IDENTITY_MISMATCH", "POSSIBLE_USER_REPLACEMENT")
            and not ident_eval.get("recognition_unavailable")
            and fused_features.get("face_detected", True)
        ):
            active_violation_types.append("IDENTITY_MISMATCH")
            events.append({
                "event_id": f"evt_{uuid.uuid4().hex[:8]}",
                "session_id": session_id,
                "timestamp": now_str,
                "type": "IDENTITY_MISMATCH",
                "category": "BIOMETRIC_IDENTITY",
                "severity": "CRITICAL" if session_type == "EXAM" else "HIGH",
                "confidence": ident_eval.get("confidence", 0.90),
                "duration": 1.0,
                "source": "SFACE_RECOGNITION",
                "message": "Registered candidate face not detected",
                "evidence": "Registered candidate not detected. Visible face does not match registered biometric profile.",
                "state": "ALERTED",
                "should_alert": True,
                "in_cooldown": False,
                "metadata": {"status": ident_status}
            })

        # State classification based on active violations
        if any(t in ("SPOOF_DETECTED", "MULTIPLE_PEOPLE_DETECTED", "IDENTITY_MISMATCH") for t in active_violation_types):
            current_state = "critical_violation"
        elif active_violation_types:
            current_state = "warning"
        elif events:
            current_state = "observation"
        else:
            current_state = "normal"

        return {
            "current_state": current_state,
            "events": events,
            "active_violation_types": active_violation_types,
        }
