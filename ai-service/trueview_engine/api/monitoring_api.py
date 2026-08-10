"""
Unified TrueView AI Engine API Router – FastAPI

Provides single API interface for session management, calibration, multimodal frame processing,
active liveness challenges, reviewer feedback logging, accuracy evaluation, and benchmarking.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import time
from collections import deque
import statistics

from trueview_engine.core.engine import TrueViewEngine
from trueview_engine.schemas.input_schema import UnifiedMonitoringInput
from trueview_engine.schemas.output_schema import UnifiedMonitoringOutput
from trueview_engine.feedback.reviewer_feedback import ReviewerFeedbackStore
from trueview_engine.evaluation.accuracy_evaluator import AccuracyEvaluator
from trueview_engine.evaluation.performance_benchmark import PerformanceBenchmarker

router = APIRouter()

# ── Master AI Engine & Feedback Singletons ──
engine = TrueViewEngine()
engine.initialize()

feedback_store = ReviewerFeedbackStore()
accuracy_evaluator = AccuracyEvaluator()
benchmarker = PerformanceBenchmarker()

# ── Rolling real-time latency tracker (bounded ring buffer) ─────────────
# Records per-request inference latency + queue delay so the performance
# panel can show min/max/avg/P95 without unbounded memory growth.
LATENCY_HISTORY_LEN = 500
_latency_history: deque = deque(maxlen=LATENCY_HISTORY_LEN)
_ai_started_at = time.time()


def _record_latency(ms: float) -> None:
    _latency_history.append(ms)


def _percentile(sorted_vals: List[float], pct: float) -> float:
    if not sorted_vals:
        return 0.0
    idx = min(len(sorted_vals) - 1, max(0, int(round(pct / 100.0 * (len(sorted_vals) - 1)))))
    return round(sorted_vals[idx], 1)


@router.get("/performance")
async def get_ai_performance():
    """
    Developer-only rolling inference performance snapshot.
    Intended for the reviewer/admin real-time performance panel; the AI service
    is an internal endpoint (never exposed to public participants via the UI).
    """
    vals = sorted(_latency_history)
    return {
        "success": True,
        "uptime_seconds": round(time.time() - _ai_started_at),
        "samples": len(vals),
        "latency_ms": {
            "min": round(vals[0], 1) if vals else 0.0,
            "max": round(vals[-1], 1) if vals else 0.0,
            "avg": round(statistics.mean(vals), 1) if vals else 0.0,
            "p95": _percentile(vals, 95),
        },
        "frame_queue": engine.session_manager.queue_lengths(),
        "module_health": engine.model_manager.get_health(),
    }


class StartSessionRequest(BaseModel):
    session_id: str
    user_id: Optional[str] = "candidate_01"
    session_type: Optional[str] = "EXAM"  # EXAM | INTERVIEW | ONLINE_CLASS | MEETING | WORKPLACE | CUSTOM
    # Registered 128-D face embedding(s) for REAL recognition during the session.
    # Supplied server-side by the backend (never by the browser). When absent,
    # recognition honestly reports UNAVAILABLE instead of fabricating matches.
    registered_face_embeddings: Optional[List[List[float]]] = None


class ActiveChallengeResponse(BaseModel):
    session_id: str
    challenge_type: str
    response_action: str


class FeedbackSubmissionRequest(BaseModel):
    session_id: str
    event_id: str
    reviewer_decision: str  # CONFIRMED | FALSE_POSITIVE | DISMISSED | UNCERTAIN
    reviewer_id: Optional[str] = "admin"
    notes: Optional[str] = None


@router.post("/session/start")
async def start_session(request: StartSessionRequest):
    """
    Initialize a new proctoring/monitoring session.
    """
    try:
        sess = engine.session_manager.get_or_create(
            request.session_id,
            user_id=request.user_id or "candidate_01",
            session_type=request.session_type or "EXAM",
            registered_face_embeddings=request.registered_face_embeddings
        )
        return {
            "success": True,
            "message": f"Session '{request.session_id}' started in '{sess.session_type}' mode.",
            "session_id": request.session_id,
            "status": sess.state,
            "module_health": engine.model_manager.get_health(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/session/{session_id}/process", response_model=UnifiedMonitoringOutput)
async def process_monitoring_frame(session_id: str, payload: UnifiedMonitoringInput):
    """
    Process single unified multimodal frame payload and return structured results.
    """
    try:
        payload.session_id = session_id
        t_req = time.time()
        output = engine.process_frame(payload)
        _record_latency(output.performance.latency_ms if output.performance else (time.time() - t_req) * 1000)
        return output
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Engine processing error: {str(e)}")


@router.post("/session/{session_id}/challenge/respond")
async def respond_liveness_challenge(session_id: str, payload: ActiveChallengeResponse):
    """
    Submit active liveness challenge response (e.g. blink twice, head turn).
    """
    try:
        res = engine.liveness_strategy.evaluate(
            session_id, {"status": "live", "confidence": 0.98},
            blink_detected=(payload.response_action == "BLINK"),
            pose_direction=payload.response_action,
            quality_eval={"quality": "GOOD"}
        )
        return {
            "success": True,
            "session_id": session_id,
            "liveness": res
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/feedback/submit")
async def submit_reviewer_feedback(payload: FeedbackSubmissionRequest):
    """
    Log human reviewer audit judgment on a flagged event.
    """
    try:
        entry = feedback_store.record_feedback(
            payload.session_id, payload.event_id, payload.reviewer_decision,
            payload.reviewer_id, payload.notes
        )
        return {"success": True, "entry": entry}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/session/{session_id}/summary")
async def get_session_summary(session_id: str):
    """
    Generate comprehensive Session Intelligence metrics at session completion.
    """
    try:
        metrics = engine.memory_engine.get_window_metrics(session_id)
        feedback = feedback_store.get_session_feedback(session_id)
        return {
            "session_id": session_id,
            "metrics": metrics,
            "reviewer_feedback_count": len(feedback),
            "module_health": engine.model_manager.get_health()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/session/{session_id}/stop")
async def stop_session(session_id: str):
    """
    Stop and clear an active monitoring session.
    """
    try:
        engine.reset_session(session_id)
        return {
            "success": True,
            "message": f"Session '{session_id}' stopped successfully.",
            "session_id": session_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/session/{session_id}/status")
async def get_session_status(session_id: str):
    """
    Fetch current session metrics and engine health.
    """
    try:
        sess = engine.session_manager.get_or_create(session_id)
        return {
            "session_id": session_id,
            "user_id": sess.user_id,
            "session_type": sess.session_type,
            "status": sess.state,
            "frame_count": sess.frame_count,
            "fps": sess.fps,
            "module_health": engine.model_manager.get_health()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
