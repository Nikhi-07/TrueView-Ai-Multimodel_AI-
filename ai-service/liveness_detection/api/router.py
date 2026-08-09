from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from ..services.liveness_pipeline import LivenessPipeline
from ..services.multi_frame_pad import MultiFramePAD

router = APIRouter()
pipeline = LivenessPipeline()
multi_frame_pad = MultiFramePAD()

class LivenessRequest(BaseModel):
    image: str
    session_id: str = "default"

class MultiFrameLivenessRequest(BaseModel):
    frames: List[str]  # Temporal sequence of base64 JPEG images
    challenge_type: Optional[str] = None
    session_id: Optional[str] = "default"
    threshold: Optional[float] = 0.70

@router.get("/generate-challenge")
async def generate_challenge():
    """
    GET /api/liveness/generate-challenge
    Returns randomized session challenge instruction for active liveness.
    """
    try:
        challenge = multi_frame_pad.generate_random_challenge()
        return challenge
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate liveness challenge: {str(e)}")

@router.post("/verify-multi-frame")
async def verify_multi_frame(request: MultiFrameLivenessRequest):
    """
    POST /api/liveness/verify-multi-frame
    Evaluates temporal frame sequence for passive anti-spoofing and active challenge verification.
    """
    try:
        if not request.frames or len(request.frames) == 0:
            raise HTTPException(status_code=400, detail="Frames sequence payload is required")

        result = multi_frame_pad.analyze_sequence(
            request.frames,
            challenge_type=request.challenge_type,
            session_id=request.session_id or "default"
        )
        return result
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"[MultiFramePAD] Error in liveness verification: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/check")
async def check_liveness(request: LivenessRequest):
    """
    POST /api/liveness/check
    Single-frame fallback liveness endpoint.
    """
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
