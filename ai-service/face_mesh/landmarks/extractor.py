"""
Face Landmark Extractor using YuNet 5-point landmarks + geometric mesh generation.

Architecture:
    This module provides a clean interface `extract(frame) -> landmarks[]`.
    It currently uses YuNet's 5 key landmarks and generates a full 68-point
    face mesh via geometric interpolation from the bounding box.

    To upgrade to MediaPipe 468 landmarks:
        1. Replace the `extract()` method body.
        2. Update `face_mesh/utils/constants.py` with MediaPipe connections.
        3. No other code changes needed — the API contract remains identical.
"""

import cv2
import numpy as np
import os

class LandmarkExtractor:
    def __init__(self):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        yunet_path = os.path.join(base_dir, "..", "..", "face_detection", "models", "face_detection_yunet_2023mar.onnx")

        self.detector = cv2.FaceDetectorYN.create(
            model=yunet_path, config="",
            input_size=(320, 320),
            score_threshold=0.6, nms_threshold=0.3, top_k=5000
        )

    def extract(self, frame: np.ndarray) -> dict:
        """
        Detect faces and generate 68-point landmark mesh.
        Returns dict with landmarks list, face_box, confidence.
        """
        h, w = frame.shape[:2]
        self.detector.setInputSize((w, h))
        _, faces = self.detector.detect(frame)

        if faces is None or len(faces) == 0:
            return {"face_detected": False, "error": "no_face", "landmarks": [], "landmark_count": 0}

        if len(faces) > 1:
            return {"face_detected": False, "error": "multiple_faces", "landmarks": [], "landmark_count": 0}

        face = faces[0]
        fx, fy, fw, fh = int(face[0]), int(face[1]), int(face[2]), int(face[3])
        confidence = float(face[-1])

        # YuNet 5 key landmarks
        right_eye = (float(face[4]), float(face[5]))
        left_eye  = (float(face[6]), float(face[7]))
        nose_tip  = (float(face[8]), float(face[9]))
        right_mouth = (float(face[10]), float(face[11]))
        left_mouth  = (float(face[12]), float(face[13]))

        # Generate 68-point mesh from these anchors + bounding box
        landmarks = self._generate_68_landmarks(
            fx, fy, fw, fh,
            right_eye, left_eye, nose_tip, right_mouth, left_mouth,
            frame=frame
        )

        return {
            "face_detected": True,
            "confidence": confidence,
            "face_box": {"x": fx, "y": fy, "width": fw, "height": fh},
            "landmarks": landmarks,
            "landmark_count": len(landmarks),
            "image_width": w,
            "image_height": h
        }

    @staticmethod
    def _measure_eye_ear_from_frame(frame, eye_center, fw, fh):
        """
        Calculates Eye Aspect Ratio (EAR) directly from camera frame eye crop.
        Returns EAR value between 0.08 (fully closed) and 0.38 (wide open).
        """
        if frame is None or frame.size == 0:
            return 0.30

        h_img, w_img = frame.shape[:2]
        cx, cy = int(eye_center[0]), int(eye_center[1])
        w_box = max(10, int(fw * 0.16))
        h_box = max(8, int(fh * 0.12))

        x1 = max(0, cx - w_box // 2)
        x2 = min(w_img, cx + w_box // 2)
        y1 = max(0, cy - h_box // 2)
        y2 = min(h_img, cy + h_box // 2)

        if (x2 - x1) < 6 or (y2 - y1) < 6:
            return 0.30

        crop = frame[y1:y2, x1:x2]
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)

        min_val = float(np.min(blurred))
        mean_val = float(np.mean(blurred))
        contrast = mean_val - min_val

        # Low contrast means closed eyelid (no dark pupil exposed)
        thresh = min_val + contrast * 0.35
        dark_mask = (blurred <= thresh).astype(np.uint8)

        margin = max(1, int((x2 - x1) * 0.20))
        center_mask = dark_mask[:, margin:-(margin)] if margin > 0 else dark_mask

        vertical_spans = []
        for c in range(center_mask.shape[1]):
            rows = np.where(center_mask[:, c] > 0)[0]
            if len(rows) > 0:
                span = rows[-1] - rows[0] + 1
                vertical_spans.append(span)

        if vertical_spans and contrast >= 25:
            vert_open = float(np.median(vertical_spans))
            eye_w_px = float(x2 - x1)
            ear = (vert_open / max(eye_w_px * 0.75, 1.0)) * 1.25
            return float(min(0.38, max(0.08, ear)))
        else:
            return 0.09

    def _generate_68_landmarks(self, fx, fy, fw, fh, re, le, nt, rm, lm, frame=None):
        """
        Generate 68 iBUG-compatible landmarks from 5 anchor points, face bounding box,
        and actual eye aperture from the frame.
        """
        landmarks = []

        # Helper
        def lerp(p1, p2, t):
            return (p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t)

        def add(idx, x, y, z=0.0):
            landmarks.append({"id": idx, "x": round(x, 2), "y": round(y, 2), "z": round(z, 2), "visibility": 1.0})

        # Face geometry
        cx = fx + fw / 2
        cy = fy + fh / 2
        jaw_bottom = fy + fh
        jaw_left = fx
        jaw_right = fx + fw

        # --- Jawline (0-16): 17 points along the jaw ---
        jaw_start = (jaw_left, fy + fh * 0.25)
        jaw_mid_left = (jaw_left + fw * 0.05, jaw_bottom - fh * 0.05)
        jaw_center = (cx, jaw_bottom)
        jaw_mid_right = (jaw_right - fw * 0.05, jaw_bottom - fh * 0.05)
        jaw_end = (jaw_right, fy + fh * 0.25)

        jaw_points = []
        # Left side of jaw (0-4)
        for i in range(5):
            t = i / 4.0
            p = lerp(jaw_start, jaw_mid_left, t)
            jaw_points.append(p)
        # Bottom of jaw (5-11)
        for i in range(7):
            t = i / 6.0
            p = lerp(jaw_mid_left, jaw_mid_right, t)
            jaw_points.append(p)
        # Right side of jaw (12-16)
        for i in range(5):
            t = i / 4.0
            p = lerp(jaw_mid_right, jaw_end, t)
            jaw_points.append(p)

        for i, p in enumerate(jaw_points):
            add(i, p[0], p[1])

        # --- Right Eyebrow (17-21): 5 points ---
        eb_offset_y = -fh * 0.08
        for i in range(5):
            t = i / 4.0
            p = lerp((re[0] - fw * 0.08, re[1] + eb_offset_y), (re[0] + fw * 0.08, re[1] + eb_offset_y), t)
            add(17 + i, p[0], p[1])

        # --- Left Eyebrow (22-26): 5 points ---
        for i in range(5):
            t = i / 4.0
            p = lerp((le[0] - fw * 0.08, le[1] + eb_offset_y), (le[0] + fw * 0.08, le[1] + eb_offset_y), t)
            add(22 + i, p[0], p[1])

        # --- Nose Bridge (27-30): 4 points ---
        eye_center = lerp(re, le, 0.5)
        for i in range(4):
            t = i / 3.0
            p = lerp(eye_center, nt, t)
            add(27 + i, p[0], p[1])

        # --- Nose Tip (31-35): 5 points ---
        nose_width = fw * 0.12
        for i in range(5):
            t = i / 4.0
            x = nt[0] - nose_width + (2 * nose_width * t)
            y = nt[1] + fh * 0.02
            add(31 + i, x, y)

        # --- Measure actual eye openness (EAR) from camera frame ---
        eye_w = fw * 0.06
        r_ear = self._measure_eye_ear_from_frame(frame, re, fw, fh)
        l_ear = self._measure_eye_ear_from_frame(frame, le, fw, fh)
        # Scale vertical eye height by measured EAR (EAR = sqrt(3)/2 * eye_h/eye_w)
        r_eye_h = max(0.5, 1.1547 * eye_w * r_ear)
        l_eye_h = max(0.5, 1.1547 * eye_w * l_ear)

        # --- Right Eye (36-41): 6 points ---
        for i in range(6):
            angle = (i / 6.0) * 2 * np.pi
            x = re[0] + eye_w * np.cos(angle)
            y = re[1] + r_eye_h * np.sin(angle)
            add(36 + i, x, y)

        # --- Left Eye (42-47): 6 points ---
        for i in range(6):
            angle = (i / 6.0) * 2 * np.pi
            x = le[0] + eye_w * np.cos(angle)
            y = le[1] + l_eye_h * np.sin(angle)
            add(42 + i, x, y)

        # --- Outer Lip (48-59): 12 points ---
        mouth_center = lerp(rm, lm, 0.5)
        mouth_w = abs(lm[0] - rm[0]) / 2 * 1.1
        mouth_h = fh * 0.04
        for i in range(12):
            angle = (i / 12.0) * 2 * np.pi
            x = mouth_center[0] + mouth_w * np.cos(angle)
            y = mouth_center[1] + mouth_h * np.sin(angle)
            add(48 + i, x, y)

        # --- Inner Lip (60-67): 8 points ---
        inner_w = mouth_w * 0.6
        inner_h = mouth_h * 0.5
        for i in range(8):
            angle = (i / 8.0) * 2 * np.pi
            x = mouth_center[0] + inner_w * np.cos(angle)
            y = mouth_center[1] + inner_h * np.sin(angle)
            add(60 + i, x, y)

        return landmarks
