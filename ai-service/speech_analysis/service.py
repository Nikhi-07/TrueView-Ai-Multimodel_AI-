"""
speech_analysis service – TrueView AI

Whisper speech-to-text + configurable keyword analysis.

Roles (kept strictly separated):
  - Speaker IDENTITY  -> ECAPA-TDNN (voice_detection/speaker_recognition)
  - Voice ACTIVITY    -> VAD detectors
  - Speech CONTENT    -> Whisper (this module) – transcription + keywords only.
Whisper is NEVER used for speaker identity or liveness.

Model: faster-whisper (CTranslate2). Lazy-loaded once, reused across requests.
Model size / device / compute type are configurable via env:
  WHISPER_MODEL_SIZE   (default "base")
  WHISPER_DEVICE       (default "auto")
  WHISPER_COMPUTE_TYPE (default "int8")

If the model cannot be loaded (no download connectivity, missing deps), the
service reports available=False honestly and the API stays usable.
"""

import base64
import io
import os
import re
import time
import wave

import numpy as np

# Configurable keyword list – overridable per request. Never treated as proof.
DEFAULT_KEYWORDS = [
    "answer", "copy", "cheat", "phone", "google", "search", "notes", "crib",
]


class SpeechAnalysisService:
    def __init__(self):
        self._model = None
        self._model_name = None
        self._load_error = None
        self._load_attempted = False

    # ── Model lifecycle (loaded once, never per-request) ────────────
    def _ensure_model(self):
        """Lazy-load the Whisper model exactly once."""
        if self._load_attempted:
            return self._model, self._model_name, self._load_error

        self._load_attempted = True
        try:
            from faster_whisper import WhisperModel

            model_size = os.environ.get("WHISPER_MODEL_SIZE", "base")
            device = os.environ.get("WHISPER_DEVICE", "auto")
            compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")

            t0 = time.time()
            self._model = WhisperModel(model_size, device=device, compute_type=compute_type)
            self._model_name = f"faster-whisper-{model_size}"
            print(f"[SpeechAnalysis] Whisper model loaded ({model_size}) in {round(time.time() - t0, 1)}s")
        except Exception as e:
            self._model = None
            self._load_error = str(e)
            print(f"[SpeechAnalysis] Whisper unavailable ({e}). Transcription disabled.")

        return self._model, self._model_name, self._load_error

    # ── Audio decoding (WAV data URL / raw base64) ──────────────────
    @staticmethod
    def decode_wav(audio_data: str):
        """Decode a base64 WAV (data URL or raw) to (samples float32, sample_rate)."""
        if audio_data.startswith("data:"):
            audio_data = audio_data.split(",", 1)[1]
        raw = base64.b64decode(audio_data)
        try:
            with wave.open(io.BytesIO(raw), "rb") as w:
                sr = w.getframerate()
                n_ch = w.getnchannels()
                sampwidth = w.getsampwidth()
                frames = w.readframes(w.getnframes())
        except Exception:
            return None, 0

        if sampwidth == 2:
            samples = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
        elif sampwidth == 1:
            samples = (np.frombuffer(frames, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
        elif sampwidth == 4:
            samples = np.frombuffer(frames, dtype=np.int32).astype(np.float32) / 2147483648.0
        else:
            return None, 0

        if n_ch > 1:
            samples = samples.reshape(-1, n_ch).mean(axis=1)
        return samples, sr

    # ── Transcription + keyword analysis ────────────────────────────
    def transcribe(self, audio_data: str, keywords=None):
        model, model_name, load_error = self._ensure_model()

        if model is None:
            return {
                "available": False,
                "transcript": "",
                "language": "unknown",
                "duration_sec": 0,
                "keywords_found": [],
                "model": "unavailable",
                "message": f"Whisper transcription unavailable: {load_error or 'model not loaded'}",
            }

        samples, sr = self.decode_wav(audio_data)
        if samples is None or sr <= 0 or len(samples) < sr * 0.5:
            return {
                "available": True,
                "transcript": "",
                "language": "unknown",
                "duration_sec": round(len(samples) / sr, 2) if sr else 0,
                "keywords_found": [],
                "model": model_name,
                "message": "Audio could not be decoded as WAV or is too short to transcribe.",
            }

        t0 = time.time()
        try:
            segments_iter, info = model.transcribe(
                samples,
                beam_size=5,
                vad_filter=True,
                language=None,
            )
            segments = list(segments_iter)
        except Exception as e:
            return {
                "available": True,
                "transcript": "",
                "language": "unknown",
                "duration_sec": round(len(samples) / sr, 2),
                "keywords_found": [],
                "model": model_name,
                "message": f"Transcription failed: {str(e)}",
            }

        transcript = " ".join(s.text.strip() for s in segments if s.text and s.text.strip()).strip()
        language = str(getattr(info, "language", "unknown") or "unknown")

        keyword_list = list(keywords) if isinstance(keywords, (list, tuple)) else DEFAULT_KEYWORDS
        lowered = transcript.lower()
        keywords_found = sorted(
            {kw.lower() for kw in keyword_list if kw and kw.lower() in lowered}
        )

        return {
            "available": True,
            "transcript": transcript,
            "language": language,
            "duration_sec": round(len(samples) / sr, 2),
            "keywords_found": keywords_found,
            "model": model_name,
            "processing_time_ms": int((time.time() - t0) * 1000),
            "message": "Transcription completed.",
        }


service = SpeechAnalysisService()
