"""
Voice API Router – TrueView AI

Exposes FastAPI endpoints for real-time voice activity detection (VAD) and speech analysis.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from voice_detection.services.voice_service import VoiceService
from voice_detection.speaker_recognition.speaker_recognizer import SpeakerRecognizer

router = APIRouter()
voice_service = VoiceService()
speaker_recognizer = SpeakerRecognizer()

class AudioProcessRequest(BaseModel):
    """Schema for frame processing request."""
    samples: list[float]  # Raw mono PCM float samples (value range [-1.0, 1.0])

class ResetSessionRequest(BaseModel):
    """Schema for resetting VAD and speech analytics histories."""
    session_id: str = ""

class ExtractSpeakerEmbeddingRequest(BaseModel):
    """Schema for base64 audio speaker embedding extraction."""
    audio: str  # Base64 encoded audio string or data URL

class VerifySpeakerRequest(BaseModel):
    """Schema for speaker verification request."""
    audio: str  # Base64 encoded audio string
    candidate: list[float]  # Registered speaker embedding vector
    threshold: float = 0.75

@router.post("/process-audio")
async def process_audio(request: AudioProcessRequest):
    try:
        if not request.samples or len(request.samples) == 0:
            raise HTTPException(status_code=400, detail="Audio samples array is required")
            
        result = voice_service.process_audio_chunk(request.samples)
        return result
        
    except Exception as e:
        print(f"[VoiceVAD] Error in process endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/reset-voice-session")
async def reset_voice_session(request: ResetSessionRequest):
    try:
        voice_service.reset_session()
        return {
            "message": "Voice activity proctor session reset successfully",
            "session_id": request.session_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reset session: {str(e)}")

@router.post("/extract-embedding")
async def extract_embedding(request: ExtractSpeakerEmbeddingRequest):
    """
    Extract 128-D speaker embedding vector from base64 audio.
    """
    try:
        if not request.audio:
            raise HTTPException(status_code=400, detail="Audio base64 payload is required")

        result = speaker_recognizer.extract_speaker_embedding(request.audio)
        return result
    except Exception as e:
        print(f"[SpeakerRec] Error extracting speaker embedding: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to extract speaker embedding: {str(e)}")

@router.post("/verify-speaker")
async def verify_speaker(request: VerifySpeakerRequest):
    """
    Verify live audio speaker embedding against candidate embedding.
    """
    try:
        if not request.audio or not request.candidate:
            raise HTTPException(status_code=400, detail="Audio and candidate embedding are required")

        result = speaker_recognizer.verify_speaker(request.audio, request.candidate, request.threshold)
        return result
    except Exception as e:
        print(f"[SpeakerRec] Error verifying speaker: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to verify speaker: {str(e)}")

