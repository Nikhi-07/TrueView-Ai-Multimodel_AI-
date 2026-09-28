"""
Environment Monitor – TrueView AI

Analyzes active detections to profile the proctoring environment.
Evaluates confirmed vs validating objects, manages state transitions across
lifecycle boundaries (CLEAR -> VALIDATING -> DETECTED -> CLEARED),
and produces normalized security events.
"""

import time
import uuid
from ..utils.constants import PROHIBITED_CLASSES, OBJECT_LOST_GRACE_PERIOD_MS


class EnvironmentMonitor:
    """
    Analyzes list of detected objects and asserts verified proctoring status
    based on temporally confirmed detections and state machine lifecycle.
    """

    def __init__(self):
        self._prev_phone_state = "CLEAN"
        self._prev_multiple_persons = False
        self._prev_laptop_state = "CLEAN"
        self._prev_book_state = "CLEAN"
        self._last_confirmed_seen = {}

    def monitor_environment(self, detections: list) -> dict:
        """
        Scan detections and generate environment safety metrics based on confirmed events
        and state lifecycle transitions.

        Args:
            detections: List of current frame detections from ObjectTracker

        Returns:
            dict containing verified proctoring metrics:
                "person_count": int,
                "validating_person_count": int,
                "person_status": str ("no_person" | "single_person" | "multiple_persons"),
                "phone_status": str ("CLEAN" | "VALIDATING" | "DETECTED"),
                "phone_detected": bool,
                "laptop_status": str ("CLEAN" | "VALIDATING" | "DETECTED"),
                "laptop_detected": bool,
                "book_status": str ("CLEAN" | "VALIDATING" | "DETECTED"),
                "book_detected": bool,
                "monitor_detected": bool,
                "prohibited_items_count": int,
                "prohibited_items_list": list,
                "events": list
        """
        now = time.time()
        grace_period_s = OBJECT_LOST_GRACE_PERIOD_MS / 1000.0

        # ── 1. Group confirmed vs validating items ──
        confirmed_persons = [d for d in detections if d["label"] == "person" and d.get("confirmed", False)]
        validating_persons = [d for d in detections if d["label"] == "person" and not d.get("confirmed", False)]

        raw_phones = [d for d in detections if d["label"] == "phone"]
        confirmed_phones = [d for d in raw_phones if d.get("confirmed", False)]

        raw_laptops = [d for d in detections if d["label"] == "laptop"]
        confirmed_laptops = [d for d in raw_laptops if d.get("confirmed", False)]

        raw_books = [d for d in detections if d["label"] == "book"]
        confirmed_books = [d for d in raw_books if d.get("confirmed", False)]

        monitors = [d for d in detections if d["label"] == "monitor"]

        # ── 2. Update Phone Lifecycle Status ──
        if len(confirmed_phones) > 0:
            phone_status = "DETECTED"
            self._last_confirmed_seen["phone"] = now
        elif len(raw_phones) > 0:
            # Under temporal validation
            phone_status = "VALIDATING"
        elif now - self._last_confirmed_seen.get("phone", 0) < grace_period_s:
            # Within post-detection grace period (prevent frame flicker)
            phone_status = "DETECTED"
        else:
            phone_status = "CLEAN"

        phone_detected = (phone_status == "DETECTED")

        # ── 3. Update Laptop Lifecycle Status ──
        if len(confirmed_laptops) > 0:
            laptop_status = "DETECTED"
            self._last_confirmed_seen["laptop"] = now
        elif len(raw_laptops) > 0:
            laptop_status = "VALIDATING"
        elif now - self._last_confirmed_seen.get("laptop", 0) < grace_period_s:
            laptop_status = "DETECTED"
        else:
            laptop_status = "CLEAN"

        laptop_detected = (laptop_status == "DETECTED")

        # ── 4. Update Book / Document Lifecycle Status ──
        if len(confirmed_books) > 0:
            book_status = "DETECTED"
            self._last_confirmed_seen["book"] = now
        elif len(raw_books) > 0:
            book_status = "VALIDATING"
        elif now - self._last_confirmed_seen.get("book", 0) < grace_period_s:
            book_status = "DETECTED"
        else:
            book_status = "CLEAN"

        book_detected = (book_status == "DETECTED")

        # ── 5. Person Count & Multiple-Person Status ──
        person_count = len(confirmed_persons)
        validating_person_count = len(validating_persons)

        if person_count == 0:
            person_status = "no_person"
        elif person_count == 1:
            person_status = "single_person"
        else:
            person_status = "multiple_persons"

        # ── 6. Aggregate Prohibited Items ──
        prohibited_items = []
        if phone_detected:
            prohibited_items.append("phone")
        if book_detected:
            prohibited_items.append("book")
        if laptop_detected:
            prohibited_items.append("laptop")

        # ── 7. Generate Discrete State-Transition Events ──
        events = []

        # Phone State Transition
        if self._prev_phone_state != "DETECTED" and phone_status == "DETECTED":
            best_conf = max([d["confidence"] for d in confirmed_phones], default=0.85)
            events.append({
                "event_id": f"evt_phone_{uuid.uuid4().hex[:8]}",
                "type": "MOBILE_PHONE_DETECTED",
                "severity": "CRITICAL",
                "confidence": best_conf,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "status": "CONFIRMED",
                "evidence": f"Mobile phone confirmed present in camera workspace (Confidence: {int(best_conf * 100)}%)."
            })
        elif self._prev_phone_state == "DETECTED" and phone_status == "CLEAN":
            events.append({
                "event_id": f"evt_phone_clear_{uuid.uuid4().hex[:8]}",
                "type": "PHONE_CLEARED",
                "severity": "LOW",
                "confidence": 0.90,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "status": "RESOLVED",
                "evidence": "Mobile phone no longer visible in workspace."
            })
        self._prev_phone_state = phone_status

        # Multiple Persons State Transition
        is_multi = (person_count > 1)
        if not self._prev_multiple_persons and is_multi:
            events.append({
                "event_id": f"evt_multi_{uuid.uuid4().hex[:8]}",
                "type": "MULTIPLE_PEOPLE_DETECTED",
                "severity": "CRITICAL",
                "confidence": 0.90,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "status": "CONFIRMED",
                "evidence": f"{person_count} distinct persons confirmed in camera workspace."
            })
        elif self._prev_multiple_persons and not is_multi and person_count >= 1:
            events.append({
                "event_id": f"evt_multi_clear_{uuid.uuid4().hex[:8]}",
                "type": "MULTIPLE_PEOPLE_CLEARED",
                "severity": "LOW",
                "confidence": 0.90,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "status": "RESOLVED",
                "evidence": "Workspace returned to single verified candidate."
            })
        self._prev_multiple_persons = is_multi

        return {
            "person_count": person_count,
            "validating_person_count": validating_person_count,
            "person_status": person_status,
            "phone_status": phone_status,
            "phone_detected": phone_detected,
            "laptop_status": laptop_status,
            "laptop_detected": laptop_detected,
            "book_status": book_status,
            "book_detected": book_detected,
            "monitor_detected": len(monitors) > 0,
            "prohibited_items_count": len(prohibited_items),
            "prohibited_items_list": prohibited_items,
            "events": events
        }

    def reset(self):
        """Reset state transition tracking for a new proctoring session."""
        self._prev_phone_state = "CLEAN"
        self._prev_multiple_persons = False
        self._prev_laptop_state = "CLEAN"
        self._prev_book_state = "CLEAN"
        self._last_confirmed_seen.clear()

