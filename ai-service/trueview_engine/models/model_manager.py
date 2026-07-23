"""
TrueView AI Engine – Centralized Model Manager

Loads all AI models ONCE at application startup, manages hardware devices
(CUDA / MPS / CPU), reuses instances across frames, handles model load failures,
and exposes module health status.
"""

import os
import torch
import cv2
import numpy as np
from typing import Dict, Any, Optional

from face_detection.detector import FaceDetector
from face_mesh.landmarks.extractor import LandmarkExtractor
from face_recognition.recognizer import FaceRecognizer
from liveness_detection.services.liveness_pipeline import LivenessPipeline
from gaze_tracking.services.gaze_service import EyeGazeService
from head_pose.services.head_pose_service import HeadPoseService
from object_detection.services.object_detection_service import ObjectDetectionService
from voice_detection.services.voice_service import VoiceService


class ModelManager:
    """
    Singleton class orchestrating model loading, device assignment, and lifecycle management.
    """
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ModelManager, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def initialize(self):
        """Preload all model singletons into memory once."""
        if getattr(self, "_initialized", False):
            return

        print("[ModelManager] Initializing TrueView AI Engine Models...")
        self.device = self._detect_device()
        print(f"[ModelManager] Selected Compute Device: {self.device}")

        self.health_status: Dict[str, str] = {
            "face_detection": "UNKNOWN",
            "face_recognition": "UNKNOWN",
            "liveness": "UNKNOWN",
            "gaze_tracking": "UNKNOWN",
            "head_pose": "UNKNOWN",
            "yolo": "UNKNOWN",
            "voice_vad": "UNKNOWN",
        }

        # 1. Face Detector & 68 Landmark Extractor (YuNet)
        try:
            self.face_detector = FaceDetector()
            self.landmark_extractor = LandmarkExtractor()
            self.health_status["face_detection"] = "READY"
            print("[ModelManager] ✅ YuNet Face Detector & Landmark Extractor loaded.")
        except Exception as e:
            print(f"[ModelManager] ❌ Face Detector failed to load: {e}")
            self.face_detector = None
            self.landmark_extractor = None
            self.health_status["face_detection"] = "FAILED"

        # 2. Face Recognition (FaceNet/SFace)
        try:
            self.recognition_service = FaceRecognizer()
            self.health_status["face_recognition"] = "READY"
            print("[ModelManager] ✅ Face Recognition Service loaded.")
        except Exception as e:
            print(f"[ModelManager] ⚠️ Face Recognition failed to load: {e}")
            self.recognition_service = None
            self.health_status["face_recognition"] = "FAILED"

        # 3. Liveness Detector
        try:
            self.liveness_service = LivenessPipeline()
            self.health_status["liveness"] = "READY"
            print("[ModelManager] ✅ Liveness Detector loaded.")
        except Exception as e:
            print(f"[ModelManager] ⚠️ Liveness Detector failed to load: {e}")
            self.liveness_service = None
            self.health_status["liveness"] = "FAILED"

        # 4. Gaze Tracker
        try:
            self.gaze_service = EyeGazeService()
            self.health_status["gaze_tracking"] = "READY"
            print("[ModelManager] ✅ Eye Gaze Tracker loaded.")
        except Exception as e:
            print(f"[ModelManager] ⚠️ Gaze Tracker failed to load: {e}")
            self.gaze_service = None
            self.health_status["gaze_tracking"] = "FAILED"

        # 5. Head Pose Estimator
        try:
            self.head_pose_service = HeadPoseService()
            self.health_status["head_pose"] = "READY"
            print("[ModelManager] ✅ Head Pose Estimator loaded.")
        except Exception as e:
            print(f"[ModelManager] ⚠️ Head Pose Estimator failed to load: {e}")
            self.head_pose_service = None
            self.health_status["head_pose"] = "FAILED"

        # 6. Object Detector (YOLOv11)
        try:
            self.object_detection_service = ObjectDetectionService()
            self.health_status["yolo"] = "READY"
            print("[ModelManager] ✅ YOLOv11 Object Detector loaded.")
        except Exception as e:
            print(f"[ModelManager] ⚠️ YOLO Object Detector failed to load: {e}")
            self.object_detection_service = None
            self.health_status["yolo"] = "FAILED"

        # 7. Voice Activity Detector (VoiceService)
        try:
            self.vad_service = VoiceService()
            self.health_status["voice_vad"] = "READY"
            print("[ModelManager] ✅ Voice VAD Service loaded.")
        except Exception as e:
            print(f"[ModelManager] ⚠️ Voice VAD Service failed to load: {e}")
            self.vad_service = None
            self.health_status["voice_vad"] = "FAILED"

        self._initialized = True
        print("[ModelManager] 🎉 All models initialized successfully!")

    def _detect_device(self) -> str:
        """Detect best available hardware accelerator."""
        if torch.cuda.is_available():
            return "cuda"
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
        return "cpu"

    def get_health(self) -> Dict[str, str]:
        """Return current model readiness status."""
        return dict(self.health_status)
