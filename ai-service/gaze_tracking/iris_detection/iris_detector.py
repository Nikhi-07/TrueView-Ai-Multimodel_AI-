"""
Iris Detector – TrueView AI

Calculates iris/pupil center position using dark intensity thresholding within
the cropped eye region, computing relative iris position (0.0–1.0) inside the eye box.

Pipeline Position:
    Eye Landmark Extraction → **Iris Detection** → Gaze Estimation
"""

import cv2
import numpy as np


class IrisDetector:
    """
    Detects iris/pupil center and computes normalized position within the eye.
    Uses dark pupil intensity thresholding inside the cropped eye region for real-time
    eye gaze tracking even when head pose is stationary.
    """

    def detect(self, eye_data: dict, frame: np.ndarray = None) -> dict:
        """
        Detect iris center and compute relative position for a single eye.

        Args:
            eye_data: EyeData dict from EyeLandmarkExtractor.
            frame: Optional BGR OpenCV image frame for intensity pupil tracking.

        Returns:
            IrisData dict with iris_center, relative_position, and bounding_box.
        """
        contour = eye_data["contour"]
        bbox = eye_data["bounding_box"]

        iris_x = None
        iris_y = None

        if frame is not None:
            try:
                min_x = max(0, int(bbox["min_x"]))
                max_x = min(frame.shape[1], int(bbox["max_x"]))
                min_y = max(0, int(bbox["min_y"]))
                max_y = min(frame.shape[0], int(bbox["max_y"]))

                if (max_x - min_x) > 4 and (max_y - min_y) > 4:
                    eye_crop = frame[min_y:max_y, min_x:max_x]
                    gray = cv2.cvtColor(eye_crop, cv2.COLOR_BGR2GRAY)
                    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

                    min_val = float(np.min(blurred))
                    mean_val = float(np.mean(blurred))
                    threshold_val = min_val + (mean_val - min_val) * 0.35
                    _, mask = cv2.threshold(blurred, threshold_val, 255, cv2.THRESH_BINARY_INV)

                    M = cv2.moments(mask)
                    if M["m00"] > 0:
                        crop_cx = M["m10"] / M["m00"]
                        crop_cy = M["m01"] / M["m00"]
                        iris_x = min_x + crop_cx
                        iris_y = min_y + crop_cy
            except Exception:
                pass

        if iris_x is None or iris_y is None:
            contour_np = np.array(contour, dtype=np.float64)
            iris_x = float(np.mean(contour_np[:, 0]))
            iris_y = float(np.mean(contour_np[:, 1]))

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

    def detect_both(self, left_eye: dict, right_eye: dict, frame: np.ndarray = None) -> dict:
        """
        Detect iris for both eyes and compute averaged relative position.
        """
        left_iris  = self.detect(left_eye, frame)
        right_iris = self.detect(right_eye, frame)

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
        width  = bbox["width"]
        height = bbox["height"]

        if width < 1e-6 or height < 1e-6:
            return 0.5, 0.5

        rel_x = (iris_x - bbox["min_x"]) / width
        rel_y = (iris_y - bbox["min_y"]) / height

        rel_x = max(0.0, min(1.0, rel_x))
        rel_y = max(0.0, min(1.0, rel_y))

        return rel_x, rel_y
