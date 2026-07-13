"""
Pose Visualizer – TrueView AI

Draws coordinate axes (3D Pose Axis) on the user's face, highlights the 6 reference landmarks,
and adds text overlays showing pitch, yaw, roll, orientation, stability, and attention.
"""

import cv2
import numpy as np
from ..utils.constants import (
    VIS_COLORS,
    VIS_AXIS_LENGTH,
    VIS_LINE_THICKNESS,
    VIS_DOT_RADIUS
)

class PoseVisualizer:
    """
    OpenCV drawing utility to overlay 3D head pose axes and text metrics on image frames.
    """
    
    @staticmethod
    def draw_pose(
        image: np.ndarray,
        rvec: np.ndarray,
        tvec: np.ndarray,
        camera_matrix: np.ndarray,
        dist_coeffs: np.ndarray,
        reference_points_2d: list,
        pitch: float,
        yaw: float,
        roll: float,
        orientation: str,
        attention_result: dict
    ) -> np.ndarray:
        """
        Draw 3D coordinate axis overlay and metrics on image frame.
        """
        canvas = image.copy()
        h, w = canvas.shape[:2]
        
        # ── Step 1: Draw reference landmark points ──
        for pt in reference_points_2d:
            cv2.circle(
                canvas, 
                (int(pt[0]), int(pt[1])), 
                VIS_DOT_RADIUS, 
                VIS_COLORS["reference_dots"], 
                -1
            )
            
        # ── Step 2: Project and Draw 3D Axes on Nose Tip ──
        # Nose tip is the origin (0,0,0) in our 3D model
        # Axis lines: 
        # - X axis (Pitch) points right (Red)
        # - Y axis (Yaw) points down (Green)
        # - Z axis (Roll) points forward/out (Blue)
        axis_3d = np.array([
            (VIS_AXIS_LENGTH, 0.0, 0.0),    # X axis endpoint
            (0.0, VIS_AXIS_LENGTH, 0.0),    # Y axis endpoint
            (0.0, 0.0, VIS_AXIS_LENGTH),    # Z axis endpoint
            (0.0, 0.0, 0.0)                 # Origin (nose tip)
        ], dtype=np.float64)
        
        # Project 3D points to 2D screen coordinates
        imgpts, _ = cv2.projectPoints(
            axis_3d, 
            rvec, 
            tvec, 
            camera_matrix, 
            dist_coeffs
        )
        
        # Extract 2D projected points
        pt_x = tuple(map(int, imgpts[0].ravel()))
        pt_y = tuple(map(int, imgpts[1].ravel()))
        pt_z = tuple(map(int, imgpts[2].ravel()))
        origin = tuple(map(int, imgpts[3].ravel()))
        
        # Draw Axis Lines
        cv2.line(canvas, origin, pt_x, VIS_COLORS["axis_x"], VIS_LINE_THICKNESS)
        cv2.line(canvas, origin, pt_y, VIS_COLORS["axis_y"], VIS_LINE_THICKNESS)
        cv2.line(canvas, origin, pt_z, VIS_COLORS["axis_z"], VIS_LINE_THICKNESS)
        
        # Draw origin highlight
        cv2.circle(canvas, origin, 4, (255, 255, 255), -1)
        
        # ── Step 3: Draw Head Direction Vector (Nose direction line) ──
        # Project a longer Z axis representing gaze/pointing direction
        gaze_axis_3d = np.array([
            (0.0, 0.0, VIS_AXIS_LENGTH * 2.0),
            (0.0, 0.0, 0.0)
        ], dtype=np.float64)
        
        gaze_pts, _ = cv2.projectPoints(
            gaze_axis_3d, 
            rvec, 
            tvec, 
            camera_matrix, 
            dist_coeffs
        )
        gaze_end = tuple(map(int, gaze_pts[0].ravel()))
        
        # Draw dotted or dashed line for gaze extension
        cv2.arrowedLine(
            canvas, 
            origin, 
            gaze_end, 
            (255, 255, 0),  # Cyan-yellow
            1, 
            tipLength=0.2
        )
        
        # ── Step 4: Draw Metrics Overlay Block ──
        # Color status based on attention
        attn_status = attention_result.get("attention_status", "focused")
        if attn_status == "focused":
            status_color = VIS_COLORS["status_ok"]
        elif attn_status == "distracted":
            status_color = VIS_COLORS["status_warning"]
        else:
            status_color = VIS_COLORS["status_danger"]
            
        # Draw background container
        cv2.rectangle(canvas, (10, 10), (250, 150), VIS_COLORS["box_bg"], -1)
        cv2.rectangle(canvas, (10, 10), (250, 150), (100, 100, 100), 1)
        
        # Render Text Info
        font = cv2.FONT_HERSHEY_SIMPLEX
        cv2.putText(canvas, f"Pitch: {pitch:+.1f} deg", (20, 32), font, 0.45, VIS_COLORS["overlay_text"], 1)
        cv2.putText(canvas, f"Yaw:   {yaw:+.1f} deg", (20, 52), font, 0.45, VIS_COLORS["overlay_text"], 1)
        cv2.putText(canvas, f"Roll:  {roll:+.1f} deg", (20, 72), font, 0.45, VIS_COLORS["overlay_text"], 1)
        cv2.putText(canvas, f"Dir:   {orientation}", (20, 95), font, 0.45, status_color, 1)
        cv2.putText(canvas, f"Status: {attn_status.upper()}", (20, 115), font, 0.45, status_color, 1)
        
        stability = attention_result.get("head_stability", "High")
        cv2.putText(canvas, f"Stability: {stability}", (20, 135), font, 0.45, VIS_COLORS["overlay_text"], 1)
        
        # Draw continuous focus feedback (color indicator dot in top-right)
        cv2.circle(canvas, (w - 20, 20), 8, status_color, -1)
        cv2.circle(canvas, (w - 20, 20), 11, status_color, 1)
        
        return canvas
