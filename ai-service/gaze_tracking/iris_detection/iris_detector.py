"""
Iris Detector – TrueView AI

Calculates iris center position from eye contour data, computes the
relative iris position within the eye bounding box (normalized 0.0–1.0),
and provides normalized coordinates for gaze estimation.

Pipeline Position:
    Eye Landmark Extraction → **Iris Detection** → Gaze Estimation

Strategy:
    With 68-point iBUG landmarks, the eye contour (6 points per eye) forms
    an ellipse. The iris center is approximated as the centroid of these
    contour points. The relative position of this centroid within the eye's
    bounding box encodes gaze direction:
        - Centered centroid → looking straight
        - Left-shifted → looking left
        - Right-shifted → looking right
        - Top-shifted → looking up
        - Bottom-shifted → looking down

    When upgrading to MediaPipe 468+10 landmarks, replace centroid
    calculation with the true iris landmark positions (468-477).
"""

import numpy as np


class IrisDetector:
    """
    Detects iris center and computes normalized position within the eye.
    """

    def detect(self, eye_data: dict) -> dict:
        """
        Detect iris center and compute relative position for a single eye.

        Args:
            eye_data: EyeData dict from EyeLandmarkExtractor containing
                      contour, bounding_box, and center.

        Returns:
            IrisData dict with iris_center, relative_position, and raw coordinates.
        """
        contour = eye_data["contour"]
        bbox = eye_data["bounding_box"]

        # Compute iris center as the centroid of eye contour
        contour_np = np.array(contour, dtype=np.float64)
        iris_x = float(np.mean(contour_np[:, 0]))
        iris_y = float(np.mean(contour_np[:, 1]))

        # Compute relative position within the bounding box (0.0 to 1.0)
        rel_x, rel_y = self._normalize_position(iris_x, iris_y, bbox)

        return {
            "iris_center": {
                "x": round(iris_x, 2),
                "y": round(iris_y, 2),
            },
            "relative_position": {
                "x": round(rel_x, 4),
                "y": round(rel_y, 4),
            },
            "bounding_box": bbox,
        }

    def detect_both(self, left_eye: dict, right_eye: dict) -> dict:
        """
        Detect iris for both eyes and compute averaged relative position.

        Args:
            left_eye: Left eye data from EyeLandmarkExtractor.
            right_eye: Right eye data from EyeLandmarkExtractor.

        Returns:
            Combined iris data with per-eye and averaged positions.
        """
        left_iris  = self.detect(left_eye)
        right_iris = self.detect(right_eye)

        # Average the relative positions for a stable gaze signal
        avg_rel_x = (left_iris["relative_position"]["x"] + right_iris["relative_position"]["x"]) / 2.0
        avg_rel_y = (left_iris["relative_position"]["y"] + right_iris["relative_position"]["y"]) / 2.0

        return {
            "left_iris": left_iris,
            "right_iris": right_iris,
            "averaged_position": {
                "x": round(avg_rel_x, 4),
                "y": round(avg_rel_y, 4),
            },
        }

    @staticmethod
    def _normalize_position(iris_x: float, iris_y: float, bbox: dict) -> tuple:
        """
        Normalize iris position to [0.0, 1.0] within the eye bounding box.

        Returns (rel_x, rel_y) where:
            0.0 = far left / top of eye
            0.5 = center of eye
            1.0 = far right / bottom of eye
        """
        width  = bbox["width"]
        height = bbox["height"]

        # Guard against zero-size bounding boxes
        if width < 1e-6 or height < 1e-6:
            return 0.5, 0.5

        rel_x = (iris_x - bbox["min_x"]) / width
        rel_y = (iris_y - bbox["min_y"]) / height

        # Clamp to [0, 1]
        rel_x = max(0.0, min(1.0, rel_x))
        rel_y = max(0.0, min(1.0, rel_y))

        return rel_x, rel_y
