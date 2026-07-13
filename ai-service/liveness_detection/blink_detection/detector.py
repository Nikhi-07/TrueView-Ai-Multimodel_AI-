import cv2
import numpy as np

class BlinkDetector:
    def __init__(self):
        # Cache for running average of eye standard deviation to adapt to lighting
        self.session_history = {} # session_id -> { "left_std_avg": float, "right_std_avg": float, "eye_closed": bool, "blink_count": int, "last_blink_time": float }
        
    def process(self, session_id: str, frame: np.ndarray, face_landmarks: np.ndarray) -> dict:
        """
        Detects eye blink using standard deviation drop in the cropped eye region.
        face_landmarks: array containing [right_eye_x, right_eye_y, left_eye_x, left_eye_y, ...]
        """
        # Initialize session state if not present
        if session_id not in self.session_history:
            self.session_history[session_id] = {
                "left_std_avg": -1.0,
                "right_std_avg": -1.0,
                "eye_closed": False,
                "blink_count": 0,
                "last_blink_time": 0.0
            }
            
        state = self.session_history[session_id]
        
        # Landmarks: SFace/YuNet output format
        # face_landmarks format: [x1, y1, w, h, x_re, y_re, x_le, y_le, x_nt, y_nt, x_rcm, y_rcm, x_lcm, y_lcm, score]
        # Right Eye is at indexes 4, 5. Left Eye is at indexes 6, 7.
        re_x, re_y = int(face_landmarks[4]), int(face_landmarks[5])
        le_x, le_y = int(face_landmarks[6]), int(face_landmarks[7])
        
        # Calculate eye crop bounding boxes
        h, w = frame.shape[:2]
        crop_size = 24
        
        re_x1, re_x2 = max(0, re_x - crop_size), min(w, re_x + crop_size)
        re_y1, re_y2 = max(0, re_y - crop_size), min(h, re_y + crop_size)
        
        le_x1, le_x2 = max(0, le_x - crop_size), min(w, le_x + crop_size)
        le_y1, le_y2 = max(0, le_y - crop_size), min(h, le_y + crop_size)
        
        # Extract eye patches and convert to gray
        re_patch = cv2.cvtColor(frame[re_y1:re_y2, re_x1:re_x2], cv2.COLOR_BGR2GRAY)
        le_patch = cv2.cvtColor(frame[le_y1:le_y2, le_x1:le_x2], cv2.COLOR_BGR2GRAY)
        
        if re_patch.size == 0 or le_patch.size == 0:
            return {"blink_count": state["blink_count"], "eye_closed": False}
            
        # Calculate standard deviation of intensities (contrast metric)
        re_std = float(np.std(re_patch))
        le_std = float(np.std(le_patch))
        
        # Initialize running average if it's the first time
        if state["left_std_avg"] < 0:
            state["left_std_avg"] = le_std
            state["right_std_avg"] = re_std
            return {"blink_count": 0, "eye_closed": False}
            
        # Update running average slowly (only when eyes are open to avoid corrupting average)
        if not state["eye_closed"]:
            state["left_std_avg"] = 0.95 * state["left_std_avg"] + 0.05 * le_std
            state["right_std_avg"] = 0.95 * state["right_std_avg"] + 0.05 * re_std
            
        # Detect drop in standard deviation (indicating closed eyes - lower contrast/texture)
        # Typically standard deviation drops by 20-30% when eyelids cover the pupils.
        le_drop = le_std < (state["left_std_avg"] * 0.78)
        re_drop = re_std < (state["right_std_avg"] * 0.78)
        
        currently_closed = le_drop or re_drop
        
        # Blink counting state machine
        if currently_closed and not state["eye_closed"]:
            # Transition to closed
            state["eye_closed"] = True
        elif not currently_closed and state["eye_closed"]:
            # Transition back to open -> Blink detected!
            state["eye_closed"] = False
            state["blink_count"] += 1
            state["last_blink_time"] = cv2.getTickCount() / cv2.getTickFrequency()
            
        return {
            "blink_count": state["blink_count"],
            "eye_closed": state["eye_closed"],
            "left_std": le_std,
            "right_std": re_std,
            "left_std_avg": state["left_std_avg"],
            "right_std_avg": state["right_std_avg"]
        }
