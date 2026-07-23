"""
Temporal Memory Engine – TrueView AI Engine

Maintains efficient rolling histories across Short (1-3s), Medium (10-30s),
and Session-wide temporal windows for behaviour confirmation and trend tracking.
"""

import time
from collections import deque
from typing import Dict, Any, List, Optional


class TemporalMemoryEngine:
    """
    Multi-window sliding memory engine.
    """

    def __init__(self, short_size: int = 10, medium_size: int = 100):
        self.short_size = short_size
        self.medium_size = medium_size
        self._short_windows: Dict[str, deque] = {}
        self._medium_windows: Dict[str, deque] = {}
        self._session_summaries: Dict[str, Dict[str, Any]] = {}

    def push_snapshot(self, session_id: str, feature_snapshot: Dict[str, Any]):
        """
        Push lightweight feature snapshot into sliding memory buffers.
        """
        now = time.time()

        if session_id not in self._short_windows:
            self._short_windows[session_id] = deque(maxlen=self.short_size)
            self._medium_windows[session_id] = deque(maxlen=self.medium_size)
            self._session_summaries[session_id] = {
                "start_ts": now,
                "total_frames": 0,
                "focused_frames": 0,
                "phone_event_count": 0,
                "multi_person_event_count": 0,
                "speech_event_count": 0,
            }

        snapshot = {
            "ts": now,
            "face_detected": feature_snapshot.get("face_detected", True),
            "phone_detected": feature_snapshot.get("environment", {}).get("phone_detected", False),
            "person_count": feature_snapshot.get("environment", {}).get("person_count", 1),
            "attention_status": feature_snapshot.get("attention", {}).get("status", "FOCUSED"),
            "speaking": feature_snapshot.get("audio", {}).get("speaking", False),
            "quality": feature_snapshot.get("quality", {}).get("video_quality", "GOOD"),
        }

        self._short_windows[session_id].append(snapshot)
        self._medium_windows[session_id].append(snapshot)

        summary = self._session_summaries[session_id]
        summary["total_frames"] += 1
        if snapshot["attention_status"] == "FOCUSED":
            summary["focused_frames"] += 1

    def get_window_metrics(self, session_id: str) -> Dict[str, Any]:
        """
        Compute persistence ratio and consistency over short and medium windows.
        """
        if session_id not in self._short_windows or not self._short_windows[session_id]:
            return {
                "short_phone_ratio": 0.0,
                "short_multi_person_ratio": 0.0,
                "short_distraction_ratio": 0.0,
                "medium_phone_ratio": 0.0,
                "medium_distraction_ratio": 0.0,
                "session_attention_percentage": 100.0,
            }

        short_buf = list(self._short_windows[session_id])
        med_buf = list(self._medium_windows[session_id])
        summary = self._session_summaries[session_id]

        s_len = len(short_buf)
        m_len = len(med_buf)

        short_phone = sum(1 for s in short_buf if s["phone_detected"]) / float(s_len)
        short_multi = sum(1 for s in short_buf if s["person_count"] > 1) / float(s_len)
        short_dist = sum(1 for s in short_buf if s["attention_status"] in ("PROLONGED_DISTRACTION", "REPEATED_DISTRACTION")) / float(s_len)

        med_phone = sum(1 for s in med_buf if s["phone_detected"]) / float(m_len)
        med_dist = sum(1 for s in med_buf if s["attention_status"] in ("PROLONGED_DISTRACTION", "REPEATED_DISTRACTION")) / float(m_len)

        tot = max(1, summary["total_frames"])
        session_attn_pct = round((summary["focused_frames"] / float(tot)) * 100.0, 1)

        return {
            "short_phone_ratio": round(short_phone, 2),
            "short_multi_person_ratio": round(short_multi, 2),
            "short_distraction_ratio": round(short_dist, 2),
            "medium_phone_ratio": round(med_phone, 2),
            "medium_distraction_ratio": round(med_dist, 2),
            "session_attention_percentage": session_attn_pct,
        }

    def reset(self, session_id: str):
        if session_id in self._short_windows:
            del self._short_windows[session_id]
        if session_id in self._medium_windows:
            del self._medium_windows[session_id]
        if session_id in self._session_summaries:
            del self._session_summaries[session_id]
