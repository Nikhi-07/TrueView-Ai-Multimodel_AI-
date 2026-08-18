"""
Context-Aware Behaviour Engine – TrueView AI Engine

Evaluates temporal confirmation states, context policies, and quality metrics
to produce confirmed behavioural events with non-judgmental classifications.
"""

import time
import uuid
from typing import Dict, Any, List
from trueview_engine.policy.policy_engine import PolicyEngine


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

        # 1. Phone & Restricted Object Detection
        phone_st = confirmed_states.get("phone", {})
        if phone_st.get("confirmed") and not policy.phone_allowed:
            events.append({
                "event_id": f"evt_{uuid.uuid4().hex[:8]}",
                "session_id": session_id,
                "timestamp": now_str,
                "type": "PHONE_DETECTED",
                "severity": "CRITICAL" if session_type == "EXAM" else "HIGH",
                "confidence": phone_st.get("confidence", 0.92),
                "duration": phone_st.get("duration", 0.0),
                "evidence": "Mobile phone visible in camera view.",
                "state": phone_st.get("state", "CONFIRMED")
            })

        # Check secondary prohibited objects in environment
        env_objects = fused_features.get("environment", {}).get("objects", [])
        for obj in env_objects:
            obj_label = obj.get("label", "").lower()
            if obj_label in ("book", "notes", "laptop", "remote") and obj_label in policy.restricted_objects:
                events.append({
                    "event_id": f"evt_{uuid.uuid4().hex[:8]}",
                    "session_id": session_id,
                    "timestamp": now_str,
                    "type": f"{obj_label.upper()}_DETECTED",
                    "severity": "HIGH" if session_type == "EXAM" else "MEDIUM",
                    "confidence": obj.get("confidence", 0.80),
                    "duration": 1.0,
                    "evidence": f"Restricted object ({obj_label}) detected in frame.",
                    "state": "CONFIRMED"
                })

        # 2. Multiple Persons
        multi_st = confirmed_states.get("multiple_persons", {})
        if multi_st.get("confirmed") and not policy.multi_person_allowed:
            person_cnt = fused_features.get("environment", {}).get("person_count", 2)
            events.append({
                "event_id": f"evt_{uuid.uuid4().hex[:8]}",
                "session_id": session_id,
                "timestamp": now_str,
                "type": "MULTIPLE_PERSONS",
                "severity": "CRITICAL" if session_type == "EXAM" else "HIGH",
                "confidence": multi_st.get("confidence", 0.90),
                "duration": multi_st.get("duration", 0.0),
                "evidence": f"{person_cnt} persons detected in frame.",
                "state": multi_st.get("state", "CONFIRMED")
            })

        # 3. User Absent / No Face (Quality-aware!)
        quality_eval = fused_features.get("quality", {})
        no_face_st = confirmed_states.get("no_face", {})
        if no_face_st.get("confirmed"):
            if quality_eval.get("video_quality") in ("POOR", "UNRELIABLE"):
                # Downgrade to monitoring uncertainty due to poor lighting / visibility
                events.append({
                    "event_id": f"evt_{uuid.uuid4().hex[:8]}",
                    "session_id": session_id,
                    "timestamp": now_str,
                    "type": "MONITORING_UNCERTAIN_DUE_TO_POOR_VISIBILITY",
                    "severity": "LOW",
                    "confidence": 0.60,
                    "duration": no_face_st.get("duration", 0.0),
                    "evidence": "Face not detected due to low lighting or camera obstruction.",
                    "state": "OBSERVING"
                })
            else:
                events.append({
                    "event_id": f"evt_{uuid.uuid4().hex[:8]}",
                    "session_id": session_id,
                    "timestamp": now_str,
                    "type": "USER_ABSENT",
                    "severity": "HIGH",
                    "confidence": no_face_st.get("confidence", 0.95),
                    "duration": no_face_st.get("duration", 0.0),
                    "evidence": "Candidate not visible in camera view.",
                    "state": no_face_st.get("state", "CONFIRMED")
                })

        # 4. Looking Away / Prolonged Distraction
        dist_st = confirmed_states.get("looking_away", {})
        if dist_st.get("confirmed"):
            dur = dist_st.get("duration", 0.0)
            attn_st = fused_features.get("attention", {}).get("status", "PROLONGED_DISTRACTION")
            events.append({
                "event_id": f"evt_{uuid.uuid4().hex[:8]}",
                "session_id": session_id,
                "timestamp": now_str,
                "type": attn_st,
                "severity": "MEDIUM" if dur < 5.0 else "HIGH",
                "confidence": dist_st.get("confidence", 0.88),
                "duration": dur,
                "evidence": f"Candidate attention status: {attn_st} ({dur}s).",
                "state": dist_st.get("state", "CONFIRMED")
            })

        # 5. Speaking Detection (Context-dependent!)
        speak_st = confirmed_states.get("speaking", {})
        if speak_st.get("confirmed") and not policy.speaking_allowed:
            events.append({
                "event_id": f"evt_{uuid.uuid4().hex[:8]}",
                "session_id": session_id,
                "timestamp": now_str,
                "type": "SPEAKING_DETECTED",
                "severity": "HIGH" if session_type == "EXAM" else "LOW",
                "confidence": speak_st.get("confidence", 0.85),
                "duration": speak_st.get("duration", 0.0),
                "evidence": "Voice activity detected during examination.",
                "state": speak_st.get("state", "CONFIRMED")
            })

        # 6. Presentation Attack / Liveness Failure (ConvNeXt-Tiny Run 04)
        liv_eval = fused_features.get("liveness", {})
        if liv_eval.get("is_live") is False or liv_eval.get("status") in ("fake", "spoof"):
            attack_type = liv_eval.get("attack_type", "NONE")
            p_spoof = float(liv_eval.get("p_spoof", 0.95))
            events.append({
                "event_id": f"evt_{uuid.uuid4().hex[:8]}",
                "session_id": session_id,
                "timestamp": now_str,
                "type": "SPOOF_DETECTED",
                "severity": "CRITICAL",
                "confidence": round(p_spoof, 4),
                "duration": 1.0,
                "evidence": f"Presentation attack detected ({attack_type}).",
                "state": "CONFIRMED"
            })

        # State classification
        if any(e["severity"] == "CRITICAL" for e in events):
            current_state = "critical_violation"
        elif any(e["severity"] in ("HIGH", "MEDIUM") for e in events):
            current_state = "warning"
        elif events:
            current_state = "observation"
        else:
            current_state = "normal"

        return {
            "current_state": current_state,
            "events": events,
        }
