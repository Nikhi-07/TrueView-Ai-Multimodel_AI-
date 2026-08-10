"""
Speech Analysis API Router – TrueView AI

POST /api/speech-analysis/transcribe
  - Whisper speech-to-text + optional configurable keyword analysis.
  - Content analysis ONLY. Speaker identity is ECAPA-TDNN (never Whisper).
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from speech_analysis.service import service as speech_service

router = APIRouter()


class TranscribeRequest(BaseModel):
    audio: str  # Base64 WAV (data URL preferred)
    keywords: Optional[List[str]] = None  # optional override of default keyword list


@router.post("/transcribe")
async def transcribe(request: TranscribeRequest):
    try:
        if not request.audio:
            raise HTTPException(status_code=400, detail="Audio payload is required")

        result = speech_service.transcribe(request.audio, keywords=request.keywords)
        return result
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"[SpeechAnalysis] Error transcribing: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
