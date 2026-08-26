import cv2
import numpy as np
import os
import base64
import time

class FaceRecognizer:
    def __init__(self):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        # SFace model path
        self.model_path = os.path.join(base_dir, "..", "face_detection", "models", "face_recognition_sface_2021dec.onnx")
        # YuNet model path (needed to initialize the detector for alignment)
        yunet_path = os.path.join(base_dir, "..", "face_detection", "models", "face_detection_yunet_2023mar.onnx")

        self.detector = None
        if os.path.exists(yunet_path):
            try:
                self.detector = cv2.FaceDetectorYN.create(
                    model=yunet_path,
                    config="",
                    input_size=(320, 320),
                    score_threshold=0.4,
                    nms_threshold=0.3,
                    top_k=5000
                )
            except Exception as e:
                print(f"Warning: Failed to create FaceDetectorYN from {yunet_path}: {e}")
                self.detector = None
        
        self.recognizer = None
        self._init_recognizer()

        # Threshold for SFace Cosine similarity (typically 0.36 for loose, 0.48+ for strict verification)
        self.cosine_threshold = 0.48

    @property
    def is_ready(self) -> bool:
        """
        True only when the real SFace ONNX model is loaded and usable.
        The engine must NEVER fall back to fabricated results when this is False.
        """
        return self.recognizer is not None and os.path.exists(self.model_path)

    def _init_recognizer(self):
        if self.recognizer is not None:
            return True
        if os.path.exists(self.model_path):
            try:
                self.recognizer = cv2.FaceRecognizerSF.create(
                    model=self.model_path,
                    config=""
                )
                print(f"[OK] SFace model successfully loaded from {self.model_path}")
                return True
            except Exception as e:
                print(f"Warning: Failed to load SFace model from {self.model_path}: {e}")
                self.recognizer = None
        return False

    def extract_embedding(self, image_data: str):
        """
        Detects, aligns, and extracts the 128-D embedding from the first face found.
        """
        if not image_data:
            return {"error": "Image data is required"}

        # Decode base64 image
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        
        try:
            img_bytes = base64.b64decode(image_data)
            np_arr = np.frombuffer(img_bytes, np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        except Exception as e:
            return {"error": "Failed to decode image data"}

        if frame is None:
            return {"error": "Failed to decode image into frame"}

        if self.detector is None or not self._init_recognizer():
            # HONEST RULE: never fabricate embeddings. If the SFace model is missing,
            # report unavailability explicitly so callers can fail closed (no identity
            # claim is ever made from synthetic data).
            return {
                "error": "Face recognition model unavailable. Place face_recognition_sface_2021dec.onnx in face_detection/models/ to enable face verification.",
                "recognition_unavailable": True
            }

        return self.extract_from_frame(frame)

    def extract_from_frame(self, frame: np.ndarray, face_data=None):
        """
        Extracts 128-D SFace embedding directly from an OpenCV BGR frame.
        If multiple faces are detected, extracts from the primary face (largest area).
        """
        if frame is None or frame.size == 0:
            return {"error": "Invalid frame", "face_detected": False}

        if not self._init_recognizer():
            return {
                "error": "Face recognition model unavailable.",
                "recognition_unavailable": True
            }

        try:
            if face_data is not None:
                primary_face = face_data
                face_count = 1
            else:
                if self.detector is None:
                    return {"error": "Face detector not available", "face_detected": False}

                (h, w) = frame.shape[:2]
                self.detector.setInputSize((w, h))
                _, faces_data = self.detector.detect(frame)

                if faces_data is None or len(faces_data) == 0:
                    return {"error": "No face detected in the image.", "face_detected": False, "status": "FACE_NOT_DETECTED"}

                face_count = len(faces_data)
                # Primary candidate face is the largest bounding box area (w * h)
                primary_face = max(faces_data, key=lambda f: float(f[2]) * float(f[3]))

            # Align and crop face
            aligned_face = self.recognizer.alignCrop(frame, primary_face)

            # Extract features (embedding) and L2-normalize
            raw_emb = self.recognizer.feature(aligned_face)
            norm = np.linalg.norm(raw_emb)
            if norm > 0:
                raw_emb = raw_emb / norm

            embedding_list = raw_emb.flatten().tolist()

            return {
                "embedding": embedding_list,
                "face_detected": True,
                "face_count": face_count
            }
        except Exception as e:
            print(f"[FaceRecognizer] Error extracting embedding: {e}")
            return {"error": f"Failed to extract face features: {str(e)}", "face_detected": False}

    def compare_embedding(self, live_embedding, candidate_embeddings: list, threshold=None):
        """
        Compare a live 128-D embedding against candidate embeddings using cosine
        similarity. Verification passes only when the best score is at or above the
        SFace threshold.
        """
        thresh = threshold if threshold is not None else self.cosine_threshold
        if live_embedding is None:
            return {"verified": False, "confidence": 0.0, "status": "MISMATCH", "threshold": thresh}

        live_embedding = np.array(live_embedding, dtype=np.float32)
        norm_live = np.linalg.norm(live_embedding)
        if norm_live > 0:
            live_embedding = live_embedding / norm_live

        # Normalize candidates into list of dicts with 128-D embedding arrays
        normalized_candidates = []
        if isinstance(candidate_embeddings, list) and len(candidate_embeddings) > 0:
            if isinstance(candidate_embeddings[0], (int, float)):
                # Single 1D embedding
                normalized_candidates.append({"id": "candidate_0", "embedding": candidate_embeddings})
            else:
                for idx, cand in enumerate(candidate_embeddings):
                    if isinstance(cand, dict):
                        emb = cand.get("embedding", [])
                        cand_id = cand.get("id", f"candidate_{idx}")
                    elif isinstance(cand, list):
                        emb = cand
                        cand_id = f"candidate_{idx}"
                    else:
                        continue
                    if isinstance(emb, list) and len(emb) > 0:
                        normalized_candidates.append({"id": cand_id, "embedding": emb})

        if not normalized_candidates:
            return {
                "verified": False,
                "confidence": 0.0,
                "status": "UNAVAILABLE",
                "recognition_unavailable": True,
                "note": "No valid registered face candidates provided."
            }

        best_match = None
        best_score = -1.0

        for candidate in normalized_candidates:
            cand_emb = np.array(candidate.get("embedding", []), dtype=np.float32)
            if cand_emb.size == 0:
                continue
            norm_cand = np.linalg.norm(cand_emb)
            if norm_cand > 0:
                cand_emb = cand_emb / norm_cand

            # Compute cosine similarity
            similarity = float(np.dot(live_embedding, cand_emb))

            if similarity > best_score:
                best_score = similarity
                best_match = candidate

        # Verification passes if similarity is at or above threshold
        is_matched = best_score >= thresh
        print(f"[SFace Match] Best similarity = {best_score:.4f}, Threshold = {thresh:.2f}, Verified = {is_matched}")

        return {
            "verified": is_matched,
            "confidence": max(0.0, best_score),
            "matched_user_id": best_match.get("id") if (is_matched and best_match) else None,
            "status": "VERIFIED" if is_matched else "MISMATCH",
            "threshold": thresh
        }

    def verify(self, image_data: str, candidate_embeddings: list):
        """
        Compares live face embedding against a list of candidate embeddings.
        """
        result = self.extract_embedding(image_data)
        if "error" in result:
            return result

        return self.compare_embedding(result["embedding"], candidate_embeddings)
