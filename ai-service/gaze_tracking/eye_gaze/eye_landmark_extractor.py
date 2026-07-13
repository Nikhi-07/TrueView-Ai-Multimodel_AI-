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
)


class EyeLandmarkExtractor:
    """
    Extracts structured eye landmark data from the full 68-point face mesh.
    """

    def extract(self, landmarks: list) -> dict:
        """
        Extract left and right eye data from the 68-point landmark list.

        Args:
            landmarks: List of landmark dicts [{"id": int, "x": float, "y": float, ...}, ...]

        Returns:
            dict with "left_eye" and "right_eye" EyeData, or error info.
        """
        if not landmarks or len(landmarks) < 48:
            return {"success": False, "error": "insufficient_landmarks"}

        # Build fast lookup: id → (x, y)
        point_map = {}
        for lm in landmarks:
            point_map[lm["id"]] = (float(lm["x"]), float(lm["y"]))

        # Extract eye contours
        right_eye = self._extract_eye(point_map, RIGHT_EYE_INDICES, "right")
        left_eye  = self._extract_eye(point_map, LEFT_EYE_INDICES, "left")

        if right_eye is None or left_eye is None:
            return {"success": False, "error": "eye_landmarks_missing"}

        return {
            "success": True,
            "right_eye": right_eye,
            "left_eye": left_eye,
        }

    def _extract_eye(self, point_map: dict, indices: list, label: str) -> dict | None:
        """
        Extract a single eye's contour, bounding box, and center.

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

        return {
            "label": label,
            "contour": contour,
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
