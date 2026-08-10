# TrueView AI — AI Models

> Only models actually used by the implementation are documented. Optional
> models are explicitly marked **OPTIONAL** and are never claimed as active when
> unavailable.

## 1. MediaPipe Face Landmarker (client-side)

- **Purpose**: facial landmarks + `eyeBlinkLeft` / `eyeBlinkRight` blendshapes for the temporal blink detector; also powers face-mesh viewers.
- **Input**: live camera video (client browser).
- **Output**: 478 landmarks + ~52 blendshape coefficients per frame.
- **Framework/Version**: `@mediapipe/tasks-vision` 1.0.1 (bundled model).
- **Source**: https://github.com/google-ai-edge/mediapipe
- **License**: Apache-2.0.
- **Inference location**: **browser** (client hook `useFaceLandmarker.js`).
- **Performance**: measured end-to-end in demo runs; blendshape blink state machine runs per frame at camera FPS.
- **Limitations**: loads from CDN (`cdn.jsdelivr.net`, `storage.googleapis.com`); if unavailable, blink becomes a *supplementary* signal and entry gates on server-side PAD only. Tilt-independent because blendshapes are used, not geometry.

## 2. MiniFASNetV2 — Presentation Attack Detection (PAD)

- **Purpose**: distinguish a live human face from a printed photograph, phone/monitor screen replay, or video replay.
- **Input**: 80×80 face crop (YuNet-detected box, scale 2.7) — BGR, CHW.
- **Output**: 3-class softmax probabilities; class index 1 = real → `live_score`, `status: LIVE|SPOOF`, plus `attack_probs`.
- **Framework/Version**: ONNX Runtime (CPU) — `MiniFASNetV2.onnx` (~1.7 MB, committed).
- **Source**: https://github.com/yakhyo/face-anti-spoofing (reimplementation) based on https://github.com/minivision-ai/Silent-Face-Anti-Spoofing
- **License**: MIT (minivision).
- **Inference location**: **AI service** (`liveness_detection/mini_fasnet/anti_spoof.py`), shared ONNX session singleton.
- **Performance (Phase 3 eval)**: mean inference 39.9 ms/frame, p95 48.1 ms (synthetic dataset).
- **Known limitations**: not 100 % spoof-proof; a random-weight PyTorch fallback exists but is explicitly labeled **UNcalibrated** and never presented as real PAD; if neither engine can run, the module **fails closed** (status SPOOF, no verification).

## 3. OpenCV YuNet — Face Detection

- **Purpose**: detect face bounding boxes for PAD cropping, recognition alignment, and frame-level face checks.
- **Input**: BGR frame.
- **Output**: face boxes + landmarks.
- **Framework**: OpenCV `FaceDetectorYN` (ONNX, `face_detection_yunet_2023mar.onnx`, committed).
- **Source**: OpenCV Zoo (https://github.com/opencv/opencv_zoo) — Apache-2.0.
- **Inference location**: AI service.

## 4. OpenCV SFace — Face Recognition

- **Purpose**: 128-D face embeddings and identity matching (login, pre-session checks, registration).
- **Input**: aligned face crop.
- **Output**: 128-D normalized embedding; cosine similarity ≥ `FACE_MATCH_THRESHOLD` (default 0.48) = match.
- **Framework**: OpenCV `FaceRecognizerSF` (ONNX `face_recognition_sface_2021dec.onnx`).
- **Source**: OpenCV Zoo — Apache-2.0.
- **Inference location**: AI service (`face_recognition/recognizer.py`). Embeddings stored server-side; the client never receives them.
- **Performance (Phase 3 eval)**: mean 106.0 ms, p95 174.6 ms per verification.
- **Limitations**: SFace is trained on general face data — accuracy on small/ethnicity-specific datasets is not measured here; the evaluation dataset is small (2 subjects, 5 impostor probes).

## 5. Blink detector (temporal state machine, MediaPipe blendshapes)

- **Purpose**: count natural blinks via blendshape signals.
- **Input**: `eyeBlinkLeft`, `eyeBlinkRight` per frame.
- **Output**: `{ detected, count, state }` over the state machine OPEN → CLOSING → CLOSED → REOPEN.
- **Framework**: pure Python logic (`liveness_detection/blink_detector.py`); signals from MediaPipe (client) or a server-side fallback estimate.
- **Performance (Phase 3 eval)**: TPR 1.0, FPR 0.0 on 10 synthetic sequences (3 positive, 7 negative incl. head/camera motion).
- **Limitations**: blendshapes require a decent camera/lighting; a blink is a supplementary liveness signal, never the sole mechanism.

## 6. ECAPA-TDNN speaker embeddings — **OPTIONAL (auto-selected)**

- **Purpose**: 192-D speaker embeddings and verification.
- **Input**: 16 kHz speech (≥ ~0.1 s speech gate).
- **Output**: 192-D embedding; cosine verification vs stored candidate.
- **Framework/Version**: SpeechBrain `speechbrain/spkrec-ecapa-voxceleb` (0.5.16), torchaudio ≥ 2.6.
- **Source**: https://github.com/speechbrain/speechbrain — Apache-2.0. Checkpoint (~90 MB) auto-downloaded to `voice_detection/speaker_recognition/pretrained_models/` (gitignored).
- **Inference location**: AI service (`voice_detection/speaker_recognition/ecapa_recognizer.py`).
- **Active-model endpoint**: `GET /ai-api/voice-detection/active-model` reports which backend is live.
- **Limitations**: if SpeechBrain/torchaudio are absent or the checkpoint is unreachable, TrueView falls back to the **custom acoustic signature vector (128-D)** which is always labeled `custom-acoustic-vector` — never presented as ECAPA-TDNN.

## 7. Custom acoustic signature vector (fallback)

- **Purpose**: speaker verification when ECAPA-TDNN is unavailable.
- **Input**: audio.
- **Output**: 128-D MFCC + pitch + formant statistics vector.
- **Inference location**: AI service (`speaker_recognizer.py`).
- **Limitations**: proprietary lightweight extractor; weaker discrimination than ECAPA-TDNN — verification threshold is `VOICE_MATCH_THRESHOLD` (0.75).

## 8. Silero VAD — **NOT ACTIVE**

- Not installed/used. TrueView uses a **custom energy/ZCR VAD** (`voice_detection/vad/vad_detector.py`) that classifies frames as `speaking | silence | background_noise` against a dynamic noise floor. This is a documented limitation; Silero VAD is listed under FUTURE_WORK.
- Source (for reference only): https://github.com/snakers4/silero-vad

## 9. Whisper / faster-whisper transcription — **OPTIONAL (lazy-loaded)**

- **Purpose**: speech **content** analysis only (transcription + keyword detection). Never used for speaker identity or liveness.
- **Model**: `faster-whisper` CTranslate2 (`base` default; `WHISPER_MODEL_SIZE`, `WHISPER_DEVICE`, `WHISPER_COMPUTE_TYPE` env-tunable).
- **Source**: faster-whisper (https://github.com/SYSTRAN/faster-whisper) — MIT.
- **Inference location**: AI service (`speech_analysis/service.py`), lazy-loaded once and reused.
- **Behavior**: if the model cannot load (no connectivity/deps), `transcribe` returns `available: false` honestly and monitoring continues.

## 10. YOLOv11 (ultralytics)

- **Purpose**: object detection in monitored environments — phone / unauthorized objects.
- **Model**: `yolo11n.pt` (ultralytics, auto-downloaded).
- **Input**: BGR frame.
- **Output**: detections with class labels + confidence.
- **Source**: https://github.com/ultralytics/ultralytics — AGPL-3.0.
- **Inference location**: AI service (`object_detection/`).
- **Known limitation**: AGPL-3.0 licensing must be considered for commercial redistribution.

## Model source summary

| Model | Official source |
| --- | --- |
| MediaPipe Face Landmarker | https://github.com/google-ai-edge/mediapipe |
| MiniFASNet / Silent-Face-Anti-Spoofing | https://github.com/minivision-ai/Silent-Face-Anti-Spoofing |
| SpeechBrain (ECAPA-TDNN) | https://github.com/speechbrain/speechbrain |
| Silero VAD (not active) | https://github.com/snakers4/silero-vad |
| YuNet / SFace | https://github.com/opencv/opencv_zoo |
| faster-whisper | https://github.com/SYSTRAN/faster-whisper |
| YOLOv11 | https://github.com/ultralytics/ultralytics |
