"""
Human-in-the-Loop & Reviewer Feedback Store – TrueView AI Engine

Stores human audit decisions (CONFIRMED, FALSE_POSITIVE, DISMISSED, UNCERTAIN)
for post-session review, threshold tuning, and offline dataset curation.
"""

import time
from typing import Dict, Any, List, Optional


class ReviewerFeedbackStore:
    """
    Manages reviewer feedback logs per session.
    """

    def __init__(self):
        self._feedback_logs: List[Dict[str, Any]] = []

    def record_feedback(
        self,
        session_id: str,
        event_id: str,
        reviewer_decision: str, # CONFIRMED | FALSE_POSITIVE | DISMISSED | UNCERTAIN
        reviewer_id: Optional[str] = "admin",
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Record reviewer judgment on a flagged event.
        """
        entry = {
            "session_id": session_id,
            "event_id": event_id,
            "reviewer_decision": reviewer_decision.upper(),
            "reviewer_id": reviewer_id,
            "notes": notes,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }
        self._feedback_logs.append(entry)
        return entry

    def get_session_feedback(self, session_id: str) -> List[Dict[str, Any]]:
        return [f for f in self._feedback_logs if f["session_id"] == session_id]
