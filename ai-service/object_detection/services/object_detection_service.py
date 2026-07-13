"""
Object Detection Service – TrueView AI

Coordinates the environment proctoring pipeline:
Base64 decode -> YOLO Detection -> Persistent ID Tracking ->
Acoustic and Environment Monitoring -> Bounding Box Annotation -> Response output.
"""

import time
import cv2
import numpy as np
import base64

from object_detection.detection.yolo_detector import YoloDetector
from object_detection.tracking.object_tracker import ObjectTracker
from object_detection.services.environment_monitor import EnvironmentMonitor
from object_detection.services.detection_visualizer import DetectionVisualizer

class ObjectDetectionService:
    """
    Orchestrator linking model, tracker, and visual overlay generators.
    """
    
    def __init__(self):
        self.detector = YoloDetector()
        self.tracker = ObjectTracker()
        self.monitor = EnvironmentMonitor()
        self.visualizer = DetectionVisualizer()
        
    def process_frame(self, image_data: str, draw_overlay: bool = True) -> dict:
        """
        Process single base64 video frame through the YOLO tracking pipeline.
        
        Args:
            image_data: Base64 JPEG frame data
            draw_overlay: True to render bounding boxes and alerts
            
        Returns:
            dict containing details of all tracked objects, environment summary metrics,
            optional base64 annotated image, and performance latency.
        """
        start_time = time.time()
        
        # 1. Decode Image
        frame = self._decode_image(image_data)
        if frame is None:
            return {"error": "Failed to decode frame data"}
            
        # 2. Run YOLO Detection & Tracking
        detections = self.detector.detect_and_track(frame)
        
        # 3. Enrich with Persistence Track History
        tracked_detections = self.tracker.update_tracks(detections)
        
        # 4. Analyze Environment Status
        env_summary = self.monitor.monitor_environment(tracked_detections)
        
        # 5. Draw Visual Overlay
        annotated_image_b64 = None
        if draw_overlay:
            annotated_frame = self.visualizer.draw_detections(
                frame, 
                tracked_detections, 
                env_summary
            )
            _, buffer = cv2.imencode('.jpg', annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            annotated_image_b64 = "data:image/jpeg;base64," + base64.b64encode(buffer).decode('utf-8')
            
        processing_time_ms = int((time.time() - start_time) * 1000)
        
        return {
            "objects_detected": len(tracked_detections),
            "detections": tracked_detections,
            "summary": env_summary,
            "annotated_image": annotated_image_b64,
            "processing_time_ms": processing_time_ms
        }
        
    def reset_session(self):
        """Reset internal tracking histories."""
        self.tracker.reset()
        
    @staticmethod
    def _decode_image(image_data: str) -> np.ndarray | None:
        """Decode base64 string to BGR OpenCV image."""
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        try:
            img_bytes = base64.b64decode(image_data)
            np_arr = np.frombuffer(img_bytes, np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            return frame
        except Exception:
            return None
