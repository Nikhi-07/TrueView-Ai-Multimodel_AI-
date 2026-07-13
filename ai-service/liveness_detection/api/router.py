from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..services.liveness_pipeline import LivenessPipeline

router = APIRouter()
pipeline = LivenessPipeline()

class LivenessRequest(BaseModel):
    image: str
    session_id: str = "default"

@router.post("/check")
async def check_liveness(request: LivenessRequest):
    """
    POST /api/liveness/check
    
    Input: base64 encoded camera frame + session_id
    Output: liveness status, confidence, blink count, motion score, texture score
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
