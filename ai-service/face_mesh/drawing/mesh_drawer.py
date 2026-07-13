import cv2
import numpy as np
from ..utils.constants import CONNECTIONS, REGION_COLORS

class MeshDrawer:
    """
    Utility class to render 68-point face mesh landmarks on OpenCV images.
    """
    @staticmethod
    def draw(image: np.ndarray, landmarks: list, show_mesh: bool = True, show_dots: bool = True) -> np.ndarray:
        """
        Draw landmarks and connections onto the image.
        """
        canvas = image.copy()
        if not landmarks:
            return canvas

        # Convert list of landmarks to quick index lookup
        points = {}
        for lm in landmarks:
            points[lm["id"]] = (int(lm["x"]), int(lm["y"]))

        # Draw Mesh Connections
        if show_mesh:
            for region, pairs in CONNECTIONS.items():
                color = REGION_COLORS.get(region, {}).get("bgr", (0, 255, 0))
                for p1_id, p2_id in pairs:
                    if p1_id in points and p2_id in points:
                        cv2.line(canvas, points[p1_id], points[p2_id], color, 1)

        # Draw Landmark Points
        if show_dots:
            for lm_id, pt in points.items():
                # Highlight key anchor points differently if wanted, else standard green/red dots
                cv2.circle(canvas, pt, 2, (0, 255, 0), -1)

        return canvas
