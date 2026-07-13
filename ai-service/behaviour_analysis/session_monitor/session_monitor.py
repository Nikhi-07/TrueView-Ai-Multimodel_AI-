"""
Session Monitor – TrueView AI

Tracks stateful, session-level statistical metrics (Attention %, Focus Duration,
Speaking Duration, Face Loss Duration, etc.).
"""

class SessionMonitor:
    """
    Stateful calculator keeping cumulative metrics.
    """
    
    def __init__(self):
        self.total_session_time = 0.0
        self.focus_duration = 0.0
        self.speaking_duration = 0.0
        self.face_loss_duration = 0.0
        
    def update_metrics(self, telemetry: dict, dt: float) -> dict:
        """
        Incorporate current frame's status and update cumulative durations.
        """
        self.total_session_time += dt
        
        face_detected = telemetry.get("face_detected", False)
        gaze_direction = telemetry.get("gaze_direction", "center")
        head_dir = telemetry.get("head_pose_direction", "Looking Straight")
        voice_status = telemetry.get("voice_status", "silence")
        
        # 1. Update durations
        if not face_detected:
            self.face_loss_duration += dt
        else:
            # Candidate is focused if they are looking straight and gaze is centered
            is_focused = (gaze_direction == "center") and (head_dir == "Looking Straight")
            if is_focused:
                self.focus_duration += dt
                
        if voice_status == "speaking":
            self.speaking_duration += dt
            
        # Calculate Attention Level %
        # Ratio of focused time relative to total face-visible time
        visible_time = self.total_session_time - self.face_loss_duration
        if visible_time > 0.1:
            attention_pct = (self.focus_duration / visible_time) * 100.0
        else:
            attention_pct = 100.0
            
        return {
            "attention_pct": round(min(100.0, max(0.0, attention_pct)), 1),
            "focus_duration_seconds": round(self.focus_duration, 1),
            "speaking_duration_seconds": round(self.speaking_duration, 1),
            "face_loss_seconds": round(self.face_loss_duration, 1),
            "session_total_seconds": round(self.total_session_time, 1)
        }
        
    def reset(self):
        """Reset statistical metrics."""
        self.total_session_time = 0.0
        self.focus_duration = 0.0
        self.speaking_duration = 0.0
        self.face_loss_duration = 0.0
