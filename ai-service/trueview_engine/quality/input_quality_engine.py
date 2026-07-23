"""
Input Quality Engine – TrueView AI Engine

Evaluates real-time video and audio input quality prior to AI inference.
Prevents false positive violations caused by sensor failure, low lighting,
blur, or audio clipping. Dynamically adjusts AI confidence scores.
"""

import cv2
import numpy as np
from typing import Dict, Any, Optional, Tuple


class InputQualityEngine:
    """
    Evaluates video and audio input quality and outputs standardized quality state.
    """

    def evaluate_video(self, frame: Optional[np.ndarray], face_box: Optional[Tuple[int, int, int, int]] = None) -> Dict[str, Any]:
        """
        Evaluate frame brightness, blur (Laplacian variance), resolution, face size, and visibility.
        """
        if frame is None:
            return {
                "quality": "UNRELIABLE",
                "score": 0.0,
                "brightness": 0.0,
                "blur_score": 0.0,
                "face_visibility": 0.0,
                "note": "No frame received / camera unavailable."
            }

        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame

        # 1. Brightness check (0-255 -> 0.0 to 1.0)
        mean_brightness = float(np.mean(gray)) / 255.0

        # 2. Blur check via Laplacian variance
        lap_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        # Laplacian variance > 100 is clear, < 30 is blurry
        blur_score = min(1.0, max(0.0, lap_var / 120.0))

        # 3. Face size and visibility relative to frame
        face_vis = 1.0
        if face_box:
            fx, fy, fw, fh = face_box
            face_area_ratio = (fw * fh) / float(w * h)
            if face_area_ratio < 0.02:  # Face is too far away or tiny
                face_vis = 0.4
            elif face_area_ratio > 0.85: # Face is too close / cropped
                face_vis = 0.6
        else:
            face_vis = 0.5  # Unknown until face detection runs

        # Composite video score
        video_score = round(0.4 * mean_brightness + 0.4 * blur_score + 0.2 * face_vis, 2)

        # Categorize rating
        if mean_brightness < 0.15 or lap_var < 15.0:
            quality = "POOR"
            note = "Extremely low lighting or severe blur detected."
        elif mean_brightness < 0.25 or lap_var < 35.0:
            quality = "ACCEPTABLE"
            note = "Suboptimal lighting or slight motion blur."
        else:
            quality = "GOOD"
            note = "Clear visibility and good lighting."

        if mean_brightness < 0.08:
            quality = "UNRELIABLE"
            note = "Camera pitch black or completely obscured."

        return {
            "quality": quality,
            "score": video_score,
            "brightness": round(mean_brightness, 2),
            "blur_score": round(blur_score, 2),
            "face_visibility": round(face_vis, 2),
            "note": note
        }

    def evaluate_audio(self, samples: Optional[list]) -> Dict[str, Any]:
        """
        Evaluate audio samples for signal strength, background noise, clipping, and mic availability.
        """
        if not samples or len(samples) < 50:
            return {
                "quality": "UNRELIABLE",
                "score": 0.0,
                "noise_level": "high",
                "clipping": False,
                "note": "Microphone silent or audio samples unavailable."
            }

        arr = np.array(samples, dtype=np.float32)
        abs_arr = np.abs(arr)
        rms = float(np.sqrt(np.mean(arr ** 2)))
        max_val = float(np.max(abs_arr))

        # Check clipping (samples near -1.0 or 1.0)
        clipping = max_val >= 0.98

        # Noise level classification based on background floor
        if rms > 0.20:
            noise_level = "high"
            audio_quality = "POOR"
            note = "Heavy background noise or distortion."
        elif rms > 0.08:
            noise_level = "medium"
            audio_quality = "ACCEPTABLE"
            note = "Moderate background noise."
        else:
            noise_level = "low"
            audio_quality = "GOOD"
            note = "Clean audio signal."

        audio_score = 1.0 if audio_quality == "GOOD" else (0.7 if audio_quality == "ACCEPTABLE" else 0.3)
        if clipping:
            audio_score *= 0.8
            note += " Audio clipping detected."

        return {
            "quality": audio_quality,
            "score": audio_score,
            "noise_level": noise_level,
            "clipping": clipping,
            "rms": round(rms, 3),
            "note": note
        }

    def combine_quality(self, video_eval: Dict[str, Any], audio_eval: Dict[str, Any]) -> Dict[str, Any]:
        """
        Combine video and audio evaluations into overall quality factor.
        """
        v_qual = video_eval.get("quality", "GOOD")
        a_qual = audio_eval.get("quality", "GOOD")
        v_score = video_eval.get("score", 1.0)
        a_score = audio_eval.get("score", 1.0)

        overall_score = round(0.7 * v_score + 0.3 * a_score, 2)
        monitoring_uncertain = (v_qual in ("POOR", "UNRELIABLE") or a_qual == "UNRELIABLE")

        quality_note = video_eval.get("note", "")
        if a_qual in ("POOR", "UNRELIABLE"):
            quality_note += " " + audio_eval.get("note", "")

        return {
            "video_quality": v_qual,
            "audio_quality": a_qual,
            "brightness": video_eval.get("brightness", 1.0),
            "blur_score": video_eval.get("blur_score", 1.0),
            "face_visibility": video_eval.get("face_visibility", 1.0),
            "noise_level": audio_eval.get("noise_level", "low"),
            "overall_quality_score": overall_score,
            "monitoring_uncertain": monitoring_uncertain,
            "quality_note": quality_note.strip()
        }
