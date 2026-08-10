# TrueView AI — Engineering Project Document

## 1. Abstract

TrueView AI is a context-aware, multimodal AI monitoring platform for online
proctored sessions. It combines biometric authentication (password + face +
voice), presentation-attack detection (PAD), speaker verification, computer
vision (gaze, head pose, object detection), speech analysis, behavioural fusion,
real-time session monitoring over WebSocket/WebRTC, and human-in-the-loop review
into one system. This document describes the actual architecture, methodology,
implementation, evaluation, results, and limitations.

## 2. Introduction

Remote examinations and interviews rely on trust that the registered candidate
is the person performing the assessment. TrueView AI addresses identity
verification and session-integrity monitoring with layered biometric checks and
an evidence-based alert/report engine, keeping a human reviewer in the loop.

## 3. Problem Statement

Online assessments suffer from: (1) identity fraud (another person taking the
assessment), (2) presentation attacks (photos/screens/videos spoofing the
camera), (3) unverifiable ambient behavior (phone use, other people, unknown
speakers), and (4) lack of auditable, reviewable evidence.

## 4. Existing System

Commercial proctoring platforms (e.g. ProctorU, ExamSoft, Honorlock, Mettl) use
similar components: identity verification, lockdown browsers, AI flagging, and
human review. Research systems use face anti-spoofing (Silent-Face-Anti-Spoofing),
speaker verification (ECAPA-TDNN, VoxCeleb), and gaze/attention models.

## 5. Existing System Limitations

- Closed, proprietary, costly; often lock browsers entirely.
- Point solutions: face-only or voice-only, with weak fusion of signals.
- Poor explainability — flags without evidence trails or reviewer feedback loops.
- Single-signal decisions cause high false positives.

## 6. Proposed System

TrueView AI: an open, modular platform that (a) authenticates identity through
password + face (PAD-gated) + voice, (b) monitors sessions with multimodal AI,
(c) fuses signals through context-aware policies, (d) auto-suspends per strict
policy, and (e) produces evidence-based reports with reviewer feedback.

## 7. Objectives

1. Multi-stage biometric authentication that fails closed.
2. Real-time multimodal monitoring with server-authoritative decisions.
3. Context-sensitive alert policies (EXAM/INTERVIEW/CLASS/MEETING).
4. Human-in-the-loop review and evidence-based reporting.
5. Measured, honest evaluation with documented limitations.

## 8. Scope

Includes: registration, login, proctor room, device interruption handling, timer
and auto-suspension, WebRTC relay, alerts, reports, evaluation harness, security
tests, docs. Excludes: multi-participant SFU streaming, production email,
mobile apps, scale-out (see FUTURE_WORK).

## 9. Architecture

See ARCHITECTURE.md. Three services: React client (:5173), Express/Socket.IO
backend (:5000), FastAPI AI service (:8000). MongoDB for persistence.

## 10. Methodology

1. **Registration**: face embedding (SFace) after PAD, voice embedding (ECAPA or
   custom) after VAD gate; both stored server-side with `select: false`.
2. **Login**: password → challenge token → multi-frame PAD → face match → voice
   match → full JWT only at the single authorized decision point.
3. **Monitoring**: client camera/mic → AI service unified engine → behaviour
   events → socket `ai_event` → server-side severity → alerts → auto-suspension.
4. **Evaluation**: model harness + socket load/security/e2e/failure scripts.

## 11. Technologies

- Frontend: React 19, Vite 8, Tailwind 3, Socket.IO client, WebRTC, MediaPipe
  tasks-vision, recharts, framer-motion.
- Backend: Node.js, Express 5, Socket.IO 4, Mongoose, JWT, bcryptjs, helmet,
  express-rate-limit.
- AI: Python 3, FastAPI, OpenCV, ONNX Runtime, NumPy; optional SpeechBrain +
  torchaudio, faster-whisper; ultralytics YOLOv11.
- Database: MongoDB.

## 12. AI Models

See AI_MODELS.md: MediaPipe Face Landmarker (client), MiniFASNetV2 ONNX (PAD),
OpenCV YuNet (detection), OpenCV SFace (recognition), temporal blink state
machine, ECAPA-TDNN (optional), custom acoustic vector (fallback), faster-whisper
(optional content), YOLOv11 (objects), custom energy/ZCR VAD.

## 13. System Modules

- `client/` — auth UI, registration, Proctor Room (participant/reviewer),
  PreSessionCheck, hooks (socket, media stream, WebRTC, landmarker), viewers.
- `server/` — REST API, auth middleware, rate limiting, sockets/proctorSocket
  (session state machine, timer, alerts, reports), models, sessionPolicies.
- `ai-service/` — per-modality routers + unified trueview_engine.

## 14. Authentication

Password + face + voice with scoped tokens: `pendingToken` (1 h), `challengeToken`
(15 min), full token (30 d). All verification server-side; FAIL CLOSED on DB/AI
failure.

## 15. Liveness Detection

MiniFASNetV2 (ONNX, 80×80 face crop, 3-class softmax) detects printed-photo /
screen / video replay. Blink detection uses MediaPipe blendshapes with an
OPEN→CLOSING→CLOSED→REOPEN state machine (supplementary signal).

## 16. Face Recognition

OpenCV SFace 128-D embeddings, cosine similarity ≥ 0.48. Enrollment at
registration; matching at login and pre-session checks; embeddings server-side.

## 17. Voice Recognition

ECAPA-TDNN (192-D, SpeechBrain) when available, else custom acoustic vector
(128-D MFCC+pitch+formants). Threshold 0.75. Multi-speaker analysis by greedy
cosine clustering of speech windows.

## 18. Speech Analysis

faster-whisper transcription (optional, lazy-loaded) + keyword scan. Content
analysis only — never identity/liveness.

## 19. Behaviour Analysis

Fuses gaze, head pose, object detection, face presence, voice activity and
speaker identity into typed events with confidence; temporal windowing and event
confirmation in the unified engine.

## 20. Proctor Room

Participant joins via socket; PreSessionCheck gates entry (device + PAD + blink
+ identity); reviewer sees live media (WebRTC relay) + alerts; reviewer commands
(PAUSE/SUSPEND/RESUME/END/liveness trigger/warning).

## 21. Alert Engine

Server computes severity from session policy; trust score decays per event;
auto-suspension at policy limits; EXAM device interruption suspends immediately.

## 22. Session Management

Backend-authoritative state machine (see below) with a server-clock timer,
configurable warning thresholds, auto-completion, and best-effort Mongo
persistence. Invalid transitions are rejected by the engine design (terminal
COMPLETED/EXITED states block further events).

```
WAITING → DEVICE_CHECK → READY → LIVE → WARNING → SUSPENDING → SUSPENDED → RESUMING → LIVE → COMPLETED
EXITED / FAILED (terminal)
```

## 23. Database

MongoDB collections users/sessions/alerts/reports — see DATABASE.md. Biometrics
`select: false`; reports hold counts + timelines, never embeddings.

## 24. Security

See AUDIT.md + PRIVACY.md: bcrypt, scoped JWTs, rate limits, strict CORS
(Phase 4), socket role enforcement, WebRTC relay matrix, fail-closed paths,
env-only secrets, protected report routes, password change requires current
password.

## 25. Testing

- Client: `npm run build`, `npm run lint` (oxlint).
- Server: module smoke checks; evaluation harness scripts.
- AI: `run_evaluation.py`, `test_phase2_endpoints.py`, py_compile.
- Socket: `e2e_scenario.js`, `failure_injection.js`, `load_test.js`,
  `test_phase2_socket.js`.
- Security: `security_test.js`.

## 26. Evaluation

See EVALUATION.md — real Phase 3 results (PAD ADR 1.0 on 3 samples, blink
TPR/FPR 1.0/0.0 synthetic, alert mapping precision 1.0, 50-session load test,
resource usage) plus explicit NOT MEASURED items.

## 27. Results

| Component | Result |
| --- | --- |
| PAD attack detection | 1.0 (3 printed-photo samples) |
| PAD live FRR | 0.0 (2 samples) |
| Blink TPR/FPR | 1.0 / 0.0 (synthetic) |
| Alert severity mapping | 48/48 (1.0 precision) |
| Socket concurrency | 50/50, 0 failures |
| Node RSS | ~82 MB mean |

## 28. Limitations

See LIMITATIONS.md — small datasets, synthetic voice calibration, PAD not
spoof-proof, optional models, WebRTC 1:1, browser permission dependence, demo
data on analytics pages, in-memory session state.

## 29. Future Scope

See FUTURE_WORK.md — SFU-based multi-participant streaming, Silero VAD, larger
consented datasets, GPU/edge inference, deepfake detection, httpOnly cookies,
real email reset, retention/cascade deletion, Redis-backed sessions.

## 30. Conclusion

TrueView AI demonstrates a working, testable, and documented integration of
biometric authentication, presentation-attack detection, speaker verification,
computer vision, speech analysis, behavioural fusion, and human-in-the-loop
review. Its contribution is system-level engineering: secure multi-stage
identity gates, server-authoritative real-time monitoring, context-aware
policies, and evidence-based reporting — measured honestly and with limitations
stated.
