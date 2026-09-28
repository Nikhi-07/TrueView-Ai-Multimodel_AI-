"""
Gaze Visualizer – TrueView AI

Draws eye gaze tracking overlays on OpenCV frames:
  - Eye landmark contours
  - Iris center dots
  - Gaze direction arrows
  - Focus status indicator

Pipeline Position:
    Gaze Estimation + Attention Analysis → **Visualization** → Encoded Response
"""

import cv2
import numpy as np
from ..utils.constants import (
    GazeDirection,
    AttentionStatus,
    VIS_COLORS,
    GAZE_ARROW_LENGTH,
    GAZE_ARROW_THICKNESS,
    IRIS_DOT_RADIUS,
    EYE_CONTOUR_THICKNESS,
    FOCUS_INDICATOR_X_OFFSET,
    FOCUS_INDICATOR_Y_OFFSET,
    FOCUS_INDICATOR_RADIUS,
)


class GazeVisualizer:
    """
    Draws eye gaze tracking visualizations on OpenCV images.
    """

    @staticmethod
    def draw(
        image: np.ndarray,
        eye_data: dict,
        iris_data: dict,
        gaze_result: dict,
        attention_result: dict,
    ) -> np.ndarray:
        """
        Draw all gaze tracking overlays on the image.

        Args:
            image: OpenCV BGR image.
            eye_data: Output from EyeLandmarkExtractor.
            iris_data: Output from IrisDetector.detect_both().
            gaze_result: Output from GazeEstimator.estimate().
            attention_result: Output from AttentionAnalyzer.analyze().

        Returns:
            Annotated image with gaze overlays.
        """
        canvas = image.copy()

        if not eye_data.get("success"):
            return canvas

        # 1. Draw eye contours
        is_closed = gaze_result.get("eyes_closed", False)
        contour_color = (0, 0, 255) if is_closed else VIS_COLORS["eye_contour"]
        GazeVisualizer._draw_eye_contour(canvas, eye_data["left_eye"], contour_color)
        GazeVisualizer._draw_eye_contour(canvas, eye_data["right_eye"], contour_color)

        # 2. Draw iris centers only when eyes are open (directional trajectory line removed)
        if not is_closed:
            GazeVisualizer._draw_iris_center(canvas, iris_data["left_iris"])
            GazeVisualizer._draw_iris_center(canvas, iris_data["right_iris"])

        # 3. Draw focus indicator
        GazeVisualizer._draw_focus_indicator(canvas, attention_result)

        # 4. Draw info overlay
        GazeVisualizer._draw_info_overlay(canvas, gaze_result, attention_result)

        return canvas

    @staticmethod
    def _draw_eye_contour(canvas: np.ndarray, eye: dict, color=None):
        """Draw the eye contour as a closed polyline."""
        contour = eye["contour"]
        pts = np.array([(int(p[0]), int(p[1])) for p in contour], dtype=np.int32)
        cv2.polylines(
            canvas, [pts], isClosed=True,
            color=color or VIS_COLORS["eye_contour"],
            thickness=EYE_CONTOUR_THICKNESS,
        )

    @staticmethod
    def _draw_iris_center(canvas: np.ndarray, iris: dict):
        """Draw iris center dot with a small ring."""
        cx = int(iris["iris_center"]["x"])
        cy = int(iris["iris_center"]["y"])

        # Outer ring
        cv2.circle(canvas, (cx, cy), IRIS_DOT_RADIUS + 2, VIS_COLORS["iris_ring"], 1)
        # Inner filled dot
        cv2.circle(canvas, (cx, cy), IRIS_DOT_RADIUS, VIS_COLORS["iris_center"], -1)

    @staticmethod
    def _draw_gaze_arrow(canvas: np.ndarray, eye_data: dict, gaze_result: dict):
        """Draw a directional arrow from the midpoint between the eyes."""
        # Midpoint between left and right eye centers
        lc = eye_data["left_eye"]["center"]
        rc = eye_data["right_eye"]["center"]
        mid_x = int((lc["x"] + rc["x"]) / 2)
        mid_y = int((lc["y"] + rc["y"]) / 2)

        direction = gaze_result["gaze_direction"]

        # Direction vectors
        dx, dy = 0, 0
        if direction == GazeDirection.LEFT:
            dx = -GAZE_ARROW_LENGTH
        elif direction == GazeDirection.RIGHT:
            dx = GAZE_ARROW_LENGTH
        elif direction == GazeDirection.UP:
            dy = -GAZE_ARROW_LENGTH
        elif direction == GazeDirection.DOWN:
            dy = GAZE_ARROW_LENGTH
        elif direction == GazeDirection.UNKNOWN:
            return
        else:
            # Center – draw a small circle instead of arrow
            cv2.circle(canvas, (mid_x, mid_y - 15), 5, VIS_COLORS["gaze_arrow"], 2)
            return

        end_x = mid_x + dx
        end_y = mid_y + dy - 15  # offset above eyes

        cv2.arrowedLine(
            canvas,
            (mid_x, mid_y - 15),
            (end_x, end_y),
            VIS_COLORS["gaze_arrow"],
            GAZE_ARROW_THICKNESS,
            tipLength=0.3,
        )

    @staticmethod
    def _draw_focus_indicator(canvas: np.ndarray, attention_result: dict):
        """Draw a colored circle in the top-right corner indicating focus status."""
        h, w = canvas.shape[:2]
        cx = w - FOCUS_INDICATOR_X_OFFSET
        cy = FOCUS_INDICATOR_Y_OFFSET

        status = attention_result.get("attention_status", AttentionStatus.LOOKING_AWAY)

        if status == AttentionStatus.FOCUSED:
            color = VIS_COLORS["focus_indicator"]
        elif status == AttentionStatus.BLINKING:
            color = (0, 200, 255)  # Orange/amber
        elif status == AttentionStatus.DISTRACTED:
            color = VIS_COLORS["distracted_indicator"]
        else:
            color = VIS_COLORS["away_indicator"]

        # Glow effect
        cv2.circle(canvas, (cx, cy), FOCUS_INDICATOR_RADIUS + 3, color, 1)
        cv2.circle(canvas, (cx, cy), FOCUS_INDICATOR_RADIUS, color, -1)

    @staticmethod
    def _draw_info_overlay(canvas: np.ndarray, gaze_result: dict, attention_result: dict):
        """Draw text overlay with gaze direction, eye status, and attention info."""
        direction = gaze_result.get("gaze_direction", "UNKNOWN")
        if gaze_result.get("eyes_closed"):
            direction = "UNKNOWN"
        direction = str(direction).upper()

        status = attention_result.get("attention_status", "N/A")
        if status == "eyes_closed":
            status_text = "EYES CLOSED"
        elif status == "blinking":
            status_text = "BLINKING"
        else:
            status_text = str(status).upper()

        score = attention_result.get("attention_score", 0)

        # Background box
        cv2.rectangle(canvas, (8, 8), (220, 72), VIS_COLORS["text_bg"], -1)
        cv2.rectangle(canvas, (8, 8), (220, 72), VIS_COLORS["eye_contour"], 1)

        # Text
        cv2.putText(canvas, f"Gaze: {direction}", (14, 28),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, VIS_COLORS["text_fg"], 1)
        cv2.putText(canvas, f"Status: {status_text}", (14, 48),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 255) if status == "eyes_closed" else VIS_COLORS["text_fg"], 1)
        cv2.putText(canvas, f"Attention: {score:.0f}%", (14, 66),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, VIS_COLORS["iris_center"], 1)
