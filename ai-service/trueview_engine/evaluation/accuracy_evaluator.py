"""
Accuracy Evaluation Framework – TrueView AI Engine

Evaluates system precision, recall, F1-score, false positive rate (FPR), false negative rate (FNR),
event detection accuracy, and latency across test scenarios.
"""

from typing import Dict, Any, List


class AccuracyEvaluator:
    """
    Automated evaluation framework measuring multi-scenario detection performance.
    """

    def evaluate_results(self, ground_truth: List[Dict[str, Any]], predictions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Calculates precision, recall, F1, FPR, FNR, accuracy metrics.
        """
        tp, fp, fn, tn = 0, 0, 0, 0

        for gt, pred in zip(ground_truth, predictions):
            gt_pos = gt.get("has_violation", False)
            pred_pos = pred.get("risk", {}).get("level") in ("MEDIUM", "HIGH", "CRITICAL")

            if gt_pos and pred_pos:
                tp += 1
            elif not gt_pos and pred_pos:
                fp += 1
            elif gt_pos and not pred_pos:
                fn += 1
            else:
                tn += 1

        total = max(1, tp + fp + fn + tn)
        precision = round(tp / float(tp + fp), 3) if (tp + fp) > 0 else 1.0
        recall = round(tp / float(tp + fn), 3) if (tp + fn) > 0 else 1.0
        f1 = round(2 * (precision * recall) / (precision + recall), 3) if (precision + recall) > 0 else 1.0
        fpr = round(fp / float(fp + tn), 3) if (fp + tn) > 0 else 0.0
        fnr = round(fn / float(fn + tp), 3) if (fn + tp) > 0 else 0.0
        accuracy = round((tp + tn) / float(total), 3)

        return {
            "total_samples": total,
            "true_positives": tp,
            "false_positives": fp,
            "true_negatives": tn,
            "false_negatives": fn,
            "precision": precision,
            "recall": recall,
            "f1_score": f1,
            "false_positive_rate": fpr,
            "false_negative_rate": fnr,
            "accuracy": accuracy,
        }
