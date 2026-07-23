"""
Confidence Calculator – Per-Module and Overall Pipeline Confidence

Each AI module reports a confidence value (0–1).  This calculator
computes a weighted-average overall confidence using the weights
defined in constants.
"""

from decision_engine.utils.constants import MODULE_CONFIDENCE_WEIGHTS


class ConfidenceCalculator:
    """Compute per-module and aggregated pipeline confidence."""

    def calculate(self, module_data: dict) -> dict:
        """
        Args:
            module_data: telemetry dict that may contain per-module
                         confidence keys (e.g. face_confidence, gaze_confidence).

        Returns:
            {
              "per_module": {
                  "face_detection":    0.95,
                  "gaze_tracking":     0.88,
                  ...
              },
              "overall": 0.91
            }
        """
        # Map incoming telemetry keys → module names
        _KEY_MAP = {
            "face_confidence":      "face_detection",
            "gaze_confidence":      "gaze_tracking",
            "pose_confidence":      "head_pose",
            "voice_confidence":     "voice_detection",
            "yolo_confidence":      "object_detection",
            "behaviour_confidence": "behaviour_analysis",
        }

        per_module: dict[str, float] = {}

        for telem_key, module_name in _KEY_MAP.items():
            raw = module_data.get(telem_key)
            if raw is not None:
                per_module[module_name] = round(float(raw), 2)
            else:
                # Default to 0.5 (uncertain) when a module didn't report
                per_module[module_name] = 0.5

        # Weighted average
        weighted_sum = 0.0
        weight_total = 0.0
        for module_name, conf in per_module.items():
            w = MODULE_CONFIDENCE_WEIGHTS.get(module_name, 0.1)
            weighted_sum += conf * w
            weight_total += w

        overall = weighted_sum / weight_total if weight_total > 0 else 0.5

        return {
            "per_module": per_module,
            "overall": round(overall, 2),
        }
