"""
Behaviour Event Detector – TrueView AI

Analyzes instant frame telemetry to detect behaviors (Looking Away,
No Face, Spoof, Unknown, Phone, Multiple Persons, Speaking, etc.)
using stateful rolling duration checks.
"""

import time
from collections import deque
from behaviour_analysis.utils.constants import (
    SEVERITY_INFO,
    SEVERITY_WARNING,
    SEVERITY_CRITICAL,
    EVENT_LOOKING_AWAY,
    EVENT_FREQUENT_HEAD_TURNING,
    EVENT_NO_FACE,
    EVENT_UNKNOWN_FACE,
    EVENT_SPOOF_ATTEMPT,
    EVENT_MULTIPLE_PERSONS,
    EVENT_PHONE_DETECTED,
    EVENT_SPEAKING_DETECTED,
    EVENT_USER_LEFT,
    EVENT_SESSION_RESUMED,
    EVENT_FACE_RECOVERED,
    EVENT_DESCRIPTIONS,
    THRESHOLD_LOOKING_AWAY,
    THRESHOLD_NO_FACE,
    THRESHOLD_SPEAKING,
    THRESHOLD_UNKNOWN_FACE,
    THRESHOLD_SPOOF,
    HEAD_TURN_WINDOW,
    HEAD_TURN_COUNT_LIMIT
)

class EventDetector:
    """
    Main stateful evaluator assessing transitions across frames.
    """
    
    def __init__(self):
        # Rolling accumulation timers (seconds)
        self.looking_away_timer = 0.0
        self.no_face_timer = 0.0
        self.unknown_face_timer = 0.0
        self.spoof_timer = 0.0
        self.speaking_timer = 0.0
        
        # State memory flags
        self.was_face_detected = True
        self.was_session_running = False
        
        # Head rotation event tracking
        # Stores timestamps of registered head turns (Yaw deviation > 15 deg)
        self.head_turn_history = deque()
        self.last_head_state_straight = True
        
    def detect_events(self, telemetry: dict, dt: float) -> list:
        """
        Evaluate telemetry and extract active behaviour events.
        
        Args:
            telemetry: Dictionary containing:
                - face_detected (bool)
                - identity (str)
                - is_live (bool)
                - gaze_direction (str)
                - head_pose_yaw (float)
                - head_pose_pitch (float)
                - head_pose_direction (str)
                - voice_status (str)
                - yolo_person_count (int)
                - yolo_phone_detected (bool)
                - yolo_book_detected (bool)
            dt: Frame duration in seconds
            
        Returns:
            list of dict: newly active events.
        """
        events = []
        now = time.time()
        
        # Extract fields with safe fallbacks
        face_detected = telemetry.get("face_detected", False)
        identity = telemetry.get("identity", "unknown")
        is_live = telemetry.get("is_live", True)
        gaze_direction = telemetry.get("gaze_direction", "center")
        yaw = telemetry.get("head_pose_yaw", 0.0)
        pitch = telemetry.get("head_pose_pitch", 0.0)
        head_dir = telemetry.get("head_pose_direction", "Looking Straight")
        voice_status = telemetry.get("voice_status", "silence")
        person_count = telemetry.get("yolo_person_count", 0)
        phone_detected = telemetry.get("yolo_phone_detected", False)
        book_detected = telemetry.get("yolo_book_detected", False)
        
        # ──────────────────────────────────────────────
        # 1. Face Presence & Session Resume/Left checks
        # ──────────────────────────────────────────────
        if not face_detected:
            self.no_face_timer += dt
            self.looking_away_timer = 0.0
            self.unknown_face_timer = 0.0
            self.spoof_timer = 0.0
            
            # Transition: Left camera
            if self.was_face_detected:
                self.was_face_detected = False
                events.append({
                    "type": EVENT_USER_LEFT,
                    "severity": SEVERITY_CRITICAL,
                    "description": EVENT_DESCRIPTIONS[EVENT_USER_LEFT]
                })
                
            # If no face is observed for long enough
            if self.no_face_timer > THRESHOLD_NO_FACE:
                events.append({
                    "type": EVENT_NO_FACE,
                    "severity": SEVERITY_WARNING,
                    "description": EVENT_DESCRIPTIONS[EVENT_NO_FACE]
                })
        else:
            self.no_face_timer = 0.0
            
            # Transition: Face recovered / session resumed
            if not self.was_face_detected:
                self.was_face_detected = True
                events.append({
                    "type": EVENT_FACE_RECOVERED,
                    "severity": SEVERITY_INFO,
                    "description": EVENT_DESCRIPTIONS[EVENT_FACE_RECOVERED]
                })
                events.append({
                    "type": EVENT_SESSION_RESUMED,
                    "severity": SEVERITY_INFO,
                    "description": EVENT_DESCRIPTIONS[EVENT_SESSION_RESUMED]
                })
                
            # ──────────────────────────────────────────────
            # 2. Spoof & Identity Recognition checks
            # ──────────────────────────────────────────────
            # Identity Verification
            if identity == "unknown":
                self.unknown_face_timer += dt
                if self.unknown_face_timer > THRESHOLD_UNKNOWN_FACE:
                    events.append({
                        "type": EVENT_UNKNOWN_FACE,
                        "severity": SEVERITY_WARNING,
                        "description": f"Unknown user mismatch: detected raw identity label '{identity}'."
                    })
            else:
                self.unknown_face_timer = 0.0
                
            # Liveness Verification
            if not is_live:
                self.spoof_timer += dt
                if self.spoof_timer > THRESHOLD_SPOOF:
                    events.append({
                        "type": EVENT_SPOOF_ATTEMPT,
                        "severity": SEVERITY_CRITICAL,
                        "description": EVENT_DESCRIPTIONS[EVENT_SPOOF_ATTEMPT]
                    })
            else:
                self.spoof_timer = 0.0
                
            # ──────────────────────────────────────────────
            # 3. Gaze Attention & Head Pose checks
            # ──────────────────────────────────────────────
            # Candidate is looking away if gaze is not centered OR head is not looking straight
            is_looking_away = (gaze_direction != "center") or (head_dir != "Looking Straight")
            
            if is_looking_away:
                self.looking_away_timer += dt
                if self.looking_away_timer > THRESHOLD_LOOKING_AWAY:
                    desc = f"Looking Away: Gaze is {gaze_direction}, Head Pose is {head_dir.lower()}."
                    events.append({
                        "type": EVENT_LOOKING_AWAY,
                        "severity": SEVERITY_WARNING,
                        "description": desc
                    })
            else:
                self.looking_away_timer = 0.0
                
            # ──────────────────────────────────────────────
            # 4. Head Turning Frequency Tracker
            # ──────────────────────────────────────────────
            # Register a head turn if absolute yaw yaw exceeds 18 degrees
            is_currently_turned = abs(yaw) > 18.0
            if is_currently_turned and self.last_head_state_straight:
                # Transitioned from center to side -> register head turn event
                self.head_turn_history.append(now)
                self.last_head_state_straight = False
            elif not is_currently_turned:
                self.last_head_state_straight = True
                
            # Clean up old head turns outside the tracking window (e.g. 30s)
            while self.head_turn_history and now - self.head_turn_history[0] > HEAD_TURN_WINDOW:
                self.head_turn_history.popleft()
                
            # Check turning frequency trigger
            if len(self.head_turn_history) >= HEAD_TURN_COUNT_LIMIT:
                events.append({
                    "type": EVENT_FREQUENT_HEAD_TURNING,
                    "severity": SEVERITY_WARNING,
                    "description": f"Frequent Head Turning: {len(self.head_turn_history)} turns registered in the last {int(HEAD_TURN_WINDOW)}s."
                })
                
        # ──────────────────────────────────────────────
        # 5. Audio / Voice VAD Checks
        # ──────────────────────────────────────────────
        if voice_status == "speaking":
            self.speaking_timer += dt
            if self.speaking_timer > THRESHOLD_SPEAKING:
                events.append({
                    "type": EVENT_SPEAKING_DETECTED,
                    "severity": SEVERITY_WARNING,
                    "description": EVENT_DESCRIPTIONS[EVENT_SPEAKING_DETECTED]
                })
        else:
            self.speaking_timer = 0.0
            
        # ──────────────────────────────────────────────
        # 6. Object Detection & Prohibited Items Checks
        # ──────────────────────────────────────────────
        if phone_detected:
            events.append({
                "type": EVENT_PHONE_DETECTED,
                "severity": SEVERITY_CRITICAL,
                "description": EVENT_DESCRIPTIONS[EVENT_PHONE_DETECTED]
            })
            
        if person_count > 1:
            events.append({
                "type": EVENT_MULTIPLE_PERSONS,
                "severity": SEVERITY_CRITICAL,
                "description": f"Multiple Persons Detected: {person_count} individuals visible."
            })
            
        return events
        
    def reset(self):
        """Reset state tracking."""
        self.looking_away_timer = 0.0
        self.no_face_timer = 0.0
        self.unknown_face_timer = 0.0
        self.spoof_timer = 0.0
        self.speaking_timer = 0.0
        self.was_face_detected = True
        self.was_session_running = False
        self.head_turn_history.clear()
        self.last_head_state_straight = True
