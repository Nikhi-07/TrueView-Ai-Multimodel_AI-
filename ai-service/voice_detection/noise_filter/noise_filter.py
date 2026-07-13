"""
Noise Filter – TrueView AI

Tracks background acoustic activity using a stateful rolling history
to determine the dynamic noise floor (ambient noise floor).
Uses the 15th percentile of rolling RMS energy to avoid vocal spikes polluting the noise floor.
"""

import numpy as np
from collections import deque
from voice_detection.utils.constants import NOISE_FLOOR_MEMORY_SIZE, NOISE_FLOOR_MIN

class NoiseFilter:
    """
    Stateful filter tracking rolling signal features to isolate noise level.
    """
    
    def __init__(self, memory_size: int = NOISE_FLOOR_MEMORY_SIZE):
        self.memory_size = memory_size
        self.rms_history = deque(maxlen=memory_size)
        self.current_floor = NOISE_FLOOR_MIN
        
    def update_floor(self, current_rms: float) -> float:
        """
        Record the current frame's RMS and compute the updated background noise floor.
        
        Args:
            current_rms: RMS volume energy of current audio block
            
        Returns:
            float: Calculated dynamic noise floor
        """
        # Add to history
        self.rms_history.append(current_rms)
        
        # Calculate 15th percentile of recent energy values
        # This isolates ambient background static, ignoring sudden speech spikes
        if len(self.rms_history) > 0:
            history_np = np.array(self.rms_history)
            self.current_floor = float(np.percentile(history_np, 15))
        else:
            self.current_floor = current_rms
            
        # Ensure it never drops below the absolute logical minimum
        self.current_floor = max(NOISE_FLOOR_MIN, self.current_floor)
        
        return round(self.current_floor, 6)
        
    def reset(self):
        """Reset noise history."""
        self.rms_history.clear()
        self.current_floor = NOISE_FLOOR_MIN
        
    def get_floor(self) -> float:
        """Return the current noise floor."""
        return self.current_floor
