"""
MediaPipe Face Landmarker Blendshape Temporal Blink Detector – TrueView AI

Tracks facial blendshape signals:
- eyeBlinkLeft
- eyeBlinkRight

Enforces temporal eye closure state sequence:
OPEN → CLOSING → CLOSED → REOPEN → (1 BLINK)

Laptop tilt, head translation, and camera rotation do NOT change eyeBlinkLeft/eyeBlinkRight
blendshape signals, preventing false blink counts.
"""

import time

class MediaPipeBlendshapeBlinkDetector:
    def __init__(self, blink_threshold: float = 0.45, open_threshold: float = 0.22):
        self.blink_threshold = blink_threshold  # Blendshape > 0.45 = Closed
        self.open_threshold = open_threshold    # Blendshape < 0.22 = Open
        
        self.state = "OPEN"  # OPEN, CLOSING, CLOSED, REOPEN
        self.blink_count = 0
        self.last_blink_time = 0.0

    def reset(self):
        self.state = "OPEN"
        self.blink_count = 0
        self.last_blink_time = 0.0

    def process_blendshapes(self, blink_left: float, blink_right: float, timestamp: float = None) -> dict:
        """
        Process single frame blendshape signals (eyeBlinkLeft, eyeBlinkRight)
        and update temporal eye state machine.
        """
        if timestamp is None:
            timestamp = time.time()

        eye_blink_avg = (float(blink_left) + float(blink_right)) / 2.0
        eye_blink_avg = max(0.0, min(1.0, eye_blink_avg))

        blink_detected_this_frame = False

        # ── State Machine: OPEN → CLOSING → CLOSED → REOPEN ──
        if self.state == "OPEN":
            if eye_blink_avg >= self.blink_threshold * 0.7:
                self.state = "CLOSING"

        elif self.state == "CLOSING":
            if eye_blink_avg >= self.blink_threshold:
                self.state = "CLOSED"
            elif eye_blink_avg < self.open_threshold:
                self.state = "OPEN"

        elif self.state == "CLOSED":
            if eye_blink_avg < self.open_threshold:
                now = time.time()
                if (now - self.last_blink_time) >= 0.35:
                    self.blink_count += 1
                    self.last_blink_time = now
                    blink_detected_this_frame = True

                self.state = "OPEN"

        return {
            "detected": blink_detected_this_frame,
            "count": self.blink_count,
            "state": self.state,
            "eye_blink_avg": round(eye_blink_avg, 4),
            "blink_left": round(blink_left, 4),
            "blink_right": round(blink_right, 4)
        }
