"""
Master TrueView AI Engine Orchestrator – TrueView AI Engine

Central entry point coordinating Vision, Audio, Input Quality, Personal Calibration,
Continuous Authentication, Liveness Strategy, Multimodal Feature Fusion, Temporal Memory,
Event Confirmation, Event Correlation, Context Policy, Uncertainty, Behaviour, Decision,
Dynamic Risk, and Explainable AI modules behind ONE unified interface.
"""

import time
import uuid
import cv2
import numpy as np
import base64
from typing import Dict, Any, Optional, List

from trueview_engine.models.model_manager import ModelManager
from trueview_engine.vision.shared_face_pipeline import SharedFacePipeline
from trueview_engine.audio.audio_pipeline import ContinuousAudioPipeline
from trueview_engine.quality.input_quality_engine import InputQualityEngine
from trueview_engine.calibration.session_calibration import SessionCalibrator
from trueview_engine.identity.continuous_auth import ContinuousAuthenticator
from trueview_engine.liveness.liveness_strategy import LivenessStrategyManager
from trueview_engine.attention.attention_intelligence import AttentionIntelligenceEngine
from trueview_engine.fusion.feature_fusion import MultimodalFeatureFusion
from trueview_engine.fusion.confidence_fusion import ConfidenceFusionEngine
from trueview_engine.temporal.memory_engine import TemporalMemoryEngine
from trueview_engine.temporal.event_confirmation import EventConfirmationStateMachine
from trueview_engine.correlation.event_correlation import EventCorrelationEngine
from trueview_engine.policy.policy_engine import PolicyEngine
from trueview_engine.uncertainty.uncertainty_engine import UncertaintyEngine
from trueview_engine.behaviour.behaviour_engine import BehaviourEngine
from trueview_engine.decision.unified_decision_engine import UnifiedDecisionEngine
from trueview_engine.explainability.explanation_engine import ExplainabilityEngine
from trueview_engine.scheduler.adaptive_scheduler import AdaptiveInferenceScheduler
from trueview_engine.session.session_manager import SessionManager

from trueview_engine.schemas.input_schema import UnifiedMonitoringInput
from trueview_engine.schemas.output_schema import (
    UnifiedMonitoringOutput,
    QualityStatus,
    IdentityStatus,
    LivenessStatus,
    AttentionStatus,
    AudioStatus,
    EnvironmentStatus,
    BehaviourSummary,
    BehaviourEventItem,
    CorrelatedPatternItem,
    RiskSummary,
    DecisionSummary,
    ExplanationSummary,
    ExplanationItem,
    PerformanceMetrics,
    ModuleHealthStatus,
)
from trueview_engine.config.thresholds import (
    TEMPORAL_WINDOW_PHONE_SECS,
    TEMPORAL_WINDOW_MULTIPLE_PERSONS,
    TEMPORAL_WINDOW_NO_FACE,
    TEMPORAL_WINDOW_LOOKING_AWAY,
    TEMPORAL_WINDOW_SPEAKING,
    TEMPORAL_WINDOW_EYES_CLOSED,
    TEMPORAL_WINDOW_HEAD_TURN,
    TEMPORAL_WINDOW_SPOOF,
    DEFAULT_ALERT_COOLDOWN_SEC,
    DEFAULT_MONITORING_PROFILE,
    get_monitoring_profile_config,
)


class TrueViewEngine:
    """
    Master Multimodal AI Intelligence Engine.
    """
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(TrueViewEngine, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def initialize(self):
        """Initialize all sub-pipelines and pre-load models."""
        if getattr(self, "_initialized", False):
            return

        print("[TrueViewEngine] Initializing TrueView Intelligence Engine...")
        self.model_manager = ModelManager()
        self.model_manager.initialize()

        self.vision_pipeline = SharedFacePipeline()
        self.audio_pipeline = ContinuousAudioPipeline()
        self.quality_engine = InputQualityEngine()
        self.calibrator = SessionCalibrator()
        self.authenticator = ContinuousAuthenticator()
        self.liveness_strategy = LivenessStrategyManager()
        self.attention_engine = AttentionIntelligenceEngine()
        self.feature_fusion = MultimodalFeatureFusion()
        self.confidence_fusion = ConfidenceFusionEngine()
        self.memory_engine = TemporalMemoryEngine()
        self.event_state_machine = EventConfirmationStateMachine()
        self.correlation_engine = EventCorrelationEngine()
        self.policy_engine = PolicyEngine()
        self.uncertainty_engine = UncertaintyEngine()
        self.behaviour_engine = BehaviourEngine()
        self.decision_engine = UnifiedDecisionEngine()
        self.explanation_engine = ExplainabilityEngine()
        self.scheduler = AdaptiveInferenceScheduler()
        self.session_manager = SessionManager()

        self._last_yolo_result: Dict[str, Any] = {"summary": {"person_count": 1, "phone_detected": False}, "detections": []}
        # Per-session last-confirmed event map: enables DETECTED -> CLEARED lifecycle
        # transitions so the UI never re-emits the same event every frame.
        # session_id -> { event_key -> { "confirmed": bool, "duration": float } }
        self._prev_confirmed: Dict[str, Dict[str, Dict[str, Any]]] = {}
        self._initialized = True
        print("[TrueViewEngine] [OK] TrueView Intelligence Engine Ready!")

    def process_frame(self, payload: UnifiedMonitoringInput) -> UnifiedMonitoringOutput:
        """
        Process single unified monitoring payload through the 14-stage intelligence pipeline.
        """
        t0 = time.time()
        timings: Dict[str, float] = {}
        t_mark = t0
        session_id = payload.session_id
        profile_key = getattr(payload, "monitoring_profile", None) or "MODERATE"
        profile_cfg = get_monitoring_profile_config(profile_key)
        session_context = {
            "session_id": session_id,
            "user_id": payload.user_id or "candidate_01",
            "session_type": (payload.session_type or "EXAM").upper(),
            "monitoring_profile": profile_key,
        }

        session_inst = self.session_manager.get_or_create(
            session_id,
            user_id=payload.user_id or "candidate_01",
            session_type=payload.session_type or "EXAM",
            monitoring_profile=profile_key
        )
        # Real face-recognition source of truth: registered embeddings supplied by the
        # backend at session start. The shared face pipeline uses them (and only them)
        # to verify identity — it never fabricates a match without them.
        session_context["registered_face_embeddings"] = getattr(session_inst, "registered_face_embeddings", None) or []
        session_inst.update_fps()
        frame_idx = session_inst.frame_count

        # Decode Video Frame if present
        frame: Optional[np.ndarray] = None
        if payload.video_frame:
            frame = self._decode_image(payload.video_frame)
        timings["decode"] = round((time.time() - t_mark) * 1000, 1)
        t_mark = time.time()

        # Stage 1: Input Quality Intelligence
        video_qual = self.quality_engine.evaluate_video(frame)
        audio_qual = self.quality_engine.evaluate_audio(payload.audio_samples)
        quality_eval = self.quality_engine.combine_quality(video_qual, audio_qual)
        timings["quality"] = round((time.time() - t_mark) * 1000, 1)
        t_mark = time.time()

        # Stage 2: AI Perception Modules (Shared Face Pipeline)
        shared_face = self.vision_pipeline.process(frame, frame_idx, session_context)
        audio_res = self.audio_pipeline.process(payload.audio_samples)
        timings["perception"] = round((time.time() - t_mark) * 1000, 1)
        t_mark = time.time()

        # Dynamic Skip-Frame Schedule for YOLO Object Detection (passes already-decoded frame)
        intervals = self.scheduler.get_execution_intervals()
        if frame is not None and (frame_idx % intervals.get("yolo", 2) == 0):
            yolo_svc = self.model_manager.object_detection_service
            if yolo_svc is not None:
                try:
                    yolo_res = yolo_svc.process_frame(frame, draw_overlay=False)
                    if "error" not in yolo_res:
                        self._last_yolo_result = yolo_res
                except Exception:
                    pass
        timings["yolo"] = round((time.time() - t_mark) * 1000, 1)
        t_mark = time.time()

        # Stage 3: Personal Session Calibration & Threshold Adaptation
        pose = shared_face.get("head_pose", {})
        gaze = shared_face.get("gaze", {})
        if frame_idx <= 15:
            self.calibrator.add_calibration_sample(session_id, pose, gaze, quality_eval)
        calibrated_pose_deltas = self.calibrator.adapt_pose_thresholds(
            session_id, pose.get("pitch", 0.0), pose.get("yaw", 0.0)
        )

        # Stage 4: Continuous Passive Identity Verification
        identity_eval = self.authenticator.evaluate(
            session_id, frame_idx, shared_face.get("face_detected", False),
            shared_face.get("face_count", 0), shared_face.get("identity"), quality_eval
        )

        # Stage 5: Advanced Passive & Active Liveness Strategy
        liveness_eval = self.liveness_strategy.evaluate(
            session_id, shared_face.get("liveness", {}),
            shared_face.get("gaze", {}).get("blink", False),
            pose.get("direction", "Looking Straight"), quality_eval
        )

        prev_dist = self.event_state_machine._active_events.get(session_id, {}).get("looking_away", {})
        prev_dur = prev_dist.get("duration", 0.0) if prev_dist.get("state") != "RESOLVED" else 0.0

        # Stage 6: Advanced Attention Intelligence
        gaze_conf = float(gaze.get("confidence", 0.85))
        attention_eval = self.attention_engine.evaluate(
            session_id, gaze.get("direction", "center"), pose.get("direction", "Looking Straight"),
            calibrated_pose_deltas, shared_face.get("face_detected", False), quality_eval,
            prev_dur, session_context["session_type"],
            gaze_confidence=gaze_conf,
            monitoring_profile=profile_key
        )

        # Stage 7: Multimodal Feature Fusion Layer
        fused_features = self.feature_fusion.fuse(
            shared_face, audio_res, self._last_yolo_result, quality_eval,
            identity_eval, liveness_eval, attention_eval, session_context
        )
        timings["fusion"] = round((time.time() - t_mark) * 1000, 1)
        t_mark = time.time()

        # Stage 8: Temporal Memory Engine
        self.memory_engine.push_snapshot(session_id, fused_features)
        temp_metrics = self.memory_engine.get_window_metrics(session_id)

        # Stage 9: Temporal Event Confirmation State Machine with Profile Configuration
        windows = profile_cfg.get("temporal_windows", {})
        conf_thresholds = profile_cfg.get("confidence_thresholds", {})
        cooldowns = profile_cfg.get("cooldown_seconds", {})

        win_phone = windows.get("phone", TEMPORAL_WINDOW_PHONE_SECS)
        win_multi = windows.get("multiple_persons", TEMPORAL_WINDOW_MULTIPLE_PERSONS)
        win_no_face = windows.get("no_face", TEMPORAL_WINDOW_NO_FACE)
        win_dist = windows.get("looking_away", TEMPORAL_WINDOW_LOOKING_AWAY)
        win_speak = windows.get("speaking", TEMPORAL_WINDOW_SPEAKING)
        win_eyes = windows.get("eyes_closed", TEMPORAL_WINDOW_EYES_CLOSED)
        win_head = windows.get("head_turn", TEMPORAL_WINDOW_HEAD_TURN)
        win_spoof = windows.get("spoof", TEMPORAL_WINDOW_SPOOF)
        win_secondary = windows.get("secondary_objects", 0.8)
        default_cooldown = cooldowns.get("default", DEFAULT_ALERT_COOLDOWN_SEC)

        # 1. Prohibited Phone (multi-frame confirmation >= 0.8s)
        st_phone = self.event_state_machine.update_condition(
            session_id, "phone", fused_features["environment"]["phone_detected"],
            0.92, "Mobile phone detected in camera frame.", win_phone, quality_eval,
            min_confidence=0.80, cooldown_sec=default_cooldown, min_frames=2
        )

        # 1b. Secondary Prohibited Objects (laptop, book, monitor) - multi-frame confirmation >= 0.8s
        env_feat = fused_features.get("environment", {})
        sec_obj_states = {}
        for obj_key, raw_det, obj_label in [
            ("laptop", bool(env_feat.get("laptop_detected", False)), "Secondary laptop"),
            ("book", bool(env_feat.get("book_detected", False)), "Prohibited book/document"),
            ("monitor", bool(env_feat.get("monitor_detected", False)), "Secondary monitor"),
        ]:
            st_sec = self.event_state_machine.update_condition(
                session_id, f"obj_{obj_key}", raw_det,
                0.88, f"{obj_label} detected in camera view.",
                win_secondary, quality_eval,
                min_confidence=0.80, cooldown_sec=default_cooldown, min_frames=2
            )
            sec_obj_states[obj_key] = st_sec

        # 2. Multiple Persons (HIGH PRIORITY, multi-frame confirmation >= 0.8s)
        st_multi = self.event_state_machine.update_condition(
            session_id, "multiple_persons", fused_features["environment"]["person_count"] > 1,
            0.90, f"{fused_features['environment']['person_count']} persons in frame.", win_multi, quality_eval,
            min_confidence=0.80, cooldown_sec=default_cooldown, min_frames=2
        )

        # 3. User Absent (Grace period > 2.0s in moderate)
        st_no_face = self.event_state_machine.update_condition(
            session_id, "no_face", not fused_features["face_detected"],
            0.95, "Candidate not visible in view.", win_no_face, quality_eval,
            min_confidence=0.75, cooldown_sec=default_cooldown, min_frames=2
        )

        # 4. Gaze / Looking Away / Prolonged Distraction (>= 3.0s, confidence >= 0.85 in moderate)
        gaze_data = fused_features.get("gaze", {})
        gaze_conf_val = float(gaze_data.get("confidence", 0.85))
        gaze_dir_val = str(gaze_data.get("direction", "center")).strip().lower()
        min_obs = conf_thresholds.get("gaze_min_observe", 0.70)
        min_conf = conf_thresholds.get("gaze_confirm", 0.85)

        is_gaze_diverted = (
            fused_features["attention"]["status"] in ("PROLONGED_DISTRACTION", "REPEATED_DISTRACTION", "OFFSCREEN_GLANCE")
            or (gaze_dir_val in ("left", "right", "up", "offscreen") and gaze_conf_val >= min_obs)
        )
        st_dist = self.event_state_machine.update_condition(
            session_id, "looking_away", is_gaze_diverted,
            gaze_conf_val, f"Candidate attention diverted ({fused_features['attention']['status']}).",
            win_dist, quality_eval,
            min_confidence=min_conf, min_observe_conf=min_obs,
            cooldown_sec=cooldowns.get("looking_away", default_cooldown), min_frames=3
        )

        # 5. Voice activity / Speaking (sustained >= 2.0s with VAD >= 0.70)
        is_speech_active = (
            bool(fused_features["audio"]["speaking"])
            and float(audio_res.get("voice_confidence", 0.0)) >= conf_thresholds.get("voice_vad", 0.70)
        )
        st_speak = self.event_state_machine.update_condition(
            session_id, "speaking", is_speech_active,
            float(audio_res.get("voice_confidence", 0.85)), "Voice activity detected.",
            win_speak, quality_eval,
            min_confidence=conf_thresholds.get("voice_vad", 0.70),
            cooldown_sec=cooldowns.get("speaking", default_cooldown), min_frames=2
        )

        # 6. Eyes Closed (continuous >= 2.5s in moderate, 8s cooldown)
        is_eyes_closed = bool(gaze_data.get("eyes_closed", False))
        eyes_closed_conf = float(gaze_data.get("eye_closure_confidence", 0.95)) if is_eyes_closed else 0.0
        st_eyes = self.event_state_machine.update_condition(
            session_id, "eyes_closed", is_eyes_closed,
            eyes_closed_conf, "Candidate eyes appear closed beyond normal blink threshold.",
            win_eyes, quality_eval,
            min_confidence=0.85,
            cooldown_sec=cooldowns.get("eyes_closed", default_cooldown), min_frames=3
        )

        # 7. Head Pose Deviation (sustained >= 3.0s, yaw > 35° or pitch > 28° in moderate)
        pose_data = fused_features.get("head_pose", {})
        yaw = abs(pose_data.get("yaw", 0.0))
        pitch = abs(pose_data.get("pitch", 0.0))
        yaw_limit = conf_thresholds.get("pose_yaw_deg", 35.0)
        pitch_limit = conf_thresholds.get("pose_pitch_deg", 28.0)

        is_head_turned = yaw > yaw_limit
        st_head_turned = self.event_state_machine.update_condition(
            session_id, "head_turned", is_head_turned,
            0.88, f"Candidate head turned persistently (yaw: {yaw:.1f}°).",
            win_head, quality_eval,
            min_confidence=0.85,
            cooldown_sec=cooldowns.get("head_turn", default_cooldown), min_frames=3
        )
        is_head_mov = pitch > pitch_limit
        st_head_mov = self.event_state_machine.update_condition(
            session_id, "head_movement", is_head_mov,
            0.85, f"Candidate head tilted excessively (pitch: {pitch:.1f}°).",
            win_head, quality_eval,
            min_confidence=0.85,
            cooldown_sec=cooldowns.get("head_movement", default_cooldown), min_frames=3
        )

        # 8. Presentation attack / Spoof (strict, 0.35s - only evaluated when a face is detected)
        liv_data = fused_features.get("liveness", {})
        is_spoof = bool(fused_features.get("face_detected", False)) and not bool(liv_data.get("is_live", True))
        st_spoof = self.event_state_machine.update_condition(
            session_id, "spoof", is_spoof,
            float(liv_data.get("p_spoof", 0.90)), "Presentation attack / biometric spoof detected.",
            win_spoof, quality_eval,
            min_confidence=conf_thresholds.get("liveness", 0.70),
            cooldown_sec=default_cooldown, min_frames=2
        )

        confirmed_states = {
            "phone": st_phone,
            "multiple_persons": st_multi,
            "no_face": st_no_face,
            "looking_away": st_dist,
            "speaking": st_speak,
            "eyes_closed": st_eyes,
            "head_turned": st_head_turned,
            "head_movement": st_head_mov,
            "spoof": st_spoof,
            "secondary_objects": sec_obj_states,
        }
        timings["confirmation"] = round((time.time() - t_mark) * 1000, 1)
        t_mark = time.time()

        # ── DETECTED -> CLEARED lifecycle transitions ─────────────────────────
        # When a previously-confirmed condition resolves, emit a *_CLEARED event
        # ONCE so the timeline shows the full lifecycle (PHONE_DETECTED ...
        # PHONE_CLEARED) instead of a single stale alert. The server and clients
        # deduplicate; only state TRANSITIONS create events.
        prev_confirmed = self._prev_confirmed.get(session_id, {})
        cleared_events: List[Dict[str, Any]] = []
        cleared_map = {
            "phone": ("PHONE_CLEARED", "PROHIBITED_OBJECT", "Mobile phone no longer detected in camera view."),
            "multiple_persons": ("MULTIPLE_PERSONS_CLEARED", "OBJECT_DETECTION", "Scene returned to a single person in camera view."),
            "no_face": ("FACE_PRESENT", "PRESENCE", "Candidate face is visible again."),
            "looking_away": ("GAZE_CLEARED", "GAZE", "Candidate attention returned to the screen."),
            "speaking": ("SPEECH_STOPPED", "AUDIO", "Voice activity stopped."),
            "eyes_closed": ("EYES_OPEN", "GAZE", "Candidate eyes opened."),
            "head_turned": ("HEAD_POSITION_NORMAL", "HEAD_POSE", "Candidate head position returned to center."),
            "head_movement": ("HEAD_POSITION_NORMAL", "HEAD_POSE", "Candidate head pitch returned to normal."),
            "spoof": ("LIVENESS_CONFIRMED", "BIOMETRIC", "Liveness verified."),
            "obj_laptop": ("LAPTOP_CLEARED", "PROHIBITED_OBJECT", "Secondary laptop/screen no longer visible."),
            "obj_book": ("BOOK_CLEARED", "PROHIBITED_OBJECT", "Prohibited book/document no longer visible."),
            "obj_monitor": ("MONITOR_CLEARED", "PROHIBITED_OBJECT", "Secondary monitor no longer visible."),
        }
        eval_states_for_lifecycle = dict(confirmed_states)
        eval_states_for_lifecycle.pop("secondary_objects", None)
        for obj_k, obj_s in sec_obj_states.items():
            eval_states_for_lifecycle[f"obj_{obj_k}"] = obj_s

        for key, st in eval_states_for_lifecycle.items():
            was_confirmed = bool(prev_confirmed.get(key, {}).get("confirmed"))
            if was_confirmed and not st.get("confirmed"):
                if key in cleared_map:
                    cleared_type, cleared_cat, cleared_evidence = cleared_map[key]
                    evt_uuid = f"evt_{uuid.uuid4().hex[:8]}"
                    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    cleared_events.append({
                        "id": evt_uuid,
                        "event_id": evt_uuid,
                        "session_id": session_id,
                        "sessionId": session_id,
                        "timestamp": now_iso,
                        "type": cleared_type,
                        "category": cleared_cat,
                        "severity": "LOW",
                        "confidence": prev_confirmed[key].get("confidence", 0.85),
                        "duration": prev_confirmed[key].get("duration", 0.0),
                        "evidence": cleared_evidence,
                        "message": cleared_evidence,
                        "source": "LIFECYCLE",
                        "state": "RESOLVED",
                        "metadata": {"cleared_key": key}
                    })
        self._prev_confirmed[session_id] = {
            key: {"confirmed": bool(st.get("confirmed")), "duration": st.get("duration", 0.0),
                   "confidence": st.get("confidence", 0.85)}
            for key, st in eval_states_for_lifecycle.items()
        }

        # Stage 10: Event Correlation Engine
        correlated_patterns = self.correlation_engine.evaluate(
            fused_features, {"phone_duration": st_phone["duration"], "multiple_persons_duration": st_multi["duration"],
                             "no_face_duration": st_no_face["duration"], "looking_away_duration": st_dist["duration"],
                             "speaking_duration": st_speak["duration"]}, identity_eval
        )

        # Stage 11: Cross-Module Confidence & Uncertainty Evaluation
        agree_score, agree_label = self.confidence_fusion.evaluate_agreement(
            gaze.get("direction", "center"), pose.get("direction", "Looking Straight")
        )
        uncertainty_eval = self.uncertainty_engine.evaluate(
            0.92, quality_eval, agree_score, any(s.get("confirmed", False) for s in eval_states_for_lifecycle.values())
        )
        timings["correlation"] = round((time.time() - t_mark) * 1000, 1)
        t_mark = time.time()

        # Stage 12: Context-Aware Behaviour Engine
        behaviour_summary_data = self.behaviour_engine.evaluate(
            fused_features, temp_metrics, confirmed_states, session_context
        )
        # Merge lifecycle (CLEARED) events into the behaviour stream
        if cleared_events:
            behaviour_summary_data["events"] = cleared_events + behaviour_summary_data.get("events", [])

        # Stage 13: Dynamic Risk & Unified Decision Engine
        # RESOLVED (CLEARED) events are informational lifecycle markers: they must
        # NOT inflate the risk score or drive the decision engine, so only active
        # (POTENTIAL/OBSERVING/CONFIRMED/ACTIVE) events feed stages 13-14.
        active_events = [e for e in behaviour_summary_data.get("events", []) if e.get("state") != "RESOLVED"]
        decision_and_risk = self.decision_engine.evaluate(
            fused_features, {**behaviour_summary_data, "events": active_events},
            correlated_patterns, uncertainty_eval, session_context
        )

        # Update Scheduler Performance Mode based on current risk
        current_risk_val = decision_and_risk.get("risk", {}).get("current", 0.0)
        curr_mode = self.scheduler.determine_mode(current_risk_val, session_inst.fps)
        timings["decision"] = round((time.time() - t_mark) * 1000, 1)
        t_mark = time.time()

        # Stage 14: Explainable AI Engine & Structured Output
        explanation_data = self.explanation_engine.generate_explanation(
            active_events, correlated_patterns,
            current_risk_val, session_context["session_type"], quality_eval
        )

        latency_ms = round((time.time() - t0) * 1000, 1)
        timings["explanation"] = round((time.time() - t_mark) * 1000, 1)
        now_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        # Construct Section 27 Standardized Output Payload
        output = UnifiedMonitoringOutput(
            session_id=session_id,
            timestamp=now_str,
            status=session_inst.state,
            monitoring_profile=profile_key,
            inference_start_timestamp=t0,
            inference_end_timestamp=time.time(),
            event_generated_timestamp=time.time(),

            quality=QualityStatus(
                video_quality=quality_eval["video_quality"],
                audio_quality=quality_eval["audio_quality"],
                brightness=quality_eval["brightness"],
                blur_score=quality_eval["blur_score"],
                face_visibility=quality_eval["face_visibility"],
                noise_level=quality_eval["noise_level"],
                overall_quality_score=quality_eval["overall_quality_score"],
                monitoring_uncertain=quality_eval["monitoring_uncertain"],
                quality_note=quality_eval["quality_note"],
            ),

            identity=IdentityStatus(
                verified=identity_eval["verified"],
                status=identity_eval["status"],
                confidence=identity_eval["confidence"],
                user_id=payload.user_id,
                recognition_unavailable=bool(identity_eval.get("recognition_unavailable", False)),
                note=identity_eval.get("note"),
            ),

            liveness=LivenessStatus(
                status=liveness_eval.get("status", "live"),
                confidence=liveness_eval.get("confidence", 0.95),
                passive_confidence=liveness_eval.get("passive_confidence", 0.95),
                active_challenge_required=liveness_eval.get("active_challenge_required", False),
                active_challenge_type=liveness_eval.get("active_challenge_type"),
                is_live=liveness_eval.get("is_live", liveness_eval.get("status", "live").lower() == "live"),
                liveness_status=liveness_eval.get("liveness_status", "LIVE"),
                liveness_score=liveness_eval.get("liveness_score", liveness_eval.get("confidence", 0.95)),
                p_real=liveness_eval.get("p_real", liveness_eval.get("confidence", 0.95)),
                p_spoof=liveness_eval.get("p_spoof", round(1.0 - liveness_eval.get("confidence", 0.95), 4)),
                attack_type=liveness_eval.get("attack_type", "NONE"),
                model=liveness_eval.get("model", "convnext-tiny-run04"),
            ),

            attention=AttentionStatus(
                status=attention_eval["status"],
                score=attention_eval["score"],
                gaze=attention_eval["gaze"],
                head_pose=attention_eval["head_pose"],
                distraction_duration_sec=attention_eval["distraction_duration_sec"],
            ),

            audio=AudioStatus(
                speaking=audio_res.get("speaking", False),
                noise_level=audio_res.get("noise_level", "low"),
                voice_confidence=audio_res.get("voice_confidence", 0.90),
                clipping_detected=quality_eval.get("clipping", False),
            ),

            environment=EnvironmentStatus(
                person_count=fused_features["environment"]["person_count"],
                phone_detected=fused_features["environment"]["phone_detected"],
                objects=self._last_yolo_result.get("detections", []),
            ),

            behaviour=BehaviourSummary(
                current_state=behaviour_summary_data.get("current_state", "normal"),
                events=[BehaviourEventItem(**e) for e in behaviour_summary_data.get("events", [])],
            ),

            correlated_patterns=[CorrelatedPatternItem(**p) for p in correlated_patterns],

            risk=RiskSummary(
                score=decision_and_risk["risk"].get("score", decision_and_risk["risk"]["current"]),
                current=decision_and_risk["risk"]["current"],
                peak=decision_and_risk["risk"]["peak"],
                level=decision_and_risk["risk"]["level"],
                risk_label=decision_and_risk["risk"]["risk_label"],
            ),

            decision=DecisionSummary(
                action=decision_and_risk["decision"]["action"],
                reasons=decision_and_risk["decision"]["reasons"],
                uncertainty_level=decision_and_risk["decision"]["uncertainty_level"],
            ),

            explanation=ExplanationSummary(
                summary=explanation_data["summary"],
                explanations=[ExplanationItem(**x) for x in explanation_data["explanations"]],
            ),

            performance=PerformanceMetrics(
                fps=session_inst.fps,
                latency_ms=latency_ms,
                mode=curr_mode,
                latency_breakdown=timings,
            ),

            system_health=ModuleHealthStatus(
                **self.model_manager.get_health()
            ),
        )

        return output

    def reset_session(self, session_id: str):
        """Reset engine state for a session."""
        self.calibrator.clear(session_id)
        self.authenticator.reset(session_id)
        self.liveness_strategy.reset(session_id)
        self.attention_engine.reset(session_id)
        self.memory_engine.reset(session_id)
        self.event_state_machine.reset(session_id)
        self.decision_engine.reset()
        self.session_manager.remove(session_id)
        self._prev_confirmed.pop(session_id, None)
        self._last_yolo_result = {"summary": {"person_count": 1, "phone_detected": False}, "detections": []}

    @staticmethod
    def _decode_image(image_data: str) -> Optional[np.ndarray]:
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        try:
            img_bytes = base64.b64decode(image_data)
            np_arr = np.frombuffer(img_bytes, np.uint8)
            return cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        except Exception:
            return None
