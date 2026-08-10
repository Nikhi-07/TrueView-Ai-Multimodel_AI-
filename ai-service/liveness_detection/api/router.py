from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from ..services.liveness_pipeline import LivenessPipeline
from ..services.multi_frame_pad import MultiFramePAD
from ..liveness_service import LivenessService

router = APIRouter()
pipeline = LivenessPipeline()
multi_frame_pad = MultiFramePAD()
liveness_service = LivenessService()

class LivenessRequest(BaseModel):
    image: str
    session_id: Optional[str] = "default"

class AuthLivenessEvaluationRequest(BaseModel):
    image: str
    session_id: Optional[str] = "default"
    eye_blink_left: Optional[float] = None
    eye_blink_right: Optional[float] = None
    face_box: Optional[dict] = None

class MultiFrameLivenessRequest(BaseModel):
    frames: List[str]  # Temporal sequence of base64 JPEG images
    challenge_type: Optional[str] = None
    session_id: Optional[str] = "default"
    threshold: Optional[float] = 0.70
    eye_blink_left: Optional[List[float]] = None
    eye_blink_right: Optional[List[float]] = None

@router.post("/evaluate-auth-liveness")
async def evaluate_auth_liveness(request: AuthLivenessEvaluationRequest):
    """
    POST /ai-api/liveness/evaluate-auth-liveness
    Evaluates MiniFASNet anti-spoofing + MediaPipe blendshape blink detector.
    Returns standardized output format:
    {
        "antiSpoof": { "status": "LIVE" | "SPOOF", "score": 0.98 },
        "blink": { "detected": true, "count": 1, "state": "OPEN" },
        "face": { "detected": true, "count": 1 }
    }
    """
    try:
        if not request.image:
            raise HTTPException(status_code=400, detail="Image data is required")

        result = liveness_service.evaluate_frame(
            image_b64=request.image,
            session_id=request.session_id or "default",
            eye_blink_left=request.eye_blink_left,
            eye_blink_right=request.eye_blink_right,
            face_box=request.face_box
        )
        return result
    except Exception as e:
        print(f"[AuthLiveness] Error in liveness evaluation: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.get("/generate-challenge")
async def generate_challenge():
    try:
        challenge = multi_frame_pad.generate_random_challenge()
        return challenge
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate liveness challenge: {str(e)}")

@router.post("/verify-multi-frame")
async def verify_multi_frame(request: MultiFrameLivenessRequest):
    try:
        if not request.frames or len(request.frames) == 0:
            raise HTTPException(status_code=400, detail="Frames sequence payload is required")

        result = multi_frame_pad.analyze_sequence(
            request.frames,
            challenge_type=request.challenge_type,
            session_id=request.session_id or "default",
            eye_blink_left=request.eye_blink_left,
            eye_blink_right=request.eye_blink_right
        )
        return result
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"[MultiFramePAD] Error in liveness verification: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/check")
async def check_liveness(request: LivenessRequest):
    try:
        if not request.image:
            raise HTTPException(status_code=400, detail="Image data is required")
            
        result = pipeline.check(request.image, request.session_id)
        
        if "error" in result and result["error"] not in ("no_face", "multiple_faces"):
            raise HTTPException(status_code=400, detail=result["error"])
            
        return result
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error in liveness check: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
