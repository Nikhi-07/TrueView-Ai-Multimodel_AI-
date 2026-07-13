"""
Pattern Analyzer – TrueView AI

Analyzes timeline logs to compute patterns and behavior insights.
"""

from behaviour_analysis.utils.constants import EVENT_LOOKING_AWAY, EVENT_PHONE_DETECTED, EVENT_MULTIPLE_PERSONS

class PatternAnalyzer:
    """
    Evaluates historical occurrences of flags over the session.
    """
    
    @staticmethod
    def analyze_patterns(timeline: list) -> dict:
        """
        Aggregate timeline metrics to construct behavioral patterns.
        """
        looking_away_count = 0
        phone_count = 0
        multi_person_count = 0
        
        for ev in timeline:
            etype = ev["event_type"]
            if etype == EVENT_LOOKING_AWAY:
                looking_away_count += 1
            elif etype == EVENT_PHONE_DETECTED:
                phone_count += 1
            elif etype == EVENT_MULTIPLE_PERSONS:
                multi_person_count += 1
                
        # Profile behavioral insight status
        insight = "Focused Student"
        if phone_count > 0:
            insight = "Unauthorized Devices Visible"
        elif multi_person_count > 0:
            insight = "Multiple Room Occupants"
        elif looking_away_count > 5:
            insight = "Repeated Distractions"
            
        return {
            "looking_away_count": looking_away_count,
            "phone_detection_count": phone_count,
            "multiple_person_count": multi_person_count,
            "behavioral_insight": insight
        }
