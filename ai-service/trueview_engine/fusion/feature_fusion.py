"""
Multimodal Feature Fusion Layer – TrueView AI Engine

Consolidates outputs from Shared Face Pipeline, Continuous Audio, YOLO Object Detection,
Input Quality Engine, Session Calibration Profile, and Continuous Auth into ONE unified state.
"""

from typing import Dict, Any


class MultimodalFeatureFusion:
    """
    Consolidates sub-service outputs into a standardized feature dictionary.
    """

    def fuse(
        self,
        shared_face: Dict[str, Any],
        audio: Dict[str, Any],
        yolo_detections: Dict[str, Any],
        quality_eval: Dict[str, Any],
        identity_eval: Dict[str, Any],
        liveness_eval: Dict[str, Any],
        attention_eval: Dict[str, Any],
        session_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Produce a normalized fused feature dictionary.
        """
        face_detected = shared_face.get("face_detected", False)
        person_count = yolo_detections.get("summary", {}).get("person_count", 1 if face_detected else 0)
        phone_detected = yolo_detections.get("summary", {}).get("phone_detected", False)

        fused = {
            "identity": identity_eval,
            "liveness": liveness_eval,
            "attention": attention_eval,
            "audio": audio,
            "quality": quality_eval,
            "environment": {
                "person_count": person_count,
                "phone_detected": phone_detected,
                "objects": yolo_detections.get("detections", []),
            },
            "face_detected": face_detected,
            "session_context": session_context,
        }

        return fused
