import cv2
import numpy as np

class MotionDetector:
    def __init__(self):
        self.session_history = {} # session_id -> { "prev_gray_face": np.ndarray, "prev_landmarks": np.ndarray, "motion_accumulator": float }

    def process(self, session_id: str, frame: np.ndarray, face_box: dict, face_landmarks: np.ndarray) -> dict:
        """
        Processes motion analysis on the face region.
        """
        if session_id not in self.session_history:
            self.session_history[session_id] = {
                "prev_gray_face": None,
                "prev_landmarks": None,
                "motion_score": 0.0
            }

        state = self.session_history[session_id]

        # Extract face crop
        x, y, w, h = face_box["x"], face_box["y"], face_box["width"], face_box["height"]
        fh, fw = frame.shape[:2]
        
        # Clamp coordinates
        x1, y1 = max(0, x), max(0, y)
        x2, y2 = min(fw, x + w), min(fh, y + h)
        
        face_crop = frame[y1:y2, x1:x2]
        if face_crop.size == 0:
            return {"motion_score": 0.0}

        # Convert to grayscale and resize to a standard size for comparison
        gray_face = cv2.cvtColor(cv2.resize(face_crop, (100, 100)), cv2.COLOR_BGR2GRAY)
        
        # landmarks right_eye, left_eye, nose_tip
        nose_x, nose_y = face_landmarks[8], face_landmarks[9]
        current_landmarks = np.array([nose_x, nose_y])

        motion_score = 0.0
        landmark_drift = 0.0

        if state["prev_gray_face"] is not None:
            # Calculate frame difference (pixel-level motion)
            diff = cv2.absdiff(gray_face, state["prev_gray_face"])
            motion_score = float(np.mean(diff)) # average pixel intensity change
            
            # Calculate landmark movement
            if state["prev_landmarks"] is not None:
                landmark_drift = float(np.linalg.norm(current_landmarks - state["prev_landmarks"]))

        # Save state
        state["prev_gray_face"] = gray_face
        state["prev_landmarks"] = current_landmarks
        
        # Exponential moving average of the motion score to smooth it out
        state["motion_score"] = 0.8 * state["motion_score"] + 0.2 * motion_score

        return {
            "motion_score": state["motion_score"],
            "landmark_drift": landmark_drift
        }
