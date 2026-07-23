"""
Explainable AI Engine – TrueView AI Engine

Generates human-understandable explanations for all automated decisions and events.
Answers: WHAT happened, WHY detected, WHICH modules contributed, HOW confident, HOW long, WHAT context.
"""

from typing import Dict, Any, List


class ExplainabilityEngine:
    """
    Produces transparent explanations and evidence packages for monitoring decisions.
    """

    def generate_explanation(
        self,
        events: List[Dict[str, Any]],
        correlated_patterns: List[Dict[str, Any]],
        risk_score: float,
        session_type: str,
        quality_eval: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Synthesizes active events and correlated patterns into structured explanation payload.
        """
        explanations: List[Dict[str, Any]] = []

        # 1. Process Correlated Patterns
        for pat in correlated_patterns:
            explanations.append({
                "what": pat.get("pattern_name", "Correlated Behaviour Pattern"),
                "why": pat.get("evidence", "Multi-signal correlation detected."),
                "contributing_modules": pat.get("supporting_signals", ["Vision", "Audio"]),
                "confidence": pat.get("confidence", 0.90),
                "duration": pat.get("duration", 0.0),
                "policy_context": session_type,
                "risk_contribution": 15.0,
            })

        # 2. Process Individual Events
        for evt in events:
            evt_type = evt.get("type", "EVENT")
            explanations.append({
                "what": evt_type.replace("_", " ").title(),
                "why": evt.get("evidence", "Behavioral rule boundary crossed."),
                "contributing_modules": [evt_type.split("_")[0].title()],
                "confidence": evt.get("confidence", 0.85),
                "duration": evt.get("duration", 0.0),
                "policy_context": session_type,
                "risk_contribution": 10.0 if evt.get("severity") == "HIGH" else 5.0,
            })

        # Summary text
        if not explanations:
            summary = f"Session is operating within normal boundaries for '{session_type}' policy. No violations detected."
        else:
            top_evt = explanations[0]["what"]
            summary = f"Risk score is {risk_score} under '{session_type}' policy due to {len(explanations)} detected event(s), primarily '{top_evt}'."

        if quality_eval.get("video_quality") in ("POOR", "UNRELIABLE"):
            summary += " Note: Suboptimal video input quality was accounted for during decision evaluation."

        return {
            "summary": summary,
            "explanations": explanations
        }
