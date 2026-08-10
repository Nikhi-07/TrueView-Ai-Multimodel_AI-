from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from .recognizer import FaceRecognizer

router = APIRouter()
recognizer = FaceRecognizer()

class ExtractRequest(BaseModel):
    image: str

class CandidateEmbedding(BaseModel):
    id: str
    embedding: List[float]

class VerifyRequest(BaseModel):
    image: str
    candidates: List[CandidateEmbedding]

@router.post("/extract-embedding")
async def extract_embedding(request: ExtractRequest):
    try:
        if not request.image:
            raise HTTPException(status_code=400, detail="Image data is required")
            
        result = recognizer.extract_embedding(request.image)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
            
        return result
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error extracting embedding: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/verify")
async def verify(request: VerifyRequest):
    try:
        if not request.image:
            raise HTTPException(status_code=400, detail="Image data is required")
        if not request.candidates:
            raise HTTPException(status_code=400, detail="Candidate embeddings are required")

        # HONEST: when the SFace model is not loaded, report unavailability as a
        # structured 200 response (verified=False, status=UNAVAILABLE) so server
        # callers can fail closed GRACEFULLY — never a fabricated match, never a
        # hard 500 that takes down login/pre-session flows.
        if not recognizer.is_ready:
            return {
                "verified": False,
                "status": "UNAVAILABLE",
                "confidence": 0.0,
                "message": "Face recognition model unavailable. Place face_recognition_sface_2021dec.onnx in face_detection/models/ to enable face verification.",
            }

        # Format candidates for recognizer
        candidates_list = [{"id": c.id, "embedding": c.embedding} for c in request.candidates]

        result = recognizer.verify(request.image, candidates_list)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        return result
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error verifying face: {e}")
        raise HTTPException(status_code=500, detail=str(e))
