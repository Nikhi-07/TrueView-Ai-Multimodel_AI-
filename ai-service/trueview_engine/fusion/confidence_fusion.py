"""
Confidence Fusion & Module Disagreement Engine – TrueView AI Engine

Performs cross-module consistency validation (e.g. Gaze vs. Head Pose orientation)
and weighted confidence fusion considering input quality, temporal persistence, and calibration.
"""

from typing import Dict, Any, Tuple


class ConfidenceFusionEngine:
    """
    Evaluates cross-module agreement and computes fused confidence scores.
    """

    def evaluate_agreement(self, gaze_dir: str, pose_dir: str) -> Tuple[float, str]:
        """
        Cross-validates Eye Gaze direction and Head Pose orientation.
        Returns (agreement_score: float 0.0-1.0, agreement_label: str).
        """
        gaze_lower = gaze_dir.lower()
        pose_lower = pose_dir.lower()

        # Both centered
        if ("center" in gaze_lower or "straight" in gaze_lower) and ("straight" in pose_lower or "center" in pose_lower):
            return (1.0, "HIGH_AGREEMENT")

        # Both pointing left
        if "left" in gaze_lower and "left" in pose_lower:
            return (1.0, "HIGH_AGREEMENT")

        # Both pointing right
        if "right" in gaze_lower and "right" in pose_lower:
            return (1.0, "HIGH_AGREEMENT")

        # Both pointing down
        if "down" in gaze_lower and "down" in pose_lower:
            return (1.0, "HIGH_AGREEMENT")

        # Conflict: Gaze looking left/right while head is straight
        if ("left" in gaze_lower or "right" in gaze_lower) and ("straight" in pose_lower):
            return (0.6, "MODERATE_AGREEMENT")

        # Direct contradiction: Gaze left while head pose right or vice versa
        if ("left" in gaze_lower and "right" in pose_lower) or ("right" in gaze_lower and "left" in pose_lower):
            return (0.2, "LOW_AGREEMENT")

        return (0.7, "ACCEPTABLE_AGREEMENT")

    def fuse_confidences(
        self,
        model_conf: float,
        quality_score: float,
        agreement_score: float,
        is_calibrated: bool,
        is_temporally_confirmed: bool
    ) -> float:
        """
        Computes weighted fused confidence.
        """
        w_model = 0.35
        w_quality = 0.25
        w_agreement = 0.20
        w_calib = 0.10 if is_calibrated else 0.05
        w_temp = 0.10 if is_temporally_confirmed else 0.05

        fused = (
            w_model * model_conf +
            w_quality * quality_score +
            w_agreement * agreement_score +
            w_calib * (1.0 if is_calibrated else 0.7) +
            w_temp * (1.0 if is_temporally_confirmed else 0.6)
        )

        return round(max(0.0, min(1.0, fused)), 2)
