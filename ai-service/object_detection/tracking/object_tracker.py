"""
Object Tracker & Temporal Confirmation Engine – TrueView AI

Performs spatial association tracking (IoU + Centroid proximity) across frames,
tracks appearance duration, movement displacement, and validates temporal
confirmation criteria to eliminate single-frame glitches and false positives.
"""

import time
import math
from ..utils.constants import (
    PHONE_CONFIRMATION_FRAMES,
    PHONE_CONFIRMATION_DURATION_MS,
    PHONE_RAW_MIN_CONF,
    PHONE_CONFIRMED_MIN_CONF,
    REMOTE_ASPECT_RATIO_THRESHOLD,
    PERSON_CONFIRMATION_FRAMES,
    PERSON_CONFIRMATION_DURATION_MS,
    PERSON_MIN_SEPARATION_PX,
    CONFIDENCE_THRESHOLDS,
    TRACK_MAX_AGE_SECONDS,
    TRACK_MATCH_IOU_THRESH,
    TRACK_MATCH_DIST_THRESH,
    TAXONOMY_MAP,
)


class ObjectTracker:
    """
    Maintains persistent object identity across camera frames with temporal validation
    and proctoring taxonomy classification.
    """

    def __init__(self):
        self.next_track_id = 1
        self.tracks = {}
        self.primary_candidate_id = None

    def update_tracks(self, detections: list) -> list:
        """
        Associate detections with existing tracks and validate security confirmation.

        Args:
            detections: List of detections from YoloDetector

        Returns:
            list of enriched detections with track_id, category, event_type,
            duration_ms, and confirmed status.
        """
        now = time.time()
        updated_detections = []

        # 1. Filter and prepare incoming detection representations
        det_items = []
        for d in detections:
            x1, y1, x2, y2 = d["box"]
            cx = (x1 + x2) / 2.0
            cy = (y1 + y2) / 2.0
            bw = max(1, x2 - x1)
            bh = max(1, y2 - y1)
            aspect_ratio = d.get("aspect_ratio", round(max(bw, bh) / float(min(bw, bh)), 2))
            label = d["label"]
            conf = d["confidence"]

            # Filter out extreme low-confidence noise per-class
            if label == "person" and conf < CONFIDENCE_THRESHOLDS.get("person_primary", 0.40):
                continue
            if label == "phone" and conf < PHONE_RAW_MIN_CONF:
                continue

            det_items.append({
                "raw": d,
                "box": [x1, y1, x2, y2],
                "centroid": (cx, cy),
                "label": label,
                "confidence": conf,
                "aspect_ratio": aspect_ratio,
            })

        matched_track_ids = set()
        matched_det_indices = set()

        # 2. Match incoming detections to active tracks (IoU prioritized, centroid distance fallback)
        for d_idx, item in enumerate(det_items):
            best_tid = None
            best_score = -1.0

            for tid, tr in self.tracks.items():
                if tid in matched_track_ids:
                    continue

                iou = self._compute_iou(item["box"], tr["box"])
                dist = math.hypot(item["centroid"][0] - tr["centroid"][0],
                                  item["centroid"][1] - tr["centroid"][1])

                is_match = False
                score = 0.0

                if iou >= TRACK_MATCH_IOU_THRESH:
                    score = iou
                    is_match = True
                elif dist <= TRACK_MATCH_DIST_THRESH and self._is_compatible(item["label"], tr["label"]):
                    score = 1.0 - (dist / TRACK_MATCH_DIST_THRESH)
                    is_match = True

                if is_match and score > best_score:
                    best_score = score
                    best_tid = tid

            if best_tid is not None:
                matched_track_ids.add(best_tid)
                matched_det_indices.add(d_idx)

                # Update existing track
                tr = self.tracks[best_tid]
                cx, cy = item["centroid"]
                prev_cx, prev_cy = tr["centroid"]
                displacement = math.hypot(cx - prev_cx, cy - prev_cy)

                tr["box"] = item["box"]
                tr["centroid"] = (cx, cy)
                tr["total_movement"] += displacement
                tr["last_seen"] = now
                tr["frames_seen"] += 1
                tr["consecutive_misses"] = 0
                tr["confidence"] = item["confidence"]
                tr["aspect_ratio"] = item["aspect_ratio"]

                # Accumulate label votes
                label_votes = tr["label_votes"]
                label_votes[item["label"]] = label_votes.get(item["label"], 0) + 1

                # If TV remote signature detected (elongated shape or remote votes), resolve to remote
                if item["aspect_ratio"] >= REMOTE_ASPECT_RATIO_THRESHOLD and (item["label"] in ["phone", "remote"]):
                    tr["label"] = "remote"
                elif label_votes.get("remote", 0) >= label_votes.get("phone", 0) and label_votes.get("remote", 0) > 0:
                    tr["label"] = "remote"
                else:
                    tr["label"] = max(label_votes, key=label_votes.get)

        # 3. Create new tracks for unmatched detections
        for d_idx, item in enumerate(det_items):
            if d_idx not in matched_det_indices:
                tid = self.next_track_id
                self.next_track_id += 1

                initial_label = item["label"]
                # Remote false positive pre-filter for elongated objects
                if item["aspect_ratio"] >= REMOTE_ASPECT_RATIO_THRESHOLD and initial_label == "phone" and item["confidence"] < 0.75:
                    initial_label = "remote"

                self.tracks[tid] = {
                    "track_id": tid,
                    "label": initial_label,
                    "raw_label": item["label"],
                    "box": item["box"],
                    "centroid": item["centroid"],
                    "aspect_ratio": item["aspect_ratio"],
                    "first_seen": now,
                    "last_seen": now,
                    "frames_seen": 1,
                    "consecutive_misses": 0,
                    "confidence": item["confidence"],
                    "total_movement": 0.0,
                    "label_votes": {item["label"]: 1},
                    "confirmed": False,
                }
                matched_track_ids.add(tid)

        # 4. Identify Primary Candidate vs Secondary Persons
        active_person_tracks = [
            tr for tr in self.tracks.values()
            if tr["track_id"] in matched_track_ids and tr["label"] == "person"
        ]

        if active_person_tracks:
            # Sort person tracks by first seen (earliest first), then by area
            active_person_tracks.sort(
                key=lambda t: (
                    t["first_seen"],
                    -((t["box"][2] - t["box"][0]) * (t["box"][3] - t["box"][1]))
                )
            )
            self.primary_candidate_id = active_person_tracks[0]["track_id"]
        else:
            self.primary_candidate_id = None

        # 5. Handle confirmation logic for all active tracks in this frame
        for tr in list(self.tracks.values()):
            if tr["track_id"] not in matched_track_ids:
                tr["consecutive_misses"] += 1
                continue

            duration_ms = (now - tr["first_seen"]) * 1000.0
            label = tr["label"]
            confirmed = False

            if label == "phone":
                # Strict phone confirmation:
                # 1. Observed for required frames and duration
                # 2. Confidence satisfies confirmed threshold
                # 3. Geometric aspect ratio does not look like a TV remote
                # 4. No competing remote classifications
                is_temporal_valid = (
                    tr["frames_seen"] >= PHONE_CONFIRMATION_FRAMES and
                    duration_ms >= PHONE_CONFIRMATION_DURATION_MS
                )
                is_conf_valid = tr["confidence"] >= PHONE_CONFIRMED_MIN_CONF
                is_aspect_valid = tr["aspect_ratio"] < REMOTE_ASPECT_RATIO_THRESHOLD

                if is_temporal_valid and is_conf_valid and is_aspect_valid:
                    confirmed = True

            elif label == "person":
                is_primary = (tr["track_id"] == self.primary_candidate_id)
                if is_primary:
                    # Primary candidate: confirmed after at least 2 frames
                    confirmed = tr["frames_seen"] >= 2
                else:
                    # Secondary person (Multiple People detection):
                    # Must be separated from primary candidate centroid to avoid double-bounding a single person
                    primary_track = self.tracks.get(self.primary_candidate_id)
                    is_separated = True
                    if primary_track:
                        dist = math.hypot(
                            tr["centroid"][0] - primary_track["centroid"][0],
                            tr["centroid"][1] - primary_track["centroid"][1]
                        )
                        if dist < PERSON_MIN_SEPARATION_PX:
                            is_separated = False

                    is_conf_valid = tr["confidence"] >= CONFIDENCE_THRESHOLDS.get("person_secondary", 0.50)
                    is_temporal_valid = (
                        tr["frames_seen"] >= PERSON_CONFIRMATION_FRAMES and
                        duration_ms >= PERSON_CONFIRMATION_DURATION_MS
                    )

                    if is_separated and is_conf_valid and is_temporal_valid:
                        confirmed = True

            elif label in ["laptop", "monitor"]:
                confirmed = (
                    tr["frames_seen"] >= 4 and
                    duration_ms >= 300.0 and
                    tr["confidence"] >= CONFIDENCE_THRESHOLDS.get(f"{label}_confirmed", 0.45)
                )

            elif label == "book":
                confirmed = (
                    tr["frames_seen"] >= 4 and
                    duration_ms >= 250.0 and
                    tr["confidence"] >= CONFIDENCE_THRESHOLDS.get("book_confirmed", 0.40)
                )

            elif label in ["remote", "keyboard", "mouse"]:
                # Non-prohibited peripherals
                confirmed = tr["frames_seen"] >= 3

            tr["confirmed"] = confirmed

            # Taxonomy and event type mapping
            tax_info = TAXONOMY_MAP.get(label, {
                "category": "OTHER",
                "type": label.upper(),
                "is_prohibited": False,
                "description": label
            })

            event_type = tax_info["type"]
            if label == "person":
                is_primary = (tr["track_id"] == self.primary_candidate_id)
                event_type = "CANDIDATE" if is_primary else "MULTIPLE_PEOPLE"

            # Build enriched normalized output
            updated_detections.append({
                "track_id": tr["track_id"],
                "label": label,
                "raw_label": tr.get("raw_label", label),
                "category": tax_info["category"],
                "type": event_type,
                "confidence": tr["confidence"],
                "status": "CONFIRMED" if tr["confirmed"] else "VALIDATING",
                "confirmed": tr["confirmed"],
                "is_prohibited": tax_info["is_prohibited"],
                "tracking_duration_ms": int(duration_ms),
                "duration_seconds": round(duration_ms / 1000.0, 1),
                "frames_seen": tr["frames_seen"],
                "first_seen": tr["first_seen"],
                "last_seen": tr["last_seen"],
                "aspect_ratio": tr["aspect_ratio"],
                "total_movement_px": round(tr["total_movement"], 1),
                "box": tr["box"],
            })

        # 6. Clean up expired tracks
        expired = [tid for tid, tr in self.tracks.items() if (now - tr["last_seen"]) > TRACK_MAX_AGE_SECONDS]
        for tid in expired:
            del self.tracks[tid]

        return updated_detections

    def reset(self):
        """Reset tracking state for a new session."""
        self.tracks.clear()
        self.next_track_id = 1
        self.primary_candidate_id = None

    @staticmethod
    def _is_compatible(labelA: str, labelB: str) -> bool:
        if labelA == labelB:
            return True
        if {labelA, labelB} == {"phone", "remote"}:
            return True
        return False

    @staticmethod
    def _compute_iou(boxA, boxB) -> float:
        xA = max(boxA[0], boxB[0])
        yA = max(boxA[1], boxB[1])
        xB = min(boxA[2], boxB[2])
        yB = min(boxA[3], boxB[3])

        interArea = max(0, xB - xA) * max(0, yB - yA)
        boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
        boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])

        denom = float(boxAArea + boxBArea - interArea)
        return (interArea / denom) if denom > 0 else 0.0

