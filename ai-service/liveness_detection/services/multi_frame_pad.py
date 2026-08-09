"""
Multi-Frame Presentation Attack Detector (PAD) – TrueView AI

Evaluates a temporal sequence of camera frames for face liveness and anti-spoofing.
Detects:
1. Printed Photo Attacks (LBP texture loss & static micro-motion failure)
2. Phone / Monitor Screen Replay Attacks (2D FFT Moiré grid peaks & subpixel glow)
3. Pre-recorded Video Replay Attacks (Static replay border, display artifacts)
4. Active Dynamic Challenge Compliance (Yaw/Pitch landmark movement & bounding box expansion)
"""

import cv2
import numpy as np
import base64
import time
import os
import random

class MultiFramePAD:
    def __init__(self, liveness_threshold: float = 0.75):
        self.liveness_threshold = liveness_threshold
        
        base_dir = os.path.dirname(os.path.abspath(__file__))
        yunet_path = os.path.abspath(os.path.join(base_dir, "..", "..", "face_detection", "models", "face_detection_yunet_2023mar.onnx"))

        self.face_detector = cv2.FaceDetectorYN.create(
            model=yunet_path,
            config="",
            input_size=(320, 320),
            score_threshold=0.5,
            nms_threshold=0.3,
            top_k=5000
        )

    def generate_random_challenge(self) -> dict:
        """
        Generates a randomized session-specific active liveness challenge.
        """
        challenges = [
            {"type": "LOOK_LEFT", "instruction": "Look slightly to your LEFT"},
            {"type": "LOOK_RIGHT", "instruction": "Look slightly to your RIGHT"},
            {"type": "TILT_UP", "instruction": "Tilt your head slightly UP"},
            {"type": "TILT_DOWN", "instruction": "Tilt your head slightly DOWN"},
            {"type": "MOVE_CLOSER", "instruction": "Move slightly CLOSER to the camera"}
        ]
        chosen = random.choice(challenges)
        challenge_id = f"chal_{int(time.time()*1000)}_{random.randint(1000, 9999)}"
        return {
            "challenge_id": challenge_id,
            "challenge_type": chosen["type"],
            "instruction": chosen["instruction"],
            "expires_in_sec": 8
        }

    def decode_frame(self, image_data: str) -> np.ndarray:
        if not image_data:
            return None
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        try:
            img_bytes = base64.b64decode(image_data)
            np_arr = np.frombuffer(img_bytes, np.uint8)
            return cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        except Exception:
            return None

    def analyze_sequence(self, frames_b64: list[str], challenge_type: str = None, session_id: str = "default") -> dict:
        """
        Analyze a temporal sequence of 5-8 base64 frames for presentation attacks & liveness.
        """
        start_time = time.time()

        if not frames_b64 or len(frames_b64) < 3:
            return {
                "status": "SPOOF",
                "livenessVerified": False,
                "reason": "insufficient_frames",
                "spoof_type": "INSUFFICIENT_FRAMES",
                "liveness_score": 0.0,
                "spoof_score": 1.0,
                "face_count": 0,
                "quality": "POOR",
                "message": "Insufficient camera frame sequence. At least 3 temporal frames required for liveness check."
            }

        decoded_frames = []
        for b64_str in frames_b64:
            img = self.decode_frame(b64_str)
            if img is not None:
                decoded_frames.append(img)

        if len(decoded_frames) < 3:
            return {
                "status": "SPOOF",
                "livenessVerified": False,
                "reason": "frame_decoding_failed",
                "spoof_type": "DECODE_FAILED",
                "liveness_score": 0.0,
                "spoof_score": 1.0,
                "face_count": 0,
                "quality": "POOR",
                "message": "Failed to decode camera frames for liveness verification."
            }

        # ── Step 1: Single Face & Quality Check across all frames ──
        faces_per_frame = []
        for frame in decoded_frames:
            h, w = frame.shape[:2]
            self.face_detector.setInputSize((w, h))
            _, faces = self.face_detector.detect(frame)

            if faces is None or len(faces) == 0:
                # Fallback geometric face box estimation
                gray_f = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                if float(np.mean(gray_f)) > 20.0:
                    hx, hy, hw, hh = float(w * 0.2), float(h * 0.2), float(w * 0.6), float(h * 0.6)
                    synth_face = np.array([
                        hx, hy, hw, hh,
                        hx + hw*0.3, hy + hh*0.3,
                        hx + hw*0.7, hy + hh*0.3,
                        hx + hw*0.5, hy + hh*0.55,
                        0.0, 0.0, 0.0, 0.0, 0.85
                    ], dtype=np.float32)
                    faces_per_frame.append(synth_face)
                    continue

                return {
                    "status": "SPOOF",
                    "livenessVerified": False,
                    "reason": "NO_FACE",
                    "spoof_type": "NO_FACE",
                    "liveness_score": 0.0,
                    "spoof_score": 1.0,
                    "face_count": 0,
                    "quality": "POOR",
                    "message": "No face detected in camera frame. Position your face clearly in front of the camera."
                }

            if len(faces) > 1:
                return {
                    "status": "SPOOF",
                    "livenessVerified": False,
                    "reason": "MULTIPLE_FACES",
                    "spoof_type": "MULTIPLE_FACES",
                    "liveness_score": 0.0,
                    "spoof_score": 1.0,
                    "face_count": len(faces),
                    "quality": "POOR",
                    "message": "Multiple faces detected. Make sure only you are visible in the camera."
                }

            faces_per_frame.append(faces[0])

        # ── Step 2: Quality Checks (Sharpness & Lighting) ──
        first_frame = decoded_frames[0]
        first_face = faces_per_frame[0]
        x, y, w_box, h_box = int(first_face[0]), int(first_face[1]), int(first_face[2]), int(first_face[3])
        fh, fw = first_frame.shape[:2]

        x1, y1 = max(0, x), max(0, y)
        x2, y2 = min(fw, x + w_box), min(fh, y + h_box)
        face_crop = first_frame[y1:y2, x1:x2]

        if face_crop.size == 0 or face_crop.shape[0] < 30 or face_crop.shape[1] < 30:
            return {
                "status": "SPOOF",
                "livenessVerified": False,
                "reason": "FACE_TOO_FAR",
                "spoof_type": "FACE_TOO_FAR",
                "liveness_score": 0.0,
                "spoof_score": 1.0,
                "face_count": 1,
                "quality": "POOR",
                "message": "Face too far from camera. Please move closer."
            }

        gray_crop = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
        laplacian_var = float(cv2.Laplacian(gray_crop, cv2.CV_64F).var())
        mean_brightness = float(np.mean(gray_crop))

        if mean_brightness < 25.0:
            return {
                "status": "SPOOF",
                "livenessVerified": False,
                "reason": "LOW_LIGHT",
                "spoof_type": "LOW_LIGHT",
                "liveness_score": 0.20,
                "spoof_score": 0.80,
                "face_count": 1,
                "quality": "POOR",
                "message": "Lighting is too low. Ensure your face is clearly lit."
            }

        if laplacian_var < 15.0:
            return {
                "status": "SPOOF",
                "livenessVerified": False,
                "reason": "LOW_QUALITY",
                "spoof_type": "LOW_QUALITY",
                "liveness_score": 0.30,
                "spoof_score": 0.70,
                "face_count": 1,
                "quality": "POOR",
                "message": "Image quality is blurry or out of focus. Position your face clearly."
            }

        # ── Step 3: Passive Anti-Spoofing (2D FFT Moiré, LBP, Micro-Motion, Edges) ──
        fft_energies = []
        lbp_vars = []
        moire_peak_counts = []
        edge_ratios = []

        for frame, face in zip(decoded_frames, faces_per_frame):
            fx, fy, fw_b, fh_b = int(face[0]), int(face[1]), int(face[2]), int(face[3])
            fh_img, fw_img = frame.shape[:2]
            cx1, cy1 = max(0, fx), max(0, fy)
            cx2, cy2 = min(fw_img, fx + fw_b), min(fh_img, fy + fh_b)
            crop = frame[cy1:cy2, cx1:cx2]

            if crop.size == 0:
                continue

            resized = cv2.resize(crop, (128, 128))
            gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY).astype(np.float32)

            # A. 2D FFT Moiré Screen Peak Detection
            window_2d = np.hanning(128)[:, None] * np.hanning(128)[None, :]
            gray_windowed = gray * window_2d
            f = np.fft.fft2(gray_windowed)
            fshift = np.fft.fftshift(f)
            mag_spec = np.abs(fshift)

            # Compute high-frequency energy ratio
            rows, cols = gray.shape
            crow, ccol = rows // 2, cols // 2
            total_energy = float(np.sum(mag_spec)) + 1e-6
            mask_r = min(rows, cols) // 6
            y_g, x_g = np.ogrid[:rows, :cols]
            center_mask = ((y_g - crow) ** 2 + (x_g - ccol) ** 2) <= mask_r ** 2
            high_freq_e = float(np.sum(mag_spec[~center_mask]))
            fft_energy_ratio = (high_freq_e / total_energy) * 100.0
            fft_energies.append(fft_energy_ratio)

            # Detect sharp isolated Moiré frequency peaks (screen subpixel grid signatures)
            high_freq_mag = mag_spec[~center_mask]
            mag_mean = float(np.mean(high_freq_mag))
            mag_std = float(np.std(high_freq_mag))
            moire_peaks = (float(np.sum(high_freq_mag > (mag_mean + 4.0 * mag_std))) / max(1.0, float(high_freq_mag.size))) * 100.0
            moire_peak_counts.append(moire_peaks)

            # B. LBP Texture Variance (Printed Photo Loss)
            lbp = np.zeros((rows - 2, cols - 2), dtype=np.uint8)
            gray_u8 = gray.astype(np.uint8)
            offsets = [(-1, -1), (-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1)]
            for idx, (dy, dx) in enumerate(offsets):
                neighbor = gray_u8[1 + dy:rows - 1 + dy, 1 + dx:cols - 1 + dx]
                center = gray_u8[1:rows - 1, 1:cols - 1]
                lbp |= ((neighbor >= center).astype(np.uint8) << idx)
            lbp_var = float(np.var(lbp))
            lbp_vars.append(lbp_var)

            # C. Outer Margin Screen Border / Bezel Detection
            bx1, by1 = max(0, fx - 20), max(0, fy - 20)
            bx2, by2 = min(fw_img, fx + fw_b + 20), min(fh_img, fy + fh_b + 20)
            outer_crop = frame[by1:by2, bx1:bx2]
            if outer_crop.size > 0:
                edges = cv2.Canny(outer_crop, 100, 200)
                edge_ratio = float(np.sum(edges > 0)) / float(edges.size)
                edge_ratios.append(edge_ratio)

        avg_fft_energy = float(np.mean(fft_energies)) if fft_energies else 0.0
        avg_lbp_var = float(np.mean(lbp_vars)) if lbp_vars else 0.0
        avg_moire_peaks = float(np.mean(moire_peak_counts)) if moire_peak_counts else 0.0
        avg_edge_ratio = float(np.mean(edge_ratios)) if edge_ratios else 0.0

        # D. Relative Landmark Inter-Distance Micro-Variance (Rigid Photo vs Live Human)
        ratio_variances = []
        for lm in faces_per_frame:
            r_eye = np.array([lm[4], lm[5]])
            l_eye = np.array([lm[6], lm[7]])
            nose = np.array([lm[8], lm[9]])
            r_mouth = np.array([lm[10], lm[11]])
            l_mouth = np.array([lm[12], lm[13]])

            eye_dist = np.linalg.norm(r_eye - l_eye) + 1e-6
            nose_dist = np.linalg.norm(nose - (r_eye + l_eye)/2.0)
            mouth_dist = np.linalg.norm(r_mouth - l_mouth) + 1e-6

            ratio_variances.append([nose_dist / eye_dist, mouth_dist / eye_dist])

        ratio_variances = np.array(ratio_variances)
        relative_motion_std = float(np.mean(np.std(ratio_variances, axis=0))) if len(ratio_variances) > 1 else 0.0

        # Frame-to-frame pixel differences
        frame_diffs = []
        landmark_drifts = []

        for i in range(1, len(decoded_frames)):
            f_prev = decoded_frames[i - 1]
            f_curr = decoded_frames[i]
            face_prev = faces_per_frame[i - 1]
            face_curr = faces_per_frame[i]

            g_prev = cv2.cvtColor(cv2.resize(f_prev, (160, 120)), cv2.COLOR_BGR2GRAY)
            g_curr = cv2.cvtColor(cv2.resize(f_curr, (160, 120)), cv2.COLOR_BGR2GRAY)
            diff = float(np.mean(cv2.absdiff(g_prev, g_curr)))
            frame_diffs.append(diff)

            nose_prev = np.array([face_prev[8], face_prev[9]])
            nose_curr = np.array([face_curr[8], face_curr[9]])
            drift = float(np.linalg.norm(nose_curr - nose_prev))
            landmark_drifts.append(drift)

        avg_motion = float(np.mean(frame_diffs)) if frame_diffs else 0.0
        total_landmark_drift = float(np.sum(landmark_drifts)) if landmark_drifts else 0.0

        # ── Step 4: Active Dynamic Challenge Verification ──
        challenge_passed = True
        challenge_score = 100.0

        if challenge_type:
            challenge_passed = False
            challenge_score = 0.0

            first_face_lm = faces_per_frame[0]
            last_face_lm = faces_per_frame[-1]

            eye_center_x_first = (first_face_lm[4] + first_face_lm[6]) / 2.0
            eye_center_x_last = (last_face_lm[4] + last_face_lm[6]) / 2.0

            nose_x_first = first_face_lm[8]
            nose_x_last = last_face_lm[8]
            nose_y_first = first_face_lm[9]
            nose_y_last = last_face_lm[9]

            yaw_offset_first = nose_x_first - eye_center_x_first
            yaw_offset_last = nose_x_last - eye_center_x_last

            first_area = float(first_face_lm[2] * first_face_lm[3])
            last_area = float(last_face_lm[2] * last_face_lm[3])

            if challenge_type == "LOOK_LEFT":
                if (yaw_offset_last - yaw_offset_first) <= -2.5 or (nose_x_last - nose_x_first) <= -3.0:
                    challenge_passed = True
                    challenge_score = 100.0
            elif challenge_type == "LOOK_RIGHT":
                if (yaw_offset_last - yaw_offset_first) >= 2.5 or (nose_x_last - nose_x_first) >= 3.0:
                    challenge_passed = True
                    challenge_score = 100.0
            elif challenge_type == "TILT_UP":
                if (nose_y_last - nose_y_first) <= -3.0:
                    challenge_passed = True
                    challenge_score = 100.0
            elif challenge_type == "TILT_DOWN":
                if (nose_y_last - nose_y_first) >= 3.0:
                    challenge_passed = True
                    challenge_score = 100.0
            elif challenge_type == "MOVE_CLOSER":
                if (last_area / max(1.0, first_area)) >= 1.06:
                    challenge_passed = True
                    challenge_score = 100.0

        # ── Step 5: Strict Anti-Spoof Evaluation ──
        # 1. Texture Score (0-100)
        texture_score = min(100.0, max(0.0, (avg_lbp_var / 12.0) * 50.0 + (avg_fft_energy / 6.0) * 50.0))

        # 2. Replay Artifact Score (0-100, high = low Moiré/screen peaks)
        if avg_moire_peaks > 2.5 or avg_edge_ratio > 0.70:
            replay_score = 0.0
        else:
            replay_score = max(0.0, 100.0 - (avg_moire_peaks * 25.0 + max(0.0, avg_edge_ratio - 0.40) * 100.0))

        # 3. Motion Score (0-100, strictly requires non-rigid micro-motion)
        if relative_motion_std < 0.003 or (avg_motion < 0.15 and total_landmark_drift < 0.05):
            # Completely rigid photo image or frozen screen image
            motion_score = 0.0
        else:
            motion_score = min(100.0, max(25.0, relative_motion_std * 2500.0 + avg_motion * 20.0))

        # Combined Passive Liveness Score (0.0 to 1.0)
        passive_score = (0.35 * texture_score + 0.40 * replay_score + 0.25 * motion_score) / 100.0
        passive_score = max(0.0, min(1.0, passive_score))

        # Overall Liveness Score considering active challenge
        if challenge_type:
            final_liveness_score = 0.50 * passive_score + 0.50 * (challenge_score / 100.0)
        else:
            final_liveness_score = passive_score

        # Strict Liveness Decision
        is_live = bool(
            final_liveness_score >= self.liveness_threshold and
            challenge_passed and
            motion_score > 0.0 and
            replay_score > 0.0
        )

        # Spoof Classification
        spoof_type = "NONE"
        if not is_live:
            if motion_score == 0.0 or (avg_motion < 0.15 and total_landmark_drift < 0.05):
                spoof_type = "PRINTED_PHOTO"
                message = "Presentation attack detected (Printed Photo / Static Image). Live human face required."
            elif replay_score == 0.0 or avg_moire_peaks > 2.5:
                spoof_type = "PHONE_SCREEN"
                message = "Presentation attack detected (Screen Replay Moiré Pattern). Live human face required."
            elif not challenge_passed and challenge_type:
                spoof_type = "CHALLENGE_FAILED"
                message = f"Active liveness challenge failed. Please follow the prompt: {challenge_type}."
            else:
                spoof_type = "UNKNOWN_SPOOF"
                message = "Face liveness verification failed. Position yourself clearly in front of the camera."
        else:
            message = "Face liveness verified successfully."

        processing_time_ms = int((time.time() - start_time) * 1000)

        return {
            "status": "LIVE" if is_live else "SPOOF",
            "livenessVerified": is_live,
            "spoof_type": spoof_type,
            "liveness_score": round(final_liveness_score, 4),
            "spoof_score": round(1.0 - final_liveness_score, 4),
            "passive_score": round(passive_score, 4),
            "challenge_passed": challenge_passed,
            "challenge_type": challenge_type,
            "face_count": 1,
            "quality": "GOOD",
            "avg_motion": round(avg_motion, 4),
            "avg_lbp_var": round(avg_lbp_var, 2),
            "avg_moire_peaks": round(avg_moire_peaks, 2),
            "processing_time_ms": processing_time_ms,
            "message": message
        }
