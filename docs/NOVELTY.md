# TrueView AI — Novelty Statement

## Honest positioning

TrueView AI does **not** claim a new AI model, a new biometric algorithm, or
that "no existing system has this." Each building block is established research
or open-source technology:

| Building block | Existing work |
| --- | --- |
| Face anti-spoofing | MiniFASNet / Silent-Face-Anti-Spoofing |
| Face recognition | OpenCV SFace / YuNet |
| Speaker verification | SpeechBrain ECAPA-TDNN (VoxCeleb) |
| Voice activity | energy/ZCR VAD (Silero VAD exists but is not integrated) |
| Speech transcription | faster-whisper |
| Object detection | Ultralytics YOLOv11 |
| Face landmarks / blendshapes | Google MediaPipe Face Landmarker |
| Real-time transport | Socket.IO, WebRTC |

## The engineering contribution

TrueView's contribution is **system-level integration and engineering**, i.e.
the coherent combination of the following within one monitored-session platform:

1. **Secure multi-stage biometric authentication** — password → liveness/PAD →
   face match → voice match, with scoped short-lived JWTs and fail-closed
   behavior when any underlying service is unavailable. The application token is
   minted at a single server-side decision point.
2. **Server-authoritative session engine** — session state, timer, severity,
   suspensions, and reviewer permissions are decided by the backend; client
   claims (role, severity, livenessPassed) are never trusted. WebRTC signaling is
   relayed through a strict participant↔reviewer authorization matrix.
3. **Presentation-attack detection as a hard gate** — PAD runs before any
   embedding is captured (registration) and before any JWT is issued (login).
4. **Multimodal behaviour fusion with context-aware policies** — gaze, head
   pose, object detection, face presence, voice activity, and speaker identity
   are fused into typed events whose severity depends on session mode
   (EXAM/INTERVIEW/CLASS/MEETING), with frequency/duration/confidence inputs.
5. **Human-in-the-loop review** — reviewer feedback on flagged events is
   recorded, and reports are evidence-based (event counts + timeline), never
   automatic accusations.
6. **Honest, measured engineering** — a reproducible evaluation harness, security
   and load tests, and documentation that explicitly marks NOT MEASURED items and
   states limitations rather than overclaiming.

## What is NOT claimed

- 100 % accuracy or immunity to cheating/deepfakes.
- Novel AI models or datasets.
- Production-grade scale (multi-participant SFU, horizontal scaling, etc.).

## One-line summary

> TrueView AI is a context-aware multimodal AI monitoring platform that combines
> biometric authentication, presentation-attack detection, speaker verification,
> computer vision, speech analysis, behavioural intelligence, real-time session
> monitoring and human-in-the-loop review within a unified monitored-session
> environment — where the engineering contribution is the secure, fail-closed
> integration and the server-authoritative, policy-driven decision pipeline.
