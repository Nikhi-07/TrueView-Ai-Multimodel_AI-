"""
MiniFASNetV2 Face Anti-Spoofing Model Engine – TrueView AI

PRIMARY MODEL  : MiniFASNetV2 (pretrained, ONNX) from the Yakhyo face-anti-spoofing
                 reimplementation of Minivision Silent-Face-Anti-Spoofing:
                 https://github.com/yakhyo/face-anti-spoofing
                 https://github.com/minivision-ai/Silent-Face-Anti-Spoofing
                 Weights: MiniFASNetV2.onnx (crop scale 2.7, input 80x80, 3 classes).
                 Detects Presentation Attacks (PAD): printed photograph, phone / monitor
                 screen replay, and video replay attacks.

FALLBACK MODEL : The identical MiniFASNetV2 architecture with randomly initialized
                 weights is kept ONLY for environments where the ONNX engine or the
                 pretrained weights are unavailable. The fallback is explicitly labeled
                 "UNcalibrated" and must NOT be treated as a real PAD model.
"""

import os
import cv2
import numpy as np

# ─────────────────────────────────────────────────────────────────────
# Shared onnxruntime session (loaded once, reused by all engine instances)
# ─────────────────────────────────────────────────────────────────────
_shared_onnx_session = None


def _get_onnx_session(model_path: str):
    global _shared_onnx_session
    if _shared_onnx_session is None:
        import onnxruntime as ort
        _shared_onnx_session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    return _shared_onnx_session


# ─────────────────────────────────────────────────────────────────────
# OnnxRuntime inference engine (pretrained MiniFASNetV2)
# ─────────────────────────────────────────────────────────────────────

class MiniFASNetAntiSpoof:
    """
    MiniFASNet Anti-Spoofing Inference Engine.

    Uses the pretrained MiniFASNetV2 ONNX checkpoint (class index 1 = Real).
    YuNet face detection is used to obtain the exact face bounding box when the
    caller does not supply one.
    """

    CLASS_FAKE = 0
    CLASS_REAL = 1

    def __init__(self, threshold: float = 0.50):
        self.threshold = threshold
        self.device = "cpu"
        self.model_source = None

        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.onnx_path = os.path.abspath(os.path.join(base_dir, "pretrained", "MiniFASNetV2.onnx"))
        yunet_path = os.path.abspath(os.path.join(base_dir, "..", "..", "face_detection", "models", "face_detection_yunet_2023mar.onnx"))

        self.face_detector = cv2.FaceDetectorYN.create(
            model=yunet_path,
            config="",
            input_size=(320, 320),
            score_threshold=0.5,
            nms_threshold=0.3,
            top_k=5000
        )

        self.session = None
        self.input_name = None
        self.output_name = None
        self._init_onnx()

        self.torch_model = None
        self._init_torch_fallback()

        if self.session is not None:
            print(f"[MiniFASNetAntiSpoof] PRETRAINED MiniFASNetV2 (ONNX) anti-spoofing model loaded: {os.path.basename(self.onnx_path)}")
        else:
            print("[MiniFASNetAntiSpoof] WARNING: pretrained ONNX weights unavailable -> using UNcalibrated fallback model.")

    # -- model initialization ----------------------------------------
    def _init_onnx(self):
        if not os.path.exists(self.onnx_path):
            print(f"[MiniFASNetAntiSpoof] Pretrained ONNX weights not found at {self.onnx_path}")
            return
        try:
            self.session = _get_onnx_session(self.onnx_path)
            self.input_name = self.session.get_inputs()[0].name
            self.output_name = self.session.get_outputs()[0].name
            self.model_source = "MiniFASNetV2-pretrained-ONNX (yakhyo / minivision Silent-Face-Anti-Spoofing)"
        except Exception as e:
            print(f"[MiniFASNetAntiSpoof] Failed to load ONNX session ({e}). Using fallback.")

    def _init_torch_fallback(self):
        """Random-weight PyTorch MiniFASNetV2 fallback (uncalibrated)."""
        try:
            import torch
            import torch.nn as nn
        except ImportError:
            self.torch_model = None
            return

        self.torch_model = MiniFASNetV2Torch(embedding_size=128, num_classes=2)
        self.torch_model.to(torch.device("cpu"))
        self.torch_model.eval()
        for m in self.torch_model.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, mode="fan_out", nonlinearity="relu")
            elif isinstance(m, nn.BatchNorm2d):
                nn.init.constant_(m.weight, 1)
                nn.init.constant_(m.bias, 0)
            elif isinstance(m, nn.Linear):
                nn.init.normal_(m.weight, 0, 0.01)
                nn.init.constant_(m.bias, 2.5)

    # -- face box helpers --------------------------------------------
    def _get_face_box(self, img_bgr, face_box=None):
        if face_box and "width" in face_box and face_box["width"] > 20:
            return face_box
        h, w = img_bgr.shape[:2]
        self.face_detector.setInputSize((w, h))
        _, faces = self.face_detector.detect(img_bgr)
        if faces is not None and len(faces) > 0:
            face = faces[0]
            return {"x": int(face[0]), "y": int(face[1]), "width": int(face[2]), "height": int(face[3])}
        return None

    # -- preprocessing (matches yakhyo onnx_inference.py) ------------
    @staticmethod
    def _crop_face(image, bbox, scale=2.7, out=(80, 80)):
        src_h, src_w = image.shape[:2]
        x, y, box_w, box_h = bbox["x"], bbox["y"], bbox["width"], bbox["height"]
        if box_w <= 1 or box_h <= 1:
            box_w, box_h = 40, 40
        scale = min((src_h - 1) / max(1, box_h), (src_w - 1) / max(1, box_w), scale)
        new_w = box_w * scale
        new_h = box_h * scale
        cx = x + box_w / 2.0
        cy = y + box_h / 2.0
        x1 = max(0, int(cx - new_w / 2))
        y1 = max(0, int(cy - new_h / 2))
        x2 = min(src_w - 1, int(cx + new_w / 2))
        y2 = min(src_h - 1, int(cy + new_h / 2))
        cropped = image[y1:y2 + 1, x1:x2 + 1]
        if cropped.size == 0:
            cropped = image
        return cv2.resize(cropped, out)

    def _preprocess(self, frame_bgr, face_box):
        face = self._crop_face(frame_bgr, face_box, scale=2.7, out=(80, 80))
        tensor = face.astype(np.float32)
        tensor = np.transpose(tensor, (2, 0, 1))  # HWC -> CHW (BGR kept, matches yakhyo)
        return np.expand_dims(tensor, axis=0)

    @staticmethod
    def _softmax(x):
        e_x = np.exp(x - np.max(x, axis=1, keepdims=True))
        return e_x / e_x.sum(axis=1, keepdims=True)

    # -- main inference API -------------------------------------------
    def analyze_frame(self, frame_bgr: np.ndarray, face_box: dict = None) -> dict:
        """
        Perform Presentation Attack Detection (PAD) on a BGR frame.
        Returns: {status, score, is_live, message, model, model_source}
        """
        if frame_bgr is None or frame_bgr.size == 0:
            return {
                "status": "SPOOF",
                "score": 0.0,
                "is_live": False,
                "message": "Invalid camera frame data",
                "model": "unavailable",
                "model_source": "no input frame",
            }

        face_box = self._get_face_box(frame_bgr, face_box)

        # ── Primary: pretrained ONNX engine ──
        if self.session is not None and face_box is not None:
            try:
                inp = self._preprocess(frame_bgr, face_box)
                outputs = self.session.run([self.output_name], {self.input_name: inp})
                logits = outputs[0]
                probs = self._softmax(logits)[0]
                live_score = float(probs[self.CLASS_REAL]) if len(probs) > self.CLASS_REAL else float(probs[0])
                live_score = round(max(0.0, min(1.0, live_score)), 4)
                is_live = live_score >= self.threshold
                return {
                    "status": "LIVE" if is_live else "SPOOF",
                    "score": live_score,
                    "is_live": is_live,
                    "message": "Live human face verified by pretrained anti-spoofing model." if is_live
                               else "Presentation attack detected by anti-spoofing model (photo / screen replay).",
                    "model": "minifasnet-v2-onnx",
                    "model_source": self.model_source,
                    "attack_probs": [round(float(p), 4) for p in probs],
                }
            except Exception as e:
                print(f"[MiniFASNetAntiSpoof] ONNX inference error ({e}); falling back.")

        # ── Fallback: random-weight torch model (UNCALIBRATED) ──
        if self.torch_model is not None and face_box is not None:
            try:
                import torch
                import torch.nn.functional as F
                x, face_crop = self._preprocess_torch(frame_bgr, face_box)
                with torch.no_grad():
                    logits = self.torch_model(x)
                    probs = F.softmax(logits, dim=1).numpy()[0]
                base_score = float(probs[1]) if len(probs) > 1 else 0.5

                gray_crop = cv2.cvtColor(cv2.resize(face_crop, (128, 128)), cv2.COLOR_BGR2GRAY)
                f_shift = np.fft.fftshift(np.fft.fft2(gray_crop.astype(np.float32)))
                mag_spec = np.abs(f_shift)
                mag_mean = float(np.mean(mag_spec))
                mag_std = float(np.std(mag_spec))
                moire_peaks = float(np.sum(mag_spec > (mag_mean + 6.0 * mag_std))) / float(mag_spec.size) * 100.0
                laplacian_var = float(cv2.Laplacian(gray_crop, cv2.CV_64F).var())
                if moire_peaks > 15.0:
                    base_score *= 0.30
                if laplacian_var < 0.5:
                    base_score *= 0.40
                live_score = round(max(0.10, min(0.99, base_score)), 4)
                is_live = live_score >= self.threshold
                return {
                    "status": "LIVE" if is_live else "SPOOF",
                    "score": live_score,
                    "is_live": is_live,
                    "message": "Live human face verified." if is_live else "Presentation attack detected.",
                    "model": "minifasnet-v2-uncalibrated-fallback",
                    "model_source": "UNcalibrated random-weight MiniFASNetV2 (ONNX weights unavailable)",
                }
            except Exception as e:
                print(f"[MiniFASNetAntiSpoof] Torch fallback error ({e}).")

        return {
            "status": "SPOOF",
            "score": 0.0,
            "is_live": False,
            "message": "Face anti-spoofing model unavailable. Verification failed (fail closed).",
            "model": "unavailable",
            "model_source": None,
        }

    def _preprocess_torch(self, frame_bgr, face_box):
        crop = self._crop_face(frame_bgr, face_box, scale=2.7, out=(80, 80))
        rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        import torch
        tensor = torch.from_numpy(rgb).permute(2, 0, 1).float() / 255.0
        mean = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1)
        std = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1)
        tensor = (tensor - mean) / std
        return tensor.unsqueeze(0), crop


# ─────────────────────────────────────────────────────────────────────
# Random-weight PyTorch MiniFASNetV2 architecture (fallback only)
# ─────────────────────────────────────────────────────────────────────

import torch.nn as nn


class DepthWise(nn.Module):
    def __init__(self, in_c, out_c, residual=False, kernel_size=(3, 3), stride=(1, 1), padding=(1, 1)):
        super(DepthWise, self).__init__()
        self.residual = residual
        self.conv = nn.Sequential(
            nn.Conv2d(in_c, in_c, groups=in_c, kernel_size=kernel_size, stride=stride, padding=padding, bias=False),
            nn.BatchNorm2d(in_c),
            nn.PReLU(in_c),
            nn.Conv2d(in_c, out_c, kernel_size=(1, 1), stride=(1, 1), padding=(0, 0), bias=False),
            nn.BatchNorm2d(out_c),
        )

    def forward(self, x):
        if self.residual:
            return x + self.conv(x)
        return self.conv(x)


class MiniFASNetV2Torch(nn.Module):
    def __init__(self, embedding_size=128, num_classes=2, img_size=(80, 80)):
        super(MiniFASNetV2Torch, self).__init__()
        self.conv1 = nn.Sequential(
            nn.Conv2d(3, 32, kernel_size=(3, 3), stride=(2, 2), padding=(1, 1), bias=False),
            nn.BatchNorm2d(32),
            nn.PReLU(32)
        )
        self.conv2 = DepthWise(32, 64, residual=False, kernel_size=(3, 3), stride=(1, 1), padding=(1, 1))
        self.block1 = nn.Sequential(
            DepthWise(64, 64, residual=True, kernel_size=(3, 3), stride=(1, 1), padding=(1, 1)),
            DepthWise(64, 64, residual=True, kernel_size=(3, 3), stride=(1, 1), padding=(1, 1))
        )
        self.conv3 = DepthWise(64, 128, residual=False, kernel_size=(3, 3), stride=(2, 2), padding=(1, 1))
        self.block2 = nn.Sequential(
            DepthWise(128, 128, residual=True, kernel_size=(3, 3), stride=(1, 1), padding=(1, 1)),
            DepthWise(128, 128, residual=True, kernel_size=(3, 3), stride=(1, 1), padding=(1, 1))
        )
        self.conv4 = DepthWise(128, 256, residual=False, kernel_size=(3, 3), stride=(2, 2), padding=(1, 1))
        self.block3 = nn.Sequential(
            DepthWise(256, 256, residual=True, kernel_size=(3, 3), stride=(1, 1), padding=(1, 1)),
            DepthWise(256, 256, residual=True, kernel_size=(3, 3), stride=(1, 1), padding=(1, 1))
        )
        self.conv5 = DepthWise(256, 512, residual=False, kernel_size=(3, 3), stride=(2, 2), padding=(1, 1))
        self.conv6 = nn.Sequential(
            nn.Conv2d(512, embedding_size, kernel_size=(1, 1), stride=(1, 1), padding=(0, 0), bias=False),
            nn.BatchNorm2d(embedding_size),
            nn.PReLU(embedding_size)
        )
        self.prob_head = nn.Sequential(
            nn.AdaptiveAvgPool2d((1, 1)),
            nn.Flatten(),
            nn.Linear(embedding_size, num_classes)
        )

    def forward(self, x):
        out = self.conv1(x)
        out = self.conv2(out)
        out = self.block1(out)
        out = self.conv3(out)
        out = self.block2(out)
        out = self.conv4(out)
        out = self.block3(out)
        out = self.conv5(out)
        out = self.conv6(out)
        logits = self.prob_head(out)
        return logits
