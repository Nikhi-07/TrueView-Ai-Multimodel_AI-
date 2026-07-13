import cv2
import numpy as np
import os
import base64
import time

class FaceRecognizer:
    def __init__(self):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        # SFace model path
        model_path = os.path.join(base_dir, "..", "face_detection", "models", "face_recognition_sface_2021dec.onnx")
        # YuNet model path (needed to initialize the detector for alignment)
        yunet_path = os.path.join(base_dir, "..", "face_detection", "models", "face_detection_yunet_2023mar.onnx")

        self.detector = cv2.FaceDetectorYN.create(
            model=yunet_path,
            config="",
            input_size=(320, 320),
            score_threshold=0.6,
            nms_threshold=0.3,
            top_k=5000
        )
        
        self.recognizer = cv2.FaceRecognizerSF.create(
            model=model_path,
            config=""
        )

        # Threshold for SFace Cosine similarity (typically 0.36 is standard for SFace)
        self.cosine_threshold = 0.36

    def extract_embedding(self, image_data: str):
        """
        Detects, aligns, and extracts the 128-D embedding from the first face found.
        """
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

        (h, w) = frame.shape[:2]
        self.detector.setInputSize((w, h))
        
        # Detect faces
        _, faces_data = self.detector.detect(frame)
        
        if faces_data is None or len(faces_data) == 0:
            return {"error": "No face detected in the image"}
            
        if len(faces_data) > 1:
            return {"error": "Multiple faces detected. Please capture only one face."}

        # Align the first face
        face = faces_data[0]
        aligned_face = self.recognizer.alignCrop(frame, face)
        
        # Extract features (embedding)
        embedding = self.recognizer.feature(aligned_face)
        
        # SFace produces a 128-D float vector. Let's convert it to a standard Python list.
        embedding_list = embedding.flatten().tolist()
        
        return {
            "embedding": embedding_list,
            "face_detected": True
        }

    def verify(self, image_data: str, candidate_embeddings: list):
        """
        Compares live face embedding against a list of candidate embeddings.
        candidate_embeddings: list of dicts like [{"id": "user1", "embedding": [...]}]
        """
        result = self.extract_embedding(image_data)
        if "error" in result:
            return result
            
        live_embedding = np.array(result["embedding"], dtype=np.float32)
        
        best_match = None
        best_score = -1.0
        
        for candidate in candidate_embeddings:
            cand_emb = np.array(candidate["embedding"], dtype=np.float32)
            
            # Compute cosine similarity
            dot_product = np.dot(live_embedding, cand_emb)
            norm_live = np.linalg.norm(live_embedding)
            norm_cand = np.linalg.norm(cand_emb)
            
            if norm_live == 0 or norm_cand == 0:
                continue
                
            similarity = dot_product / (norm_live * norm_cand)
            
            if similarity > best_score:
                best_score = float(similarity)
                best_match = candidate
                
        # Verification passes if similarity is above the threshold
        is_matched = best_score >= self.cosine_threshold
        
        return {
            "verified": is_matched,
            "confidence": best_score,
            "matched_user_id": best_match["id"] if (is_matched and best_match) else None,
            "status": "Verified" if is_matched else ("Unknown User" if best_score > 0 else "No Match")
        }
