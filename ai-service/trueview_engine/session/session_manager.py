"""
Session Lifecycle Manager – TrueView AI Engine

Manages session states (CREATED -> INITIALIZING -> IDENTITY_VERIFICATION ->
LIVENESS_CHECK -> MONITORING -> ENDING -> COMPLETED) and session-level telemetry.
"""

import time
from typing import Dict, Any, Optional


class SessionState:
    CREATED = "CREATED"
    INITIALIZING = "INITIALIZING"
    IDENTITY_VERIFICATION = "IDENTITY_VERIFICATION"
    LIVENESS_CHECK = "LIVENESS_CHECK"
    MONITORING = "MONITORING"
    ENDING = "ENDING"
    COMPLETED = "COMPLETED"


class SessionInstance:
    """Represents an active proctoring session."""

    def __init__(self, session_id: str, user_id: str = "candidate_01", session_type: str = "EXAM",
                 registered_face_embeddings=None, monitoring_profile: str = "MODERATE"):
        self.session_id = session_id
        self.user_id = user_id
        self.session_type = session_type
        self.monitoring_profile = monitoring_profile or "MODERATE"
        # Registered 128-D face embedding(s) supplied by the backend at session start.
        # Used ONLY for real SFace recognition; empty means recognition is unavailable.
        self.registered_face_embeddings = registered_face_embeddings or []
        self.state = SessionState.CREATED
        self.start_time = time.time()
        self.frame_count = 0
        self.last_frame_ts = time.time()
        self.fps = 0.0

    def update_fps(self):
        self.frame_count += 1
        now = time.time()
        dt = now - self.last_frame_ts
        if dt >= 1.0:
            self.fps = round(self.frame_count / max(now - self.start_time, 1.0), 1)
            self.last_frame_ts = now


class SessionManager:
    """
    Registry of active proctoring sessions.
    """
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(SessionManager, cls).__new__(cls)
            cls._instance._sessions: Dict[str, SessionInstance] = {}
        return cls._instance

    def get_or_create(self, session_id: str, user_id: str = "candidate_01", session_type: str = "EXAM",
                      registered_face_embeddings=None, monitoring_profile: str = "MODERATE") -> SessionInstance:
        if session_id not in self._sessions:
            sess = SessionInstance(session_id, user_id, session_type, registered_face_embeddings, monitoring_profile=monitoring_profile)
            sess.state = SessionState.MONITORING
            self._sessions[session_id] = sess
        else:
            sess = self._sessions[session_id]
            if registered_face_embeddings:
                sess.registered_face_embeddings = registered_face_embeddings
            if user_id and user_id != "candidate_01":
                sess.user_id = user_id
            if session_type:
                sess.session_type = session_type
            if monitoring_profile:
                sess.monitoring_profile = monitoring_profile
        return self._sessions[session_id]

    def set_state(self, session_id: str, state: str):
        if session_id in self._sessions:
            self._sessions[session_id].state = state

    def remove(self, session_id: str):
        if session_id in self._sessions:
            del self._sessions[session_id]

    def queue_lengths(self) -> Dict[str, Any]:
        """
        Real-time queue / pipeline health snapshot for the performance panel.

        The AI service processes ONE frame at a time (clients drop stale frames
        while a request is in flight), so the effective request queue is 0-1.
        Returns per-session telemetry so the panel can detect a backed-up pipe.
        """
        sessions = []
        now = time.time()
        for sid, sess in self._sessions.items():
            sessions.append({
                "session_id": sid,
                "frame_count": sess.frame_count,
                "fps": sess.fps,
                "state": sess.state,
                "age_seconds": round(now - sess.start_time, 1),
            })
        return {
            "active_sessions": len(self._sessions),
            "request_queue_depth": 0,  # stateless: one request at a time by design
            "sessions": sessions,
        }
