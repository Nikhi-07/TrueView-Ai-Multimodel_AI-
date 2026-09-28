"""
Eye Landmark Extractor – TrueView AI

Extracts left and right eye landmark contours and computes eye bounding
boxes from the 68-point landmark array produced by Phase 7's LandmarkExtractor.

Pipeline Position:
    Face Detection → Face Mesh (68 pts) → **Eye Landmark Extraction** → Iris Detection

Output:
    Structured EyeData dicts for each eye containing:
    - contour points [(x, y), ...]
    - bounding rectangle {min_x, max_x, min_y, max_y, width, height}
    - center point (cx, cy)
"""

import numpy as np
from ..utils.constants import (
    RIGHT_EYE_INDICES,
    LEFT_EYE_INDICES,
    MEDIAPIPE_RIGHT_EYE_INDICES,
    MEDIAPIPE_LEFT_EYE_INDICES,
)


class EyeLandmarkExtractor:
    """
    Extracts structured eye landmark data from either a 68-point face mesh
    or a 468/478-point MediaPipe face mesh, computing EAR separately for both eyes.
    """

    def extract(self, landmarks: list) -> dict:
        """
        Extract left and right eye data from landmark list.

        Args:
            landmarks: List of landmark dicts [{"id": int, "x": float, "y": float}, ...]
                       or [{"x": float, "y": float}, ...] from MediaPipe.

        Returns:
            dict with "left_eye", "right_eye", "left_ear", "right_ear", "average_ear".
        """
        if not landmarks or len(landmarks) < 48:
            return {"success": False, "error": "insufficient_landmarks"}

        # Build fast lookup: idx -> (x, y)
        point_map = {}
        for idx, lm in enumerate(landmarks):
            point_id = lm.get("id", idx) if isinstance(lm, dict) else idx
            x = float(lm.get("x", 0.0)) if isinstance(lm, dict) else float(lm[0])
            y = float(lm.get("y", 0.0)) if isinstance(lm, dict) else float(lm[1])
            point_map[point_id] = (x, y)
            if point_id != idx:
                point_map[idx] = (x, y)

        # Select landmark scheme based on count
        if len(landmarks) >= 468:
            right_indices = MEDIAPIPE_RIGHT_EYE_INDICES
            left_indices  = MEDIAPIPE_LEFT_EYE_INDICES
        else:
            right_indices = RIGHT_EYE_INDICES
            left_indices  = LEFT_EYE_INDICES

        # Extract eye contours
        right_eye = self._extract_eye(point_map, right_indices, "right")
        left_eye  = self._extract_eye(point_map, left_indices, "left")

        if right_eye is None or left_eye is None:
            return {"success": False, "error": "eye_landmarks_missing"}

        left_ear = float(left_eye["ear"])
        right_ear = float(right_eye["ear"])
        average_ear = round(float((left_ear + right_ear) / 2.0), 4)

        return {
            "success": True,
            "right_eye": right_eye,
            "left_eye": left_eye,
            "left_ear": left_ear,
            "right_ear": right_ear,
            "average_ear": average_ear,
        }

    def _extract_eye(self, point_map: dict, indices: list, label: str) -> dict | None:
        """
        Extract a single eye's contour, bounding box, center, and Eye Aspect Ratio (EAR).

        Args:
            point_map: Landmark id → (x, y) lookup.
            indices: List of landmark indices for this eye.
            label: "left" or "right".

        Returns:
            EyeData dict or None if landmarks are missing.
        """
        contour = []
        for idx in indices:
            if idx not in point_map:
                return None
            contour.append(point_map[idx])

        contour_np = np.array(contour, dtype=np.float64)

        # Bounding rectangle
        min_x = float(np.min(contour_np[:, 0]))
        max_x = float(np.max(contour_np[:, 0]))
        min_y = float(np.min(contour_np[:, 1]))
        max_y = float(np.max(contour_np[:, 1]))
        width  = max_x - min_x
        height = max_y - min_y

        # Centroid (geometric center of the contour)
        cx = float(np.mean(contour_np[:, 0]))
        cy = float(np.mean(contour_np[:, 1]))

        # Eye Aspect Ratio (EAR) computation from 6 landmark points:
        # p0: outer/inner corner, p3: opposite corner
        # p1, p5: vertical pair 1; p2, p4: vertical pair 2
        p0, p1, p2, p3, p4, p5 = contour_np[0], contour_np[1], contour_np[2], contour_np[3], contour_np[4], contour_np[5]
        v1 = np.linalg.norm(p1 - p5)
        v2 = np.linalg.norm(p2 - p4)
        h = np.linalg.norm(p0 - p3)
        ear = float((v1 + v2) / (2.0 * max(h, 1e-5)))

        return {
            "label": label,
            "contour": contour,
            "ear": round(ear, 4),
            "bounding_box": {
                "min_x": round(min_x, 2),
                "max_x": round(max_x, 2),
                "min_y": round(min_y, 2),
                "max_y": round(max_y, 2),
                "width": round(width, 2),
                "height": round(height, 2),
            },
            "center": {
                "x": round(cx, 2),
                "y": round(cy, 2),
            },
        }
