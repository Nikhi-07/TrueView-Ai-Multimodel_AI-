"""
Continuous Audio Pipeline – TrueView AI Engine

Processes microphone PCM audio samples to evaluate Voice Activity (VAD),
speech duration, silence ratio, and background noise level.
"""

import numpy as np
from typing import List, Dict, Any

from trueview_engine.models.model_manager import ModelManager


class ContinuousAudioPipeline:
    """
    Audio analysis pipeline producing voice events and noise assessments.
    """

    def __init__(self):
        self.model_manager = ModelManager()

    def process(self, samples: List[float] | None) -> Dict[str, Any]:
        """
        Process an incoming buffer of PCM audio float samples.

        Returns:
            {
                "speaking": bool,
                "silence": bool,
                "noise_level": str,   # low | medium | high
                "speech_duration": float,
                "voice_confidence": float,
            }
        """
        out = {
            "speaking": False,
            "silence": True,
            "noise_level": "low",
            "speech_duration": 0.0,
            "voice_confidence": 0.95,
        }

        if not samples or len(samples) < 100:
            return out

        arr = np.array(samples, dtype=np.float32)

        # 1. Energy & RMS Calculation for noise level
        rms = float(np.sqrt(np.mean(arr ** 2)))

        if rms > 0.15:
            out["noise_level"] = "high"
        elif rms > 0.05:
            out["noise_level"] = "medium"
        else:
            out["noise_level"] = "low"

        # 2. Voice Activity Detection via VoiceService
        vad_svc = self.model_manager.vad_service
        if vad_svc is not None:
            try:
                vad_res = vad_svc.process_audio_chunk(samples)
                v_status = vad_res.get("voice_status", "silence")
                is_speaking = (v_status == "speaking")

                out["speaking"] = is_speaking
                out["silence"] = not is_speaking
                out["speech_duration"] = vad_res.get("speaking_duration_seconds", 0.0)
                out["voice_confidence"] = vad_res.get("confidence", 0.90)
            except Exception:
                # Fallback to RMS energy thresholding if VAD model errors out
                is_speaking = (rms > 0.08)
                out["speaking"] = is_speaking
                out["silence"] = not is_speaking
                out["speech_duration"] = 0.5 if is_speaking else 0.0
        else:
            is_speaking = (rms > 0.08)
            out["speaking"] = is_speaking
            out["silence"] = not is_speaking

        return out
