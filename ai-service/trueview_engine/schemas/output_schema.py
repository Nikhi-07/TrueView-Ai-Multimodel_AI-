"""
TrueView AI Engine – Output Schemas

Pydantic models for the single structured monitoring output payload matching Section 27.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional


class QualityStatus(BaseModel):
    video_quality: str = "GOOD"        # GOOD | ACCEPTABLE | POOR | UNRELIABLE
    audio_quality: str = "GOOD"        # GOOD | ACCEPTABLE | POOR | UNRELIABLE
    brightness: float = 1.0            # 0.0 to 1.0
    blur_score: float = 1.0            # Normalized clarity score
    face_visibility: float = 1.0       # 0.0 to 1.0
    noise_level: str = "low"           # low | medium | high
    overall_quality_score: float = 1.0 # 0.0 to 1.0
    monitoring_uncertain: bool = False
    quality_note: Optional[str] = None


class IdentityStatus(BaseModel):
    # Honest defaults: nothing is verified until a REAL recognition result exists.
    verified: bool = False
    status: str = "IDENTITY_UNCERTAIN" # IDENTITY_CONSISTENT | IDENTITY_UNCERTAIN | IDENTITY_MISMATCH | POSSIBLE_USER_REPLACEMENT
    confidence: float = 0.0
    user_id: Optional[str] = None
    last_verified_ts: Optional[str] = None
    # True when recognition could not run (model missing / no registered profile).
    # Consumers must never show REGISTERED_FACE / IDENTITY_MISMATCH in this state.
    recognition_unavailable: bool = False
    note: Optional[str] = None


class LivenessStatus(BaseModel):
    status: str = "live"                # live | fake | checking | unknown | spoof
    confidence: float = 0.95
    passive_confidence: float = 0.95
    active_challenge_required: bool = False
    active_challenge_type: Optional[str] = None # BLINK_TWICE | TURN_HEAD_LEFT | TURN_HEAD_RIGHT
    is_live: Optional[bool] = True
    liveness_status: Optional[str] = "LIVE"
    liveness_score: Optional[float] = 0.95
    p_real: Optional[float] = 0.95
    p_spoof: Optional[float] = 0.05
    attack_type: Optional[str] = "NONE"
    model: Optional[str] = "convnext-tiny-run04"


class AttentionStatus(BaseModel):
    status: str = "FOCUSED"            # FOCUSED | BRIEF_NATURAL_DISTRACTION | REPEATED_DISTRACTION | PROLONGED_DISTRACTION | ATTENTION_UNCERTAIN
    score: float = 90.0
    gaze: str = "center"
    head_pose: str = "Looking Straight"
    distraction_duration_sec: float = 0.0


class AudioStatus(BaseModel):
    speaking: bool = False
    noise_level: str = "low"           # low | medium | high
    voice_confidence: float = 0.90
    clipping_detected: bool = False


class EnvironmentStatus(BaseModel):
    person_count: int = 1
    phone_detected: bool = False
    objects: List[Dict[str, Any]] = []


class BehaviourEventItem(BaseModel):
    event_id: str
    id: Optional[str] = None
    session_id: str
    sessionId: Optional[str] = None
    timestamp: str
    type: str
    severity: str                      # LOW | MEDIUM | HIGH | CRITICAL
    confidence: float
    duration: float
    evidence: str
    state: str = "CONFIRMED"            # POTENTIAL | OBSERVING | CONFIRMED | ACTIVE | RESOLVED | ALERTED | COOLDOWN
    category: Optional[str] = "BEHAVIOUR"
    source: Optional[str] = "AI_ENGINE"
    message: Optional[str] = None
    should_alert: Optional[bool] = True
    in_cooldown: Optional[bool] = False
    metadata: Optional[Dict[str, Any]] = None

    model_config = {"extra": "allow"}


class BehaviourSummary(BaseModel):
    current_state: str = "normal"
    events: List[BehaviourEventItem] = []


class CorrelatedPatternItem(BaseModel):
    pattern_name: str
    confidence: float
    supporting_signals: List[str]
    duration: float
    evidence: str


class RiskSummary(BaseModel):
    score: float = 0.0                 # Primary risk score (0-100)
    current: float = 0.0               # Current dynamic risk score (0-100)
    peak: float = 0.0                  # Peak risk score reached in session
    level: str = "NORMAL"              # NORMAL | LOW | MEDIUM | HIGH | CRITICAL
    risk_label: str = "NORMAL"         # User-friendly label (NORMAL, RISK INDICATOR, SUSPICIOUS EVENT, REVIEW RECOMMENDED, HIGH-RISK EVENT)


class DecisionSummary(BaseModel):
    action: str = "CONTINUE_MONITORING"# CONTINUE_MONITORING | WARN_CANDIDATE | FLAG_FOR_REVIEW | SUSPEND_SESSION
    reasons: List[str] = []
    uncertainty_level: str = "CONFIRMED" # CONFIRMED | LIKELY | UNCERTAIN | REJECTED


class ExplanationItem(BaseModel):
    what: str
    why: str
    contributing_modules: List[str]
    confidence: float
    duration: float
    policy_context: str
    risk_contribution: float


class ExplanationSummary(BaseModel):
    summary: str
    explanations: List[ExplanationItem] = []


class PerformanceMetrics(BaseModel):
    fps: float = 0.0
    latency_ms: float = 0.0
    mode: str = "NORMAL"               # NORMAL | SUSPICIOUS | LOW_POWER
    # Per-stage inference timings (ms) for the real-time performance panel.
    latency_breakdown: Dict[str, float] = {}   # decode, quality, perception, yolo, fusion, confirmation, correlation, decision, explanation


class ModuleHealthStatus(BaseModel):
    face_detection: str = "READY"      # READY | DEGRADED | FAILED | DISABLED
    face_recognition: str = "FAILED"   # HONEST: FAILED until the SFace model is actually loaded
    liveness: str = "READY"
    gaze_tracking: str = "READY"
    head_pose: str = "READY"
    yolo: str = "READY"
    voice_vad: str = "READY"


class UnifiedMonitoringOutput(BaseModel):
    """
    Standardized single output structure returned by TrueView AI Engine (Section 27).
    """
    session_id: str
    timestamp: str
    status: str = "MONITORING"          # INITIALIZING | CALIBRATING | MONITORING | DEGRADED | COMPLETED
    monitoring_profile: Optional[str] = "MODERATE"

    # Real-time latency instrumentation (unix epoch seconds).
    inference_start_timestamp: Optional[float] = None
    inference_end_timestamp: Optional[float] = None
    event_generated_timestamp: Optional[float] = None

    quality: QualityStatus
    identity: IdentityStatus
    liveness: LivenessStatus
    attention: AttentionStatus
    audio: AudioStatus
    environment: EnvironmentStatus
    behaviour: BehaviourSummary
    correlated_patterns: List[CorrelatedPatternItem] = []
    risk: RiskSummary
    decision: DecisionSummary
    explanation: ExplanationSummary
    performance: PerformanceMetrics
    system_health: ModuleHealthStatus

    annotated_frame: Optional[str] = None
