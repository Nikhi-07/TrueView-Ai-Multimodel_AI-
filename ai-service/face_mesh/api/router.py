from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..services.mesh_service import FaceMeshService

router = APIRouter()
mesh_service = FaceMeshService()

class MeshRequest(BaseModel):
    image: str
    show_mesh: bool = True
    show_dots: bool = True

@router.post("/process-face-mesh")
async def process_face_mesh(request: MeshRequest):
    try:
        if not request.image:
            raise HTTPException(status_code=400, detail="Image data is required")
            
        result = mesh_service.process_frame(
            request.image, 
            show_mesh=request.show_mesh, 
            show_dots=request.show_dots
        )
        
        if "error" in result and result["error"] not in ("no_face", "multiple_faces"):
            raise HTTPException(status_code=400, detail=result["error"])
            
        return result
        
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error in face mesh pipeline: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
