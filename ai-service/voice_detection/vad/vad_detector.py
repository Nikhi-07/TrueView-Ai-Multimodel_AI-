"""
Voice Activity Detection (VAD) Detector – TrueView AI

Evaluates frame signal features against the ambient noise floor and zero-crossing bounds
to classify the frame as Speaking, Silence, or Background Noise.
Computes classifier confidence scores.
"""

from voice_detection.utils.constants import (
    VoiceStatus,
    MIN_SPEECH_RMS_OFFSET,
    ABS_SILENCE_RMS_LIMIT,
    ABS_SPEECH_RMS_LIMIT,
    ZCR_SPEECH_MAX
)

class VADDetector:
    """
    Classifies frames into speaking, silence, or noise based on acoustic parameters.
    """
    
    @staticmethod
    def detect_voice(volume_rms: float, zcr: float, noise_floor: float) -> dict:
        """
        Evaluate signal features to determine voice activity.
        
        Args:
            volume_rms: Root-mean-square energy of the frame
            zcr: Zero-crossing rate of the frame
            noise_floor: Active ambient noise floor
            
        Returns:
            dict containing:
                "status": str ("silence" | "speaking" | "background_noise"),
                "confidence": float (0.0 to 1.0)
        """
        # 1. Absolute Silence check
        if volume_rms < ABS_SILENCE_RMS_LIMIT:
            return {
                "status": VoiceStatus.SILENCE,
                "confidence": round(1.0 - (volume_rms / ABS_SILENCE_RMS_LIMIT) * 0.2, 2)
            }
            
        # Determine dynamic speak trigger threshold
        speak_threshold = noise_floor + MIN_SPEECH_RMS_OFFSET
        
        # 2. Safety Peak threshold (always voice)
        if volume_rms >= ABS_SPEECH_RMS_LIMIT:
            # High amplitude speech
            return {
                "status": VoiceStatus.SPEAKING,
                "confidence": 0.98
            }
            
        # 3. Intermediate check against dynamic floor
        if volume_rms > speak_threshold:
            # Signal has energy, let's verify if it's white noise/hiss or vocal formants
            # Human speech has clean low-frequency components, keeping ZCR low.
            # Fan noise, keyboard typing, or mic brush has a high ZCR.
            if zcr > ZCR_SPEECH_MAX:
                # High energy but high zero-crossings -> hiss, rustling, or keyboard taps
                return {
                    "status": VoiceStatus.BACKGROUND_NOISE,
                    "confidence": round(min(0.95, 0.60 + (zcr - ZCR_SPEECH_MAX) * 0.5), 2)
                }
            else:
                # Valid voice activity detected
                # Confidence scales with how much the signal exceeds the floor
                diff = volume_rms - speak_threshold
                margin = ABS_SPEECH_RMS_LIMIT - speak_threshold
                conf = 0.70 + (diff / max(0.001, margin)) * 0.28
                return {
                    "status": VoiceStatus.SPEAKING,
                    "confidence": round(max(0.70, min(0.98, conf)), 2)
                }
        else:
            # Low energy, but above absolute silence -> faint ambient noise or silence
            # If it's close to the noise floor, it's silence/normal noise
            return {
                "status": VoiceStatus.SILENCE,
                "confidence": round(0.80 + (1.0 - (volume_rms / speak_threshold)) * 0.18, 2)
            }
