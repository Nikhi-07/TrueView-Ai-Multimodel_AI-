"""
Behaviour Service Orchestrator – TrueView AI

Aggregates telemetry, runs event classifiers, updates timelines,
and computes session metrics.
"""

import time
from behaviour_analysis.event_detection.event_detector import EventDetector
from behaviour_analysis.timeline.timeline_manager import TimelineManager
from behaviour_analysis.pattern_analysis.pattern_analyzer import PatternAnalyzer
from behaviour_analysis.session_monitor.session_monitor import SessionMonitor

class BehaviourService:
    """
    Main coordinator pipeline for Behaviour Analysis.
    """
    
    def __init__(self):
        self.detector = EventDetector()
        self.timeline_mgr = TimelineManager()
        self.session_monitor = SessionMonitor()
        self.last_process_time = time.time()
        
    def analyze_behaviour(self, telemetry: dict) -> dict:
        """
        Evaluate frame telemetry and return updated behavior analytics state.
        
        Args:
            telemetry: Raw aggregated outputs of other AI modules.
            
        Returns:
            dict with timeline list, metrics, active events list, and summary.
        """
        now = time.time()
        dt = now - self.last_process_time
        
        # Guard frame delta bounds (in case of long gaps between frames)
        if dt <= 0.0 or dt > 3.0:
            dt = 0.1  # Default fallback frame time
            
        self.last_process_time = now
        
        # 1. Detect instant events in current frame
        active_events = self.detector.detect_events(telemetry, dt)
        
        # 2. Update stateful timeline (combines/merges duplicate adjacent events)
        self.timeline_mgr.add_events(active_events, dt)
        
        # 3. Update session metrics (Attention %, Focus time, Face loss)
        metrics = self.session_monitor.update_metrics(telemetry, dt)
        
        # 4. Extract timeline statistics (event frequencies)
        timeline = self.timeline_mgr.get_timeline()
        patterns = PatternAnalyzer.analyze_patterns(timeline)
        
        # Enrich metrics with pattern analysis counts
        metrics["looking_away_count"] = patterns["looking_away_count"]
        metrics["phone_detection_count"] = patterns["phone_detection_count"]
        metrics["multiple_person_count"] = patterns["multiple_person_count"]
        
        return {
            "timeline": timeline,
            "metrics": metrics,
            "active_events": active_events,
            "session_summary": {
                "behavioral_insight": patterns["behavioral_insight"],
                "attention_rating": self._classify_rating(metrics["attention_pct"]),
                "last_active_event": timeline[-1]["event_type"] if len(timeline) > 0 else "None"
            }
        }
        
    def reset_session(self):
        """Reset histories and stateful monitors."""
        self.detector.reset()
        self.timeline_mgr.reset()
        self.session_monitor.reset()
        self.last_process_time = time.time()
        
    @staticmethod
    def _classify_rating(attention_pct: float) -> str:
        """Classify numerical attention to categorical grade."""
        if attention_pct >= 85.0:
            return "Excellent"
        elif attention_pct >= 65.0:
            return "Satisfactory"
        else:
            return "Critical Attention Required"
