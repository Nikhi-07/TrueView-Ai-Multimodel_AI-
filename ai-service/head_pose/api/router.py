"""
Head Pose API Router – TrueView AI

Exposes endpoints for real-time head pose tracking and proctoring analytics.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..services.head_pose_service import HeadPoseService

router = APIRouter()
pose_service = HeadPoseService()

class HeadPoseRequest(BaseModel):
    """Schema for frame processing request."""
    image: str
    draw_overlay: bool = True

class ResetSessionRequest(BaseModel):
    """Schema for resetting attention/stability session data."""
    session_id: str = ""

@router.post("/process-head-pose")
async def process_head_pose(request: HeadPoseRequest):
    """
    Process image frame and return head pose tracking metrics.
    
    Inputs:
      - image: Base64 JPEG camera frame
      - draw_overlay: True to render 3D coordinate axes overlay
      
    Outputs:
      - face_detected: bool
      - pitch, yaw, roll: floats representing rotational degrees
      - head_direction: "Looking Straight" | "Looking Left" | "Looking Right" | "Looking Up" | "Looking Down" | "Head Tilt"
      - confidence: 0.0 to 1.0
      - attention_status: "focused" | "distracted" | "looking_away"
      - screen_facing_ratio: 0.0 to 100.0 (percentage of time looking at screen)
      - screen_facing_duration_seconds: continuous focused duration
      - head_stability: "High" | "Medium" | "Low"
      - head_stability_value: float representing standard deviation of angles
      - movement_frequency_per_minute: count of head movements in last 60 seconds
      - annotated_image: Base64 BGR annotated image frame
      - processing_time_ms: time taken to process frame in ms
    """
    try:
        if not request.image:
            raise HTTPException(status_code=400, detail="Image data is required")
            
        result = pose_service.process_frame(
            request.image, 
            draw_overlay=request.draw_overlay
        )
        
        if "error" in result and result["error"] not in ("no_face", "multiple_faces", "pose_estimation_failed"):
            raise HTTPException(status_code=400, detail=result["error"])
            
        return result
        
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"[HeadPose] Error in api router: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/reset-pose-session")
async def reset_pose_session(request: ResetSessionRequest):
    """
    Reset head pose rolling tracker window metrics for a new session.
    """
    try:
        pose_service.reset_session()
        return {
            "message": "Head pose tracker session reset successfully",
            "session_id": request.session_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reset session: {str(e)}")
