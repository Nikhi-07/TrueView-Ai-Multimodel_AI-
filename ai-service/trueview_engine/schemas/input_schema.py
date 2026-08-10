"""
TrueView AI Engine – Input Schemas

Pydantic models for unified monitoring payloads.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from trueview_engine.config.thresholds import DEFAULT_CONTEXT


class UnifiedMonitoringInput(BaseModel):
    """
    Single unified monitoring input payload carrying video frame,
    audio samples, and session context information.
    """
    session_id: str = Field(..., description="Unique monitoring session ID")
    user_id: Optional[str] = Field("candidate_01", description="User identity string")
    session_type: Optional[str] = Field(DEFAULT_CONTEXT, description="EXAM | INTERVIEW | ONLINE_CLASS | MEETING | WORKPLACE | CUSTOM")
    timestamp: Optional[float] = Field(None, description="Client frame timestamp")
    capture_timestamp: Optional[float] = Field(None, description="Client frame capture time (epoch ms/seconds). Used for end-to-end latency measurement.")

    # Multimodal Inputs
    video_frame: Optional[str] = Field(None, description="Base64 JPEG image string")
    audio_samples: Optional[List[float]] = Field(None, description="Float array of PCM audio samples")
    draw_overlay: Optional[bool] = Field(False, description="Whether to render annotations on output frame")
