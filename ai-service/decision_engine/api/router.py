"""
Decision Engine API Router – FastAPI endpoints

POST /evaluate-session   → Run decision pipeline on a telemetry snapshot
POST /reset              → Reset scoring state for a new session
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from decision_engine.api.decision_service import DecisionService

router = APIRouter()

# ── Singleton decision service (per-worker) ──
_decision_service = DecisionService()


# ── Request / Response Models ─────────────────

class TelemetryInput(BaseModel):
    """Consolidated telemetry snapshot from all AI modules."""
    # Face Detection
    face_detected: Optional[bool] = True
    face_match: Optional[bool] = None
    face_confidence: Optional[float] = None

    # Gaze Tracking
    gaze_status: Optional[str] = "center"
    gaze_confidence: Optional[float] = None

    # Head Pose
    head_yaw: Optional[float] = 0.0
    head_pitch: Optional[float] = 0.0
    head_roll: Optional[float] = 0.0
    pose_confidence: Optional[float] = None

    # Voice Detection
    is_speaking: Optional[bool] = False
    voice_confidence: Optional[float] = None

    # Object Detection (YOLO)
    phone_detected: Optional[bool] = False
    person_count: Optional[int] = 1
    yolo_confidence: Optional[float] = None
    detected_objects: Optional[list] = []

    # Liveness
    is_spoof: Optional[bool] = False

    # Derived / Behaviour
    user_absent: Optional[bool] = False
    behaviour_confidence: Optional[float] = None


@router.post("/evaluate-session")
async def evaluate_session(payload: TelemetryInput):
    """
    Run the full decision pipeline on a telemetry snapshot.
    Returns risk score, session status, violations, and per-module confidence.
    """
    try:
        telemetry = payload.model_dump()
        decision = _decision_service.evaluate(telemetry)
        return {"success": True, "data": decision}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reset")
async def reset_session():
    """Reset the decision engine state for a new session."""
    try:
        _decision_service.reset()
        return {"success": True, "message": "Decision engine reset successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
