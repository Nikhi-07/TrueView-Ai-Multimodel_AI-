"""
Timeline Manager – TrueView AI

Appends behavioral events statefully, combining adjacent similar items
into single durational events to optimize communication size.
"""

import time

class TimelineManager:
    """
    Manages session event logging and merging.
    """
    
    def __init__(self, max_timeline_size: int = 200):
        # List of timeline events
        # Format of each item:
        # {
        #   "timestamp": str (HH:MM:SS format),
        #   "event_type": str,
        #   "severity": str ("INFO" | "WARNING" | "CRITICAL"),
        #   "duration": float (seconds active),
        #   "description": str,
        #   "start_epoch": float
        # }
        self.timeline = []
        self.max_size = max_timeline_size
        
    def add_events(self, active_events: list, dt: float):
        """
        Record events to the timeline, statefully merging consecutive items.
        
        Args:
            active_events: List of event dicts active in the current frame
            dt: Frame duration in seconds
        """
        now_epoch = time.time()
        now_str = time.strftime("%H:%M:%S", time.localtime(now_epoch))
        
        for act in active_events:
            etype = act["type"]
            sev = act["severity"]
            desc = act["description"]
            
            # Check if we can merge with the last event in the timeline
            merged = False
            if len(self.timeline) > 0:
                last_event = self.timeline[-1]
                
                # Check if it matches type, and if it was updated recently (e.g. within last 3 seconds)
                # to prevent merging across long intervals of non-activity
                time_gap = now_epoch - (last_event["start_epoch"] + last_event["duration"])
                
                if last_event["event_type"] == etype and time_gap < 3.0:
                    last_event["duration"] = round(last_event["duration"] + dt, 1)
                    # Keep description updated
                    last_event["description"] = desc
                    merged = True
                    
            if not merged:
                # Add new timeline entry
                self.timeline.append({
                    "timestamp": now_str,
                    "event_type": etype,
                    "severity": sev,
                    "duration": round(dt, 1),
                    "description": desc,
                    "start_epoch": now_epoch
                })
                
        # Enforce rolling memory boundaries
        if len(self.timeline) > self.max_size:
            # Pop oldest event but keep timeline clean
            self.timeline.pop(0)
            
    def get_timeline(self) -> list:
        """Return the list of recorded timeline events."""
        # Convert start_epoch before sharing to clean json formatting
        formatted = []
        for ev in self.timeline:
            formatted.append({
                "timestamp": ev["timestamp"],
                "event_type": ev["event_type"],
                "severity": ev["severity"],
                "duration": ev["duration"],
                "description": ev["description"]
            })
        return formatted
        
    def reset(self):
        """Clear timeline database."""
        self.timeline.clear()
