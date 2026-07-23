"""
TrueView AI Engine – Standardized AI Output Schema

Defines a common output structure for every AI perception module in the system
(Face Detection, Recognition, Liveness, Gaze, Head Pose, YOLO, Voice VAD, etc.).
Ensures uniform reporting of predictions, confidence, quality, health, and latency.
"""

from pydantic import BaseModel, Field
from typing import Any, Dict, Optional


class ModuleOutputSchema(BaseModel):
    """
    Standardized schema returned by or wrapped around all sub-module outputs.
    """
    module: str = Field(..., description="Name of the AI module (e.g. gaze, liveness, yolo, face_detection)")
    prediction: Any = Field(..., description="Module prediction value or dictionary")
    confidence: float = Field(1.0, ge=0.0, le=1.0, description="Normalized model confidence score (0.0 to 1.0)")
    timestamp: str = Field(..., description="ISO 8601 timestamp of processing execution")
    latency_ms: float = Field(0.0, description="Processing latency in milliseconds")
    quality: float = Field(1.0, ge=0.0, le=1.0, description="Evaluated input quality factor (0.0 to 1.0)")
    health: str = Field("READY", description="Module health status (READY | DEGRADED | FAILED | DISABLED)")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Optional extra evidence or diagnostic metrics")
