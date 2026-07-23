"""
Threshold Calibrator – TrueView AI Engine

Tests candidate thresholds against validation data to optimize precision vs recall.
"""

from typing import Dict, Any, List


class ThresholdCalibrator:
    """
    Evaluates candidate threshold parameter sets against validation sets.
    """

    def find_optimal_threshold(self, candidate_thresholds: List[float], eval_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        best_thresh = 0.5
        best_f1 = -1.0

        for thresh in candidate_thresholds:
            tp, fp, fn = 0, 0, 0
            for item in eval_data:
                score = item.get("score", 0.0)
                actual = item.get("actual", False)
                pred = (score >= thresh)

                if actual and pred:
                    tp += 1
                elif not actual and pred:
                    fp += 1
                elif actual and not pred:
                    fn += 1

            prec = tp / float(tp + fp) if (tp + fp) > 0 else 0.0
            rec = tp / float(tp + fn) if (tp + fn) > 0 else 0.0
            f1 = 2 * (prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0

            if f1 > best_f1:
                best_f1 = f1
                best_thresh = thresh

        return {
            "optimal_threshold": best_thresh,
            "best_f1_score": round(best_f1, 3)
        }
