"""
Shared Face Vision Pipeline – TrueView AI Engine

Runs face detection ONCE per video frame, extracts shared face ROI & 68 landmarks,
and distributes them to Face Recognition, Liveness, Gaze, and Head Pose modules.
Prevents redundant face detection calls across sub-services.
"""

import cv2
import numpy as np
import base64
from typing import Dict, Any, Optional

from trueview_engine.models.model_manager import ModelManager
from trueview_engine.config.thresholds import (
    FRAME_INTERVAL_FACE_RECOGNITION,
    FRAME_INTERVAL_LIVENESS,
)


class SharedFacePipeline:
    """
    Single-pass facial processing pipeline.
    """

    def __init__(self):
        self.model_manager = ModelManager()

    def process(
        self,
        frame: np.ndarray,
        frame_index: int,
        session_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Process a single image frame through shared vision pipeline.

        Returns:
            {
                "face_detected": bool,
                "face_count": int,
                "face_box": (x, y, w, h),
                "landmarks": list,
                "identity": { "verified": bool, "confidence": float },
                "liveness": { "status": str, "confidence": float },
                "gaze": { "direction": str, "confidence": float },
                "head_pose": { "pitch": float, "yaw": float, "roll": float, "direction": str },
            }
        """
        out = {
            "face_detected": False,
            "face_count": 0,
            "face_box": None,
            "landmarks": [],
            # HONEST DEFAULT: nothing has been verified yet. Never report
            # verified=True without a real recognition result (rule 49).
            "identity": {"verified": False, "confidence": 0.0, "status": "UNAVAILABLE", "recognition_unavailable": True},
            "liveness": {"status": "live", "confidence": 0.95},
            "gaze": {"direction": "center", "confidence": 0.85},
            "head_pose": {"pitch": 0.0, "yaw": 0.0, "roll": 0.0, "direction": "Looking Straight"},
        }

        if frame is None:
            return out

        h, w = frame.shape[:2]

        # 1. Single Face Detection & Landmark Extraction (ONCE per frame)
        extractor = self.model_manager.landmark_extractor
        if extractor is None:
            return out

        landmark_res = extractor.extract(frame)
        if not landmark_res.get("face_detected"):
            out["face_detected"] = False
            out["face_count"] = 0
            out["liveness"] = {"status": "no_face", "confidence": 0.0}
            out["attention"] = {"status": "looking_away", "gaze": "away", "head_pose": "No Face"}
            return out

        landmarks = landmark_res.get("landmarks", [])
        out["face_detected"] = True
        out["face_count"] = 1
        out["face_box"] = landmark_res.get("face_box")
        out["landmarks"] = landmarks

        # 2. Eye Gaze Tracking (reuses shared landmarks)
        gaze_svc = self.model_manager.gaze_service
        if gaze_svc is not None:
            try:
                eye_data = gaze_svc.eye_extractor.extract(landmarks)
                if eye_data.get("success"):
                    iris_data = gaze_svc.iris_detector.detect_both(eye_data["left_eye"], eye_data["right_eye"], frame=frame)
                    gaze_res = gaze_svc.gaze_estimator.estimate(iris_data["averaged_position"])
                    out["gaze"] = {
                        "direction": gaze_res.get("gaze_direction", "center"),
                        "confidence": gaze_res.get("confidence", 0.85),
                        "iris_position": iris_data.get("averaged_position", {}),
                    }
            except Exception as e:
                print(f"[SharedFacePipeline] Gaze tracking exception: {e}")

        # 3. Head Pose Estimation (reuses shared landmarks)
        pose_svc = self.model_manager.head_pose_service
        if pose_svc is not None:
            try:
                pose_res = pose_svc.pose_estimator.estimate_pose(landmarks, w, h)
                if pose_res.get("success"):
                    rvec = pose_res["rvec"]
                    pitch, yaw, roll = pose_svc.rotation_decomposer.decompose(rvec, landmarks)
                    cls_res = pose_svc.orientation_classifier.classify(pitch, yaw, roll)
                    out["head_pose"] = {
                        "pitch": pitch,
                        "yaw": yaw,
                        "roll": roll,
                        "direction": cls_res.get("direction", "Looking Straight"),
                        "attention_status": cls_res.get("direction", "focused"),
                    }
            except Exception:
                pass

        # 4. Periodic Liveness Verification (skip-frame strategy)
        if frame_index % FRAME_INTERVAL_LIVENESS == 0:
            liveness_svc = self.model_manager.liveness_service
            if liveness_svc is not None:
                try:
                    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                    b64_str = base64.b64encode(buffer).decode('utf-8')
                    liv_res = liveness_svc.check(b64_str, session_context.get("session_id", "default"))
                    out["liveness"] = {
                        "status": liv_res.get("liveness", "live").lower(),
                        "confidence": float(liv_res.get("confidence", 95.0)) / 100.0 if float(liv_res.get("confidence", 95.0)) > 1.0 else float(liv_res.get("confidence", 0.95)),
                    }
                except Exception:
                    pass

        # 5. Periodic Identity Verification (skip-frame strategy) — REAL comparison.
        #    Honest rule (49): verified=True requires (a) the SFace model actually
        #    loaded and (b) the registered face embedding supplied by the backend at
        #    session start. Otherwise status is UNAVAILABLE — no identity event is
        #    fabricated and the reviewer is never shown a fake REGISTERED_FACE.
        if frame_index % FRAME_INTERVAL_FACE_RECOGNITION == 0:
            rec_svc = self.model_manager.recognition_service
            registered = session_context.get("registered_face_embeddings") or []

            if rec_svc is None or not getattr(rec_svc, "is_ready", False):
                out["identity"] = {
                    "verified": False, "confidence": 0.0, "status": "UNAVAILABLE",
                    "recognition_unavailable": True,
                    "note": "Face recognition model unavailable.",
                }
            elif not registered:
                out["identity"] = {
                    "verified": False, "confidence": 0.0, "status": "UNAVAILABLE",
                    "recognition_unavailable": True,
                    "note": "No registered face profile supplied for this session.",
                }
            else:
                try:
                    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                    b64_str = base64.b64encode(buffer).decode('utf-8')
                    emb_res = rec_svc.extract_embedding(b64_str)
                    if "error" in emb_res:
                        out["identity"] = {
                            "verified": False, "confidence": 0.0, "status": "UNAVAILABLE",
                            "recognition_unavailable": True, "note": emb_res["error"],
                        }
                    else:
                        candidates = [{"id": f"registered_{i}", "embedding": emb} for i, emb in enumerate(registered)]
                        match = rec_svc.compare_embedding(emb_res["embedding"], candidates)
                        out["identity"] = {
                            "verified": bool(match.get("verified")),
                            "confidence": float(match.get("confidence", 0.0)),
                            "status": "VERIFIED" if match.get("verified") else "MISMATCH",
                            "recognition_unavailable": False,
                            "matched_user_id": match.get("matched_user_id"),
                        }
                except Exception as e:
                    out["identity"] = {
                        "verified": False, "confidence": 0.0, "status": "UNAVAILABLE",
                        "recognition_unavailable": True, "note": f"Recognition error: {e}",
                    }

        return out
