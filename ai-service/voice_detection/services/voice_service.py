"""
Voice Service – TrueView AI

Coordinates the Voice Activity Detection (VAD) and speech analysis pipeline.
"""

import time
import numpy as np
from voice_detection.audio_processing.audio_processor import AudioProcessor
from voice_detection.noise_filter.noise_filter import NoiseFilter
from voice_detection.vad.vad_detector import VADDetector
from voice_detection.speech_analysis.speech_analyzer import SpeechAnalyzer
from voice_detection.utils.constants import DEFAULT_FRAME_DURATION

class VoiceService:
    """
    Service orchestration for real-time VAD processing and session state.
    """
    
    def __init__(self):
        self.audio_processor = AudioProcessor()
        self.noise_filter = NoiseFilter()
        self.vad_detector = VADDetector()
        self.speech_analyzer = SpeechAnalyzer()
        
    def process_audio_chunk(self, pcm_samples: list) -> dict:
        """
        Process a list of PCM float values and compute voice analytics.
        
        Args:
            pcm_samples: List of floating-point audio amplitude samples.
            
        Returns:
            dict containing voice status, energy, noise levels, and speech warnings.
        """
        start_time = time.time()
        
        samples_np = np.array(pcm_samples, dtype=np.float32)
        
        # 1. Extract acoustic features
        features = self.audio_processor.extract_features(samples_np)
        volume_rms = features["volume_rms"]
        zcr = features["zcr"]
        max_amplitude = features["max_amplitude"]
        energy = features["energy"]
        
        # 2. Update noise floor
        noise_floor = self.noise_filter.update_floor(volume_rms)
        
        # 3. Detect voice activity (VAD)
        vad_result = self.vad_detector.detect_voice(volume_rms, zcr, noise_floor)
        status = vad_result["status"]
        confidence = vad_result["confidence"]
        
        # Estimate dt (time delta) from sample size
        # If 16kHz mono audio, duration = samples / 16000
        dt = len(pcm_samples) / 16000.0
        # Sanity boundary check
        if dt <= 0.0 or dt > 2.0:
            dt = DEFAULT_FRAME_DURATION
            
        # 4. Perform conversational pattern analysis
        speech_result = self.speech_analyzer.analyze_patterns(status, volume_rms, noise_floor, dt)
        
        processing_time_ms = int((time.time() - start_time) * 1000)
        
        return {
            "voice_status": status,
            "confidence": confidence,
            "volume_rms": volume_rms,
            "max_amplitude": max_amplitude,
            "energy": energy,
            "zcr": zcr,
            "noise_level": noise_floor,
            "speaking_duration_seconds": speech_result["speaking_duration"],
            "silence_duration_seconds": speech_result["silence_duration"],
            "noise_duration_seconds": speech_result["noise_duration"],
            "session_total_seconds": speech_result["session_total_duration"],
            "speaking_ratio_pct": speech_result["speaking_ratio_pct"],
            "current_pattern": speech_result["current_pattern"],
            "consecutive_speaking_seconds": speech_result["consecutive_speaking_seconds"],
            "consecutive_silence_seconds": speech_result["consecutive_silence_seconds"],
            "multiple_voices_detected": speech_result["multiple_voices_detected"],
            "processing_time_ms": processing_time_ms
        }
        
    def reset_session(self):
        """Reset stateful analyzers."""
        self.noise_filter.reset()
        self.speech_analyzer.reset()
