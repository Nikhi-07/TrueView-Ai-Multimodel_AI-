"""
Behaviour API Router – TrueView AI

Exposes endpoints for aggregating multi-module telemetry outputs
and tracking behavioural timeline compliance metrics.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from behaviour_analysis.services.behaviour_service import BehaviourService

router = APIRouter()
behaviour_service = BehaviourService()

class BehaviourAnalysisRequest(BaseModel):
    """Schema containing outputs of previously run AI modules."""
    face_detected: bool = False
    identity: str = "unknown"
    is_live: bool = True
    gaze_direction: str = "center"
    head_pose_yaw: float = 0.0
    head_pose_pitch: float = 0.0
    head_pose_direction: str = "Looking Straight"
    voice_status: str = "silence"
    yolo_person_count: int = 0
    yolo_phone_detected: bool = False
    yolo_book_detected: bool = False

class ResetSessionRequest(BaseModel):
    """Schema for resetting proctor behavior histories."""
    session_id: str = ""

@router.post("/analyze-behaviour")
async def analyze_behaviour(request: BehaviourAnalysisRequest):
    """
    Consolidate outputs from previous AI modules and evaluate user behavior.
    
    Inputs:
      - face_detected: bool
      - identity: str
      - is_live: bool
      - gaze_direction: str ("center" | "left" | "right" | etc.)
      - head_pose_yaw: float
      - head_pose_pitch: float
      - head_pose_direction: str
      - voice_status: str ("silence" | "speaking" | "background_noise")
      - yolo_person_count: int
      - yolo_phone_detected: bool
      - yolo_book_detected: bool
      
    Outputs:
      - timeline: List of events (timestamp, type, severity, duration, description)
      - metrics: Session metrics (attention_pct, focus_duration, speaking_duration, etc.)
      - active_events: List of current frame violations
      - session_summary: Category summary (behavioral_insight, attention_rating, last_active_event)
    """
    try:
        telemetry = {
            "face_detected": request.face_detected,
            "identity": request.identity,
            "is_live": request.is_live,
            "gaze_direction": request.gaze_direction,
            "head_pose_yaw": request.head_pose_yaw,
            "head_pose_pitch": request.head_pose_pitch,
            "head_pose_direction": request.head_pose_direction,
            "voice_status": request.voice_status,
            "yolo_person_count": request.yolo_person_count,
            "yolo_phone_detected": request.yolo_phone_detected,
            "yolo_book_detected": request.yolo_book_detected
        }
        
        result = behaviour_service.analyze_behaviour(telemetry)
        return result
        
    except Exception as e:
        print(f"[Behaviour] Error in analyze endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/reset-behaviour-session")
async def reset_behaviour_session(request: ResetSessionRequest):
    """
    Reset behavior monitor queues and timeline registers.
    """
    try:
        behaviour_service.reset_session()
        return {
            "message": "Behavioral analytics proctor session reset successfully",
            "session_id": request.session_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reset session: {str(e)}")
