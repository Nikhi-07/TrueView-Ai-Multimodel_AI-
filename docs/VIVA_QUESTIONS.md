# TrueView AI — Viva / Defense Q&A

Answers match the actual implementation. Keep answers to 2–4 sentences.

## Motivation & scope

**Q: Why TrueView? What problem does it solve?**
A: Online proctored sessions have an identity and integrity problem: is the
registered person actually present, and what is happening around them? TrueView
combines biometric authentication, presentation-attack detection, multimodal
monitoring, and human review into one system.

**Q: Why face recognition?**
A: Face is the primary biometric for identity — cheap to capture with the
already-required camera and gives a strong identity signal before and during a
session (SFace 128-D embeddings, cosine threshold 0.48).

**Q: Why liveness detection?**
A: A face alone can be spoofed with a photo or screen. MiniFASNetV2 detects
printed-photo/screen/video replay so a "face" is only accepted if it is a live
human.

**Q: Difference between face recognition and liveness?**
A: Recognition answers "who is this?" (compare embeddings). Liveness answers
"is this a real person, not a photo/screen?" — a separate model that gates
recognition. In TrueView both must pass before any token is issued.

## Model choices

**Q: Why MiniFASNet?**
A: It is a compact, proven anti-spoofing CNN (Silent-Face-Anti-Spoofing family)
available as ONNX (~1.7 MB), runs fast on CPU (~40 ms/frame measured), and
detects the common attack classes we target.

**Q: Why MediaPipe?**
A: Face Landmarker gives blendshapes (eyeBlinkLeft/Right) that are tilt- and
expression-independent, enabling a reliable temporal blink detector without
serverside inference.

**Q: Why ECAPA-TDNN?**
A: It is a state-of-the-art, open SpeechBrain speaker-verification model
(pretrained on VoxCeleb, 192-D embeddings). We use it when available and fall
back to a custom acoustic vector, labeled honestly.

**Q: Why Silero VAD? / Why Whisper? / Why YOLO?**
A: Silero VAD is a recognized VAD but is **not integrated** — we use a custom
energy/ZCR VAD (documented limitation). Whisper (faster-whisper) provides
optional content transcription only, never identity. YOLOv11 detects phones and
unauthorized objects in the environment.

## Technology choices

**Q: Why MongoDB?**
A: Flexible document schemas fit our variable telemetry (sessions/alerts/reports
grow different fields), easy Mongoose modeling, and quick local setup. Biometric
fields use `select: false`.

**Q: Why FastAPI?** A: Async, typed (Pydantic) request models, automatic OpenAPI
docs, and clean router organization for the 12 AI modules.

**Q: Why Node.js/Express?** A: Mature ecosystem, first-class Socket.IO support
for real-time proctoring, and simple JWT middleware.

**Q: Why WebRTC?** A: Low-latency peer media for the reviewer's live view without
routing video through the server; the server only relays signaling through an
authorization matrix.

**Q: Why Socket.IO?** A: Namespaces, rooms, and automatic reconnection fit the
proctor room model (join, broadcast alerts, timer sync, reconnect + re-join).

## Behavior & internals

**Q: How does speaker verification work?** A: Registration stores an embedding
(ECAPA 192-D or custom 128-D). Verification extracts the embedding from live
audio, infers which backend produced the stored candidate, and compares cosine
similarity against the 0.75 threshold — all server-side.

**Q: How does behaviour fusion work?** A: Individual signals (gaze, pose,
objects, face, voice) become typed events with confidence; the server maps each
to a severity via the session policy and decays a trust score; limits trigger
suspension. One signal alone is never treated as proof.

**Q: How are false positives handled?** A: Events are reviewable; severity is
policy-based; reviewer feedback (CONFIRMED/FALSE_POSITIVE/DISMISSED) is logged;
reports use evidence-based wording; auto-suspension is resumable by the reviewer.

**Q: What happens if the camera is disabled?** A: The browser/OS permission is
never bypassed. `useControlledMediaStream` detects interruption and reports it;
in EXAM mode the server suspends the session immediately; other modes warn/notify.

**Q: What happens if the microphone is disabled?** A: Same policy model —
EXAM suspends immediately; INTERVIEW pauses/notifies; CLASS/MEETING warn/notify.

**Q: How is biometric information protected?** A: Embeddings are stored with
`select: false`, only read inside auth controllers, never returned to clients,
never in JWTs, logs, or reports. Passwords are bcrypt-hashed. Secrets live in
environment variables only.

**Q: How was accuracy measured?** A: `evaluation/run_evaluation.py` measures
models on the local dataset; socket tests measure load/security. Results are in
EVALUATION.md, including NOT MEASURED items (e.g. real-speaker EER).

**Q: What are limitations?** A: Small datasets, synthetic voice calibration, PAD
not spoof-proof, WebRTC 1:1, browser permission dependence, demo analytics data,
in-memory session state. (LIMITATIONS.md.)

**Q: What is novel?** A: Not the models — the engineering integration: secure
multi-stage biometric gates, server-authoritative session engine, context-aware
policy fusion, and human-in-the-loop evidence reports (NOVELTY.md).

**Q: What is the engineering contribution?** A: A working, testable,
documented system where every trust decision is server-authoritative and every
measurement is honest — including the documented gaps.
