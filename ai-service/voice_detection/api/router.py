"""
Voice API Router – TrueView AI

Exposes FastAPI endpoints for real-time voice activity detection (VAD) and speech analysis.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from voice_detection.services.voice_service import VoiceService

router = APIRouter()
voice_service = VoiceService()

class AudioProcessRequest(BaseModel):
    """Schema for frame processing request."""
    samples: list[float]  # Raw mono PCM float samples (value range [-1.0, 1.0])

class ResetSessionRequest(BaseModel):
    """Schema for resetting VAD and speech analytics histories."""
    session_id: str = ""

@router.post("/process-audio")
async def process_audio(request: AudioProcessRequest):
    """
    Process raw microphone PCM samples and return voice activity metrics.
    
    Inputs:
      - samples: Array of float values (PCM format, mono)
      
    Outputs:
      - voice_status: "silence" | "speaking" | "background_noise"
      - confidence: 0.0 to 1.0
      - volume_rms: Root-mean-square energy
      - max_amplitude: Peak absolute value
      - energy: Total frame signal power
      - zcr: Zero-crossing rate
      - noise_level: Dynamic ambient noise floor
      - speaking_duration_seconds: Cumulative speaker duration
      - silence_duration_seconds: Cumulative silent duration
      - session_total_seconds: Cumulative session duration
      - speaking_ratio_pct: Speaking percentage (0-100)
      - current_pattern: "Normal Speech" | "Continuous Speaking" | "Long Silence" | "High Noise Room" | "Multiple Voices Detected"
      - consecutive_speaking_seconds: Continuous speaking duration
      - consecutive_silence_seconds: Continuous silent duration
      - multiple_voices_detected: bool
      - processing_time_ms: latency
    """
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
    """
    Reset VAD counters and dynamic noise floors for a new monitoring session.
    """
    try:
        voice_service.reset_session()
        return {
            "message": "Voice activity proctor session reset successfully",
            "session_id": request.session_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reset session: {str(e)}")
