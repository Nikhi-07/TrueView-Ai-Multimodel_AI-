import cv2
import numpy as np
import os
import base64
import time

class FaceDetector:
    def __init__(self):
        # Load the OpenCV YuNet face detection model
        base_dir = os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(base_dir, "models", "face_detection_yunet_2023mar.onnx")
        
        # Default input size, will dynamically resize during inference
        self.detector = cv2.FaceDetectorYN.create(
            model=model_path,
            config="",
            input_size=(320, 320),
            score_threshold=0.6,
            nms_threshold=0.3,
            top_k=5000
        )

    def detect(self, image_data: str):
        """
        Process base64 encoded image and return detected faces.
        """
        start_time = time.time()
        
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
        
        # Set input size for the current frame
        self.detector.setInputSize((w, h))
        
        # Detect faces
        # results is a tuple: (status, faces)
        _, faces_data = self.detector.detect(frame)
        
        faces = []
        
        if faces_data is not None:
            for face in faces_data:
                # face format: [x1, y1, w, h, x_re, y_re, x_le, y_le, x_nt, y_nt, x_rcm, y_rcm, x_lcm, y_lcm, score]
                # we just need bounding box (0:4) and score (-1)
                box = face[0:4].astype(int)
                score = float(face[-1])
                
                faces.append({
                    "confidence": score,
                    "box": {
                        "x": int(box[0]),
                        "y": int(box[1]),
                        "width": int(box[2]),
                        "height": int(box[3])
                    }
                })
                
        processing_time_ms = int((time.time() - start_time) * 1000)
        
        return {
            "faceCount": len(faces),
            "faces": faces,
            "timestamp": time.time(),
            "processingTimeMs": processing_time_ms,
            "imageWidth": w,
            "imageHeight": h
        }
