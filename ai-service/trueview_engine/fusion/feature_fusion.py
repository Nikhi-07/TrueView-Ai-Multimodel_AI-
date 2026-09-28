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
        summary = yolo_detections.get("summary", {})
        face_detected = bool(shared_face.get("face_detected", False))
        person_count = summary.get("person_count", 1 if face_detected else 0)
        phone_detected = summary.get("phone_detected", False)

        fused = {
            "identity": identity_eval,
            "liveness": liveness_eval,
            "attention": attention_eval,
            "audio": audio,
            "quality": quality_eval,
            "environment": {
                "person_count": person_count,
                "validating_person_count": summary.get("validating_person_count", 0),
                "person_status": summary.get("person_status", "single_person" if person_count == 1 else "no_person"),
                "phone_detected": phone_detected,
                "phone_status": summary.get("phone_status", "CLEAN"),
                "laptop_detected": summary.get("laptop_detected", False),
                "book_detected": summary.get("book_detected", False),
                "prohibited_items_count": summary.get("prohibited_items_count", 0),
                "objects": yolo_detections.get("detections", []),
                "events": yolo_detections.get("events", []),
            },
            "face_detected": face_detected,
            "gaze": shared_face.get("gaze", {}),
            "head_pose": shared_face.get("head_pose", {}),
            "session_context": session_context,
        }

        return fused
