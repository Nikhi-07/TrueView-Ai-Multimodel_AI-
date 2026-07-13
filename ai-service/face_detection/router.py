from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from .detector import FaceDetector

router = APIRouter()
detector = FaceDetector()

class FrameRequest(BaseModel):
    image: str # Base64 encoded image

@router.post("/process-frame")
async def process_frame(request: FrameRequest):
    try:
        if not request.image:
            raise HTTPException(status_code=400, detail="Image data is required")
            
        result = detector.detect(request.image)
        
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
            
        return result
        
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error processing frame: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during face detection")
