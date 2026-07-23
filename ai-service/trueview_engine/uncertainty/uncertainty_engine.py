"""
Uncertainty Evaluation Engine – TrueView AI Engine

Allows TrueView AI to express explicit uncertainty rather than binary forced decisions.
Output states: CONFIRMED, LIKELY, UNCERTAIN, REJECTED.
"""

from typing import Dict, Any, List


class UncertaintyEngine:
    """
    Evaluates multi-module agreement and input quality to return explicit uncertainty rating.
    """

    def evaluate(
        self,
        base_confidence: float,
        quality_eval: Dict[str, Any],
        module_agreement: float,  # 0.0 to 1.0 cross-module agreement
        temporal_persistence_confirmed: bool
    ) -> Dict[str, Any]:
        """
        Calculates adjusted decision confidence and uncertainty category.
        """
        v_qual = quality_eval.get("video_quality", "GOOD")
        a_qual = quality_eval.get("audio_quality", "GOOD")

        # Penalty factors
        quality_penalty = 0.0
        if v_qual == "POOR":
            quality_penalty += 0.20
        elif v_qual == "UNRELIABLE":
            quality_penalty += 0.45

        if a_qual == "POOR":
            quality_penalty += 0.15
        elif a_qual == "UNRELIABLE":
            quality_penalty += 0.30

        disagreement_penalty = (1.0 - module_agreement) * 0.25

        adjusted_confidence = max(0.0, base_confidence - quality_penalty - disagreement_penalty)

        if not temporal_persistence_confirmed:
            adjusted_confidence *= 0.8

        # Categorize
        if adjusted_confidence >= 0.85:
            uncertainty_level = "CONFIRMED"
        elif adjusted_confidence >= 0.65:
            uncertainty_level = "LIKELY"
        elif adjusted_confidence >= 0.40:
            uncertainty_level = "UNCERTAIN"
        else:
            uncertainty_level = "REJECTED"

        reasons: List[str] = []
        if quality_penalty > 0.0:
            reasons.append("Confidence downgraded due to low input quality or lighting.")
        if disagreement_penalty > 0.05:
            reasons.append("Minor cross-module disagreement observed.")
        if not temporal_persistence_confirmed:
            reasons.append("Awaiting temporal persistence confirmation.")

        return {
            "uncertainty_level": uncertainty_level,
            "adjusted_confidence": round(adjusted_confidence, 2),
            "reasons": reasons
        }
