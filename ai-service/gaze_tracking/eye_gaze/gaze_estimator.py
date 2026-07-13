"""
Gaze Estimator – TrueView AI

Maps normalized iris positions to human-readable gaze directions
(LEFT, RIGHT, UP, DOWN, CENTER) with confidence scores.

Pipeline Position:
    Iris Detection → **Gaze Estimation** → Attention Analysis

Algorithm:
    1. Takes averaged relative iris position from both eyes (0.0–1.0 on each axis).
    2. Compares against configurable thresholds to determine primary direction.
    3. Handles compound directions (e.g., UP-LEFT) by selecting dominant axis.
    4. Computes confidence based on how far the iris is from the center.
"""

import math
from ..utils.constants import (
    GazeDirection,
    GAZE_HORIZONTAL_LEFT_THRESHOLD,
    GAZE_HORIZONTAL_RIGHT_THRESHOLD,
    GAZE_VERTICAL_UP_THRESHOLD,
    GAZE_VERTICAL_DOWN_THRESHOLD,
    GAZE_CENTER_CONFIDENCE,
    GAZE_DIRECTION_CONFIDENCE,
    GAZE_EXTREME_CONFIDENCE,
)


class GazeEstimator:
    """
    Estimates gaze direction from normalized iris positions.
    """

    def estimate(self, averaged_position: dict) -> dict:
        """
        Estimate gaze direction from averaged iris relative position.

        Args:
            averaged_position: {"x": float, "y": float} where each is 0.0–1.0.
                x: 0.0 = far left of eye, 1.0 = far right
                y: 0.0 = top of eye, 1.0 = bottom

        Returns:
            dict with gaze_direction, confidence, horizontal_offset, vertical_offset.
        """
        rel_x = averaged_position["x"]
        rel_y = averaged_position["y"]

        # Determine horizontal component
        h_direction = None
        if rel_x < GAZE_HORIZONTAL_LEFT_THRESHOLD:
            h_direction = GazeDirection.LEFT
        elif rel_x > GAZE_HORIZONTAL_RIGHT_THRESHOLD:
            h_direction = GazeDirection.RIGHT

        # Determine vertical component
        v_direction = None
        if rel_y < GAZE_VERTICAL_UP_THRESHOLD:
            v_direction = GazeDirection.UP
        elif rel_y > GAZE_VERTICAL_DOWN_THRESHOLD:
            v_direction = GazeDirection.DOWN

        # Calculate offsets from center (0.5, 0.5)
        h_offset = abs(rel_x - 0.5)
        v_offset = abs(rel_y - 0.5)

        # Determine primary direction
        if h_direction is None and v_direction is None:
            # Looking at center / screen
            direction = GazeDirection.CENTER
            confidence = self._compute_center_confidence(h_offset, v_offset)
        elif h_direction is not None and v_direction is not None:
            # Compound direction – pick the dominant axis
            if h_offset >= v_offset:
                direction = h_direction
            else:
                direction = v_direction
            confidence = self._compute_direction_confidence(max(h_offset, v_offset))
        elif h_direction is not None:
            direction = h_direction
            confidence = self._compute_direction_confidence(h_offset)
        else:
            direction = v_direction
            confidence = self._compute_direction_confidence(v_offset)

        return {
            "gaze_direction": direction,
            "confidence": round(confidence, 4),
            "horizontal_offset": round(rel_x - 0.5, 4),
            "vertical_offset": round(rel_y - 0.5, 4),
            "is_center": direction == GazeDirection.CENTER,
        }

    @staticmethod
    def _compute_center_confidence(h_offset: float, v_offset: float) -> float:
        """
        Higher confidence when iris is closer to center.
        Uses inverse distance: closer to (0.5, 0.5) → higher confidence.
        """
        distance = math.sqrt(h_offset ** 2 + v_offset ** 2)
        # Max distance from center to corner is ~0.5 * sqrt(2) ≈ 0.707
        # Normalize so that center = GAZE_CENTER_CONFIDENCE, edge ≈ 0.5
        confidence = GAZE_CENTER_CONFIDENCE * (1.0 - distance / 0.707)
        return max(0.5, min(GAZE_CENTER_CONFIDENCE, confidence))

    @staticmethod
    def _compute_direction_confidence(offset: float) -> float:
        """
        Higher confidence when iris is further from center (more definitive direction).
        """
        # offset ranges from ~0.15 (threshold) to ~0.5 (extreme)
        # Map to confidence range [DIRECTION, EXTREME]
        if offset > 0.35:
            return GAZE_EXTREME_CONFIDENCE
        # Linearly interpolate
        t = (offset - 0.15) / 0.20  # normalize to [0, 1]
        t = max(0.0, min(1.0, t))
        return GAZE_DIRECTION_CONFIDENCE + t * (GAZE_EXTREME_CONFIDENCE - GAZE_DIRECTION_CONFIDENCE)
