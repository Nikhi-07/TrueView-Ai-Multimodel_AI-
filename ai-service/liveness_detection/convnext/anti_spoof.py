"""
ConvNeXt-Tiny Multi-Task Anti-Spoofing Inference Engine – TrueView AI
Production Run 04 Checkpoint Integration.

Pipeline:
1. Camera frame (BGR)
2. YuNet face detection -> Bounding box (x, y, w, h)
3. 20% margin expanded crop -> BGR to RGB -> Resize (224, 224)
4. ImageNet Normalization: Mean [0.485, 0.456, 0.406], Std [0.229, 0.224, 0.225]
5. ConvNeXt-Tiny Dual-Head Inference (Binary 2-class + Aux 5-class)
6. Decision rule with calibrated threshold tau = 0.31:
   P_spoof = softmax(binary_logits)[1]
   LIVE  : P_spoof < 0.31  -> attack_type = "NONE"
   SPOOF : P_spoof >= 0.31 -> attack_type = argmax(aux_probs)
"""

import os
import cv2
import numpy as np
import torch
from typing import Optional, Dict, Any, Tuple

from .model import ConvNeXtMultiTaskModel


# ─────────────────────────────────────────────────────────────────────
# Shared Singleton Model Instance (Loaded once at startup)
# ─────────────────────────────────────────────────────────────────────
_shared_convnext_model: Optional[ConvNeXtMultiTaskModel] = None
_shared_device: Optional[torch.device] = None
_shared_detector: Optional[cv2.FaceDetectorYN] = None


def get_device() -> torch.device:
    """Returns CUDA device if available, otherwise CPU."""
    global _shared_device
    if _shared_device is None:
        _shared_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    return _shared_device


def get_shared_convnext_model(checkpoint_path: str) -> ConvNeXtMultiTaskModel:
    """Loads and caches the 334 MB ConvNeXt model once across the process."""
    global _shared_convnext_model
    if _shared_convnext_model is None:
        device = get_device()
        print(f"[ConvNeXtAntiSpoof] Loading Run 04 checkpoint on device: {device}...")
        _shared_convnext_model = ConvNeXtMultiTaskModel.load_from_checkpoint(
            checkpoint_path=checkpoint_path,
            device=device,
            num_classes=5
        )
        print(f"[ConvNeXtAntiSpoof] Successfully loaded Run 04 model: {os.path.basename(checkpoint_path)}")
    return _shared_convnext_model


class ConvNeXtAntiSpoof:
    """
    Production Run 04 ConvNeXt-Tiny Anti-Spoofing Inference Engine.
    Preserves complete compatibility with existing TrueView liveness workflows.
    """

    CLASS_REAL_IDX = 0
    CLASS_SPOOF_IDX = 1

    STANDARD_CLASSES = ["real", "print_attack", "replay_attack", "screen_attack", "mask_attack"]
    DEFAULT_THRESHOLD = 0.31  # Calibrated inference threshold tau for Run 04

    # ImageNet normalization parameters
    NORM_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 1, 3)
    NORM_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 1, 3)

    def __init__(self, threshold: float = DEFAULT_THRESHOLD, weights_path: Optional[str] = None):
        self.threshold = float(threshold)
        self.device = get_device()

        base_dir = os.path.dirname(os.path.abspath(__file__))
        if weights_path is None:
            self.weights_path = os.path.abspath(os.path.join(base_dir, "weights", "checkpoint_best.pth"))
        else:
            self.weights_path = os.path.abspath(weights_path)

        yunet_path = os.path.abspath(os.path.join(base_dir, "..", "..", "face_detection", "models", "face_detection_yunet_2023mar.onnx"))

        # Initialize YuNet detector
        global _shared_detector
        if _shared_detector is None and os.path.exists(yunet_path):
            _shared_detector = cv2.FaceDetectorYN.create(
                model=yunet_path,
                config="",
                input_size=(320, 320),
                score_threshold=0.5,
                nms_threshold=0.3,
                top_k=5000
            )
        self.face_detector = _shared_detector

        # Load PyTorch ConvNeXt-Tiny Multi-Task Model (singleton)
        self.model: Optional[ConvNeXtMultiTaskModel] = None
        self.model_source = "ConvNeXt-Tiny Multi-Task Dual-Head (Production Run 04)"
        self._init_model()

    def _init_model(self) -> None:
        """Loads model via singleton loader with robust error handling."""
        try:
            self.model = get_shared_convnext_model(self.weights_path)
        except Exception as e:
            print(f"[ConvNeXtAntiSpoof] CRITICAL: Failed to load ConvNeXt model ({e}).")
            self.model = None

    # ── Face Bounding Box Extraction ────────────────────────────────────
    def _get_face_box(self, img_bgr: np.ndarray, face_box: Optional[dict] = None) -> Optional[dict]:
        if face_box and "width" in face_box and face_box.get("width", 0) > 20:
            return face_box

        if self.face_detector is None or img_bgr is None or img_bgr.size == 0:
            return None

        h, w = img_bgr.shape[:2]
        self.face_detector.setInputSize((w, h))
        _, faces = self.face_detector.detect(img_bgr)
        if faces is not None and len(faces) > 0:
            face = faces[0]
            return {
                "x": int(face[0]),
                "y": int(face[1]),
                "width": int(face[2]),
                "height": int(face[3])
            }
        return None

    # ── Preprocessing (Matches Training FaceCropper & Transforms) ───────
    @classmethod
    def _crop_face_with_margin(
        cls,
        image_bgr: np.ndarray,
        bbox: Optional[dict],
        margin_ratio: float = 0.2,
        target_size: Tuple[int, int] = (224, 224)
    ) -> np.ndarray:
        """
        Crops facial region with 20% margin expansion matching training dataset.
        """
        img_h, img_w = image_bgr.shape[:2]

        if bbox is None or "width" not in bbox or bbox["width"] <= 1:
            # Fallback: Center crop
            crop_size = min(img_h, img_w)
            cy, cx = img_h // 2, img_w // 2
            y1 = max(0, cy - crop_size // 2)
            y2 = min(img_h, cy + crop_size // 2)
            x1 = max(0, cx - crop_size // 2)
            x2 = min(img_w, cx + crop_size // 2)
            cropped = image_bgr[y1:y2, x1:x2]
        else:
            x, y, w, h = bbox["x"], bbox["y"], bbox["width"], bbox["height"]
            margin_w = int(w * margin_ratio)
            margin_h = int(h * margin_ratio)

            x1 = max(0, x - margin_w)
            y1 = max(0, y - margin_h)
            x2 = min(img_w, x + w + margin_w)
            y2 = min(img_h, y + h + margin_h)
            cropped = image_bgr[y1:y2, x1:x2]

        if cropped is None or cropped.size == 0:
            cropped = image_bgr

        # Resize to (224, 224) with cubic interpolation matching training
        return cv2.resize(cropped, target_size, interpolation=cv2.INTER_CUBIC)

    def _preprocess_tensor(self, face_crop_bgr: np.ndarray) -> torch.Tensor:
        """
        Converts BGR face crop -> RGB -> [0, 1] float -> ImageNet Normalization -> torch Tensor [1, 3, 224, 224]
        """
        rgb = cv2.cvtColor(face_crop_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        normalized = (rgb - self.NORM_MEAN) / self.NORM_STD
        # HWC -> CHW
        tensor_np = np.transpose(normalized, (2, 0, 1)).astype(np.float32)
        tensor = torch.from_numpy(tensor_np).unsqueeze(0).to(self.device)
        return tensor

    # ── Main Inference API ──────────────────────────────────────────────
    def analyze_frame(self, frame_bgr: np.ndarray, face_box: Optional[dict] = None) -> Dict[str, Any]:
        """
        Performs Presentation Attack Detection (PAD) using ConvNeXt-Tiny Multi-Task Model.
        Returns standardized dictionary preserving TrueView API contracts.
        """
        if frame_bgr is None or frame_bgr.size == 0:
            return {
                "status": "SPOOF",
                "score": 0.0,
                "is_live": False,
                "message": "Invalid camera frame data",
                "model": "convnext-tiny-run04",
                "model_source": "no input frame",
                "attack_type": "UNKNOWN",
                "p_spoof": 1.0,
                "attack_probs": [0.0] * 5,
                "binary_probs": [0.0, 1.0]
            }

        if self.model is None:
            return {
                "status": "SPOOF",
                "score": 0.0,
                "is_live": False,
                "message": "ConvNeXt anti-spoofing model unavailable (fail closed).",
                "model": "unavailable",
                "model_source": None,
                "attack_type": "MODEL_UNAVAILABLE",
                "p_spoof": 1.0,
                "attack_probs": [0.0] * 5,
                "binary_probs": [0.0, 1.0]
            }

        detected_face_box = self._get_face_box(frame_bgr, face_box)
        face_crop = self._crop_face_with_margin(frame_bgr, detected_face_box, margin_ratio=0.2, target_size=(224, 224))

        try:
            tensor = self._preprocess_tensor(face_crop)
            with torch.no_grad():
                binary_logits, aux_logits = self.model(tensor)
                binary_probs = torch.softmax(binary_logits, dim=-1).squeeze(0).cpu().numpy()
                aux_probs = torch.softmax(aux_logits, dim=-1).squeeze(0).cpu().numpy()

            p_real = float(binary_probs[self.CLASS_REAL_IDX])
            p_spoof = float(binary_probs[self.CLASS_SPOOF_IDX])

            # Calibrated Decision Rule: LIVE when P_spoof < tau (0.31)
            is_live = bool(p_spoof < self.threshold)
            status = "LIVE" if is_live else "SPOOF"

            if is_live:
                attack_type = "NONE"
                message = "Live human face verified by ConvNeXt-Tiny anti-spoofing model."
            else:
                aux_pred_idx = int(np.argmax(aux_probs))
                attack_type = self.STANDARD_CLASSES[aux_pred_idx]
                formatted_attack = attack_type.replace("_", " ").title()
                message = f"Presentation attack detected ({formatted_attack}). Live human face required."

            live_score = round(max(0.0, min(1.0, p_real)), 4)

            return {
                "status": status,
                "score": live_score,
                "is_live": is_live,
                "message": message,
                "model": "convnext-tiny-run04",
                "model_source": self.model_source,
                "attack_type": attack_type,
                "p_spoof": round(p_spoof, 4),
                "threshold": self.threshold,
                "attack_probs": [round(float(p), 4) for p in aux_probs],
                "binary_probs": [round(float(p_real), 4), round(float(p_spoof), 4)],
                "device": str(self.device)
            }
        except Exception as e:
            print(f"[ConvNeXtAntiSpoof] Inference error: {e}")
            return {
                "status": "SPOOF",
                "score": 0.0,
                "is_live": False,
                "message": f"Anti-spoofing inference error: {str(e)}",
                "model": "convnext-tiny-run04",
                "model_source": self.model_source,
                "attack_type": "ERROR",
                "p_spoof": 1.0,
                "attack_probs": [0.0] * 5,
                "binary_probs": [0.0, 1.0]
            }
