import time
import cv2
import numpy as np
import base64
from ..landmarks.extractor import LandmarkExtractor
from ..drawing.mesh_drawer import MeshDrawer

class FaceMeshService:
    def __init__(self):
        self.extractor = LandmarkExtractor()

    def process_frame(self, image_data: str, show_mesh: bool = True, show_dots: bool = True) -> dict:
        """
        Receives base64 image, extracts 68 landmarks, optionally draws mesh, and returns result.
        """
        start_time = time.time()

        if ',' in image_data:
            image_data = image_data.split(',')[1]

        try:
            img_bytes = base64.b64decode(image_data)
            np_arr = np.frombuffer(img_bytes, np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        except Exception as e:
            return {"error": "Failed to decode image data: " + str(e)}

        if frame is None:
            return {"error": "Failed to decode frame"}

        # Extract landmarks
        result = self.extractor.extract(frame)
        
        processing_time_ms = int((time.time() - start_time) * 1000)
        result["processing_time_ms"] = processing_time_ms

        if result.get("face_detected"):
            # Draw mesh if requested
            annotated_frame = MeshDrawer.draw(frame, result["landmarks"], show_mesh, show_dots)
            
            # Encode back to base64
            _, buffer = cv2.imencode('.jpg', annotated_frame)
            encoded_image = base64.b64encode(buffer).decode('utf-8')
            
            result["annotated_image"] = "data:image/jpeg;base64," + encoded_image

        return result
