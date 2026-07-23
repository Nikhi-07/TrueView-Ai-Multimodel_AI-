"""
Master TrueView AI Engine Orchestrator – TrueView AI Engine

Central entry point coordinating Vision, Audio, Input Quality, Personal Calibration,
Continuous Authentication, Liveness Strategy, Multimodal Feature Fusion, Temporal Memory,
Event Confirmation, Event Correlation, Context Policy, Uncertainty, Behaviour, Decision,
Dynamic Risk, and Explainable AI modules behind ONE unified interface.
"""

import time
import cv2
import numpy as np
import base64
from typing import Dict, Any, Optional

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
        self._initialized = True
        print("[TrueViewEngine] ✅ TrueView Intelligence Engine Ready!")

    def process_frame(self, payload: UnifiedMonitoringInput) -> UnifiedMonitoringOutput:
        """
        Process single unified monitoring payload through the 14-stage intelligence pipeline.
        """
        t0 = time.time()
        session_id = payload.session_id
        session_context = {
            "session_id": session_id,
            "user_id": payload.user_id or "candidate_01",
            "session_type": (payload.session_type or "EXAM").upper(),
        }

        session_inst = self.session_manager.get_or_create(
            session_id,
            user_id=payload.user_id or "candidate_01",
            session_type=payload.session_type or "EXAM"
        )
        session_inst.update_fps()
        frame_idx = session_inst.frame_count

        # Decode Video Frame if present
        frame: Optional[np.ndarray] = None
        if payload.video_frame:
            frame = self._decode_image(payload.video_frame)

        # Stage 1: Input Quality Intelligence
        video_qual = self.quality_engine.evaluate_video(frame)
        audio_qual = self.quality_engine.evaluate_audio(payload.audio_samples)
        quality_eval = self.quality_engine.combine_quality(video_qual, audio_qual)

        # Stage 2: AI Perception Modules (Shared Face Pipeline)
        shared_face = self.vision_pipeline.process(frame, frame_idx, session_context)
        audio_res = self.audio_pipeline.process(payload.audio_samples)

        # Dynamic Skip-Frame Schedule for YOLO Object Detection
        intervals = self.scheduler.get_execution_intervals()
        if frame is not None and (frame_idx % intervals.get("yolo", 4) == 0):
            yolo_svc = self.model_manager.object_detection_service
            if yolo_svc is not None:
                try:
                    yolo_res = yolo_svc.process_frame(payload.video_frame, draw_overlay=False)
                    if "error" not in yolo_res:
                        self._last_yolo_result = yolo_res
                except Exception:
                    pass

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

        # Stage 6: Advanced Attention Intelligence
        attention_eval = self.attention_engine.evaluate(
            session_id, gaze.get("direction", "center"), pose.get("direction", "Looking Straight"),
            calibrated_pose_deltas, shared_face.get("face_detected", False), quality_eval,
            0.0
        )

        # Stage 7: Multimodal Feature Fusion Layer
        fused_features = self.feature_fusion.fuse(
            shared_face, audio_res, self._last_yolo_result, quality_eval,
            identity_eval, liveness_eval, attention_eval, session_context
        )

        # Stage 8: Temporal Memory Engine
        self.memory_engine.push_snapshot(session_id, fused_features)
        temp_metrics = self.memory_engine.get_window_metrics(session_id)

        # Stage 9: Temporal Event Confirmation State Machine
        st_phone = self.event_state_machine.update_condition(
            session_id, "phone", fused_features["environment"]["phone_detected"],
            0.92, "Mobile phone detected in camera frame.", 0.8, quality_eval
        )
        st_multi = self.event_state_machine.update_condition(
            session_id, "multiple_persons", fused_features["environment"]["person_count"] > 1,
            0.90, f"{fused_features['environment']['person_count']} persons in frame.", 0.8, quality_eval
        )
        st_no_face = self.event_state_machine.update_condition(
            session_id, "no_face", not fused_features["face_detected"],
            0.95, "Candidate not visible in view.", 2.0, quality_eval
        )
        st_dist = self.event_state_machine.update_condition(
            session_id, "looking_away", fused_features["attention"]["status"] in ("PROLONGED_DISTRACTION", "REPEATED_DISTRACTION"),
            0.88, f"Candidate attention diverted ({fused_features['attention']['status']}).", 1.5, quality_eval
        )
        st_speak = self.event_state_machine.update_condition(
            session_id, "speaking", fused_features["audio"]["speaking"],
            0.85, "Voice activity detected.", 1.0, quality_eval
        )

        confirmed_states = {
            "phone": st_phone,
            "multiple_persons": st_multi,
            "no_face": st_no_face,
            "looking_away": st_dist,
            "speaking": st_speak,
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
            0.92, quality_eval, agree_score, any(s["confirmed"] for s in confirmed_states.values())
        )

        # Stage 12: Context-Aware Behaviour Engine
        behaviour_summary_data = self.behaviour_engine.evaluate(
            fused_features, temp_metrics, confirmed_states, session_context
        )

        # Stage 13: Dynamic Risk & Unified Decision Engine
        decision_and_risk = self.decision_engine.evaluate(
            fused_features, behaviour_summary_data, correlated_patterns, uncertainty_eval, session_context
        )

        # Update Scheduler Performance Mode based on current risk
        current_risk_val = decision_and_risk.get("risk", {}).get("current", 0.0)
        curr_mode = self.scheduler.determine_mode(current_risk_val, session_inst.fps)

        # Stage 14: Explainable AI Engine & Structured Output
        explanation_data = self.explanation_engine.generate_explanation(
            behaviour_summary_data.get("events", []), correlated_patterns,
            current_risk_val, session_context["session_type"], quality_eval
        )

        latency_ms = round((time.time() - t0) * 1000, 1)
        now_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        # Construct Section 27 Standardized Output Payload
        output = UnifiedMonitoringOutput(
            session_id=session_id,
            timestamp=now_str,
            status=session_inst.state,

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
            ),

            liveness=LivenessStatus(
                status=liveness_eval["status"],
                confidence=liveness_eval["confidence"],
                passive_confidence=liveness_eval["passive_confidence"],
                active_challenge_required=liveness_eval["active_challenge_required"],
                active_challenge_type=liveness_eval["active_challenge_type"],
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
