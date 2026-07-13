"""
Object Detection API Router – TrueView AI

Exposes endpoints for real-time environment proctoring, device checks,
and multi-person monitoring using YOLOv11.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from object_detection.services.object_detection_service import ObjectDetectionService

router = APIRouter()
detection_service = ObjectDetectionService()

class DetectionRequest(BaseModel):
    """Schema for frame processing request."""
    image: str
    draw_overlay: bool = True

class ResetSessionRequest(BaseModel):
    """Schema for resetting tracking session data."""
    session_id: str = ""

@router.post("/process-object-detection")
async def process_object_detection(request: DetectionRequest):
    """
    Process raw image frame through YOLO object tracking and monitor workspace environment.
    
    Inputs:
      - image: Base64 JPEG webcam frame
      - draw_overlay: True to draw colored bounding boxes and status strip
      
    Outputs:
      - objects_detected: count of total active items
      - detections: list of object details (coordinates, class label, confidence, track ID, durations)
      - summary: environment summary (person_count, prohibited_items list, violations flags)
      - annotated_image: Base64 annotated JPEG frame
      - processing_time_ms: inference latency in milliseconds
    """
    try:
        if not request.image:
            raise HTTPException(status_code=400, detail="Image data is required")
            
        result = detection_service.process_frame(
            request.image, 
            draw_overlay=request.draw_overlay
        )
        
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
            
        return result
        
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"[YOLO] Error in process router: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/reset-object-session")
async def reset_object_session(request: ResetSessionRequest):
    """
    Reset YOLO tracker database and timestamps for a new proctoring session.
    """
    try:
        detection_service.reset_session()
        return {
            "message": "Object tracking session reset successfully",
            "session_id": request.session_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reset session: {str(e)}")
