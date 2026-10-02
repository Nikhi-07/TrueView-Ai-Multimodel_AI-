"""
Tab Switch Policy Engine – TrueView AI Engine

Enforces the standardized examination tab-switch policy:
- 1/3: Warning
- 2/3: Warning
- 3/3: Final warning
- 4/3: Terminate session (CRITICAL, TAB_SWITCH_LIMIT_EXCEEDED)
"""

from typing import Dict, Any


def evaluate_tab_switch(current_count: int, max_allowed: int = 3) -> Dict[str, Any]:
    """
    Authoritative tab-switch evaluation matching the TrueView proctoring policy.
    """
    if current_count <= 0:
        return {
            "status": "NORMAL",
            "count": 0,
            "max_allowed": max_allowed,
            "severity": "LOW",
            "event_type": "TAB_SWITCH_NORMAL",
            "message": "No tab switches detected.",
            "is_terminated": False
        }
    elif current_count == 1:
        return {
            "status": "WARNING",
            "count": 1,
            "max_allowed": max_allowed,
            "severity": "MEDIUM",
            "event_type": "TAB_SWITCH_DETECTED",
            "message": f"Tab switch detected (Warning 1 of {max_allowed}). Please return to the examination window.",
            "is_terminated": False
        }
    elif current_count == 2:
        return {
            "status": "WARNING",
            "count": 2,
            "max_allowed": max_allowed,
            "severity": "MEDIUM",
            "event_type": "TAB_SWITCH_DETECTED",
            "message": f"Tab switch detected (Warning 2 of {max_allowed}).",
            "is_terminated": False
        }
    elif current_count == 3:
        return {
            "status": "FINAL_WARNING",
            "count": 3,
            "max_allowed": max_allowed,
            "severity": "MEDIUM",
            "event_type": "TAB_SWITCH_DETECTED",
            "message": f"Final warning: Tab switch detected (Warning 3 of {max_allowed}). One more tab switch will terminate your session.",
            "is_terminated": False
        }
    else:
        return {
            "status": "TERMINATED",
            "count": current_count,
            "max_allowed": max_allowed,
            "severity": "CRITICAL",
            "event_type": "TAB_SWITCH_LIMIT_EXCEEDED",
            "message": f"Session terminated: Maximum tab-switch limit exceeded ({current_count}/{max_allowed}).",
            "is_terminated": True
        }
