"""
Eye Gaze Tracking API Router – TrueView AI

Exposes the eye gaze tracking pipeline as a FastAPI endpoint.

Endpoints:
    POST /process-eye-gaze   – Process a live frame and return gaze data
    POST /reset-session       – Reset attention tracking for a new session
"""

from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel
from ..services.gaze_service import EyeGazeService

router = APIRouter()
gaze_service = EyeGazeService()


class EyeGazeRequest(BaseModel):
    """Request schema for the eye gaze processing endpoint."""
    image: str                                  # Base64-encoded camera frame
    draw_overlay: bool = True                   # Whether to return annotated image
    eye_metrics: Optional[dict] = None          # Optional client-side landmarks/EAR/blendshapes


class ResetSessionRequest(BaseModel):
    """Request schema for session reset."""
    session_id: str = ""          # Optional session identifier


@router.post("/process-eye-gaze")
async def process_eye_gaze(request: EyeGazeRequest):
    """
    Process a single camera frame through the eye gaze tracking pipeline.

    Input:
        - image: Base64-encoded JPEG frame from the webcam
        - draw_overlay: Whether to draw gaze visualizations on the frame
        - eye_metrics: Optional real-time client facial landmarks/EAR/blendshapes

    Output:
        - eye_status: "OPEN" | "CLOSED" | "BLINKING" | "PARTIALLY_CLOSED" | "UNKNOWN"
        - gaze_direction: "center" | "left" | "right" | "up" | "down" | "unknown"
        - focus_state: "FOCUSED" | "EYES_CLOSED" | "BLINKING" | "OFFSCREEN" | "DISTRACTED" | "FACE_NOT_DETECTED"
        - attention_status: "focused" | "blinking" | "eyes_closed" | "distracted" | "looking_away" | "face_not_detected"
        - attention_score: 0-100 (percentage of recent frames looking at screen)
        - left_ear: float
        - right_ear: float
        - ear: float
        - confidence: 0.0-1.0
        - focus_duration_seconds: cumulative focus time
        - session_attention_pct: overall session attention percentage
        - annotated_image: base64-encoded frame with gaze overlays
        - processing_time_ms: pipeline latency
    """
    try:
        if not request.image:
            raise HTTPException(status_code=400, detail="Image data is required")

        result = gaze_service.process_frame(
            request.image,
            draw_overlay=request.draw_overlay,
            eye_metrics=request.eye_metrics,
        )

        if "error" in result and result["error"] not in ("no_face", "multiple_faces", "eye_extraction_failed", "low_confidence"):
            raise HTTPException(status_code=400, detail=result["error"])

        return result

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"[EyeGaze] Error in processing pipeline: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/reset-session")
async def reset_session(request: ResetSessionRequest):
    """
    Reset the attention analyzer state for a new tracking session.
    Call this when the user starts a new exam or proctoring session.
    """
    try:
        gaze_service.reset_session()
        return {
            "message": "Eye gaze session reset successfully",
            "session_id": request.session_id,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reset session: {str(e)}")
