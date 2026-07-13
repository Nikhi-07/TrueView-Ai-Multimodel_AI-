"""
Audio Processor – TrueView AI

Processes raw PCM floating-point audio samples (arrays) to extract features
such as RMS Volume, Max Amplitude, Energy, and Zero-Crossing Rate (ZCR).
"""

import numpy as np

class AudioProcessor:
    """
    Utility class to compute structural acoustic metrics from PCM arrays.
    """
    
    @staticmethod
    def extract_features(samples: np.ndarray) -> dict:
        """
        Extract acoustic features from mono PCM float array.
        
        Args:
            samples: 1D numpy float array of audio samples (typically in range [-1.0, 1.0])
            
        Returns:
            dict containing:
                "volume_rms": float (root-mean-square energy),
                "max_amplitude": float (peak amplitude),
                "energy": float (signal power),
                "zcr": float (zero-crossing rate),
                "sample_count": int
        """
        # Fallback if empty array is passed
        if samples is None or len(samples) == 0:
            return {
                "volume_rms": 0.0,
                "max_amplitude": 0.0,
                "energy": 0.0,
                "zcr": 0.0,
                "sample_count": 0
            }
            
        # Ensure correct type
        samples = np.asarray(samples, dtype=np.float32)
        
        # Calculate maximum peak amplitude
        max_amplitude = float(np.max(np.abs(samples)))
        
        # Calculate Root-Mean-Square (RMS) volume
        volume_rms = float(np.sqrt(np.mean(samples ** 2)))
        
        # Calculate Energy (signal power)
        energy = float(np.sum(samples ** 2))
        
        # Calculate Zero-Crossing Rate (ZCR)
        # Count sign crossings (sign changes between consecutive samples)
        zcr = 0.0
        if len(samples) > 1:
            diffs = np.diff(np.sign(samples))
            # Wherever sign crosses, diff is non-zero (either +2 or -2)
            crossings = np.sum(diffs != 0)
            zcr = float(crossings) / (2.0 * len(samples))
            
        return {
            "volume_rms": round(volume_rms, 6),
            "max_amplitude": round(max_amplitude, 6),
            "energy": round(energy, 6),
            "zcr": round(zcr, 4),
            "sample_count": len(samples)
        }
