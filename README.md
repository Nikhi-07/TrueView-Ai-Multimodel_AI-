# TrueView AI — Context-Aware Multimodal AI Monitoring Platform

> TrueView AI is a context-aware multimodal AI monitoring platform that combines
> biometric authentication, presentation-attack detection, speaker verification,
> computer vision, speech analysis, behavioural intelligence, real-time session
> monitoring and human-in-the-loop review within a unified monitored-session
> environment.

## 1. Project Title

**TrueView AI — Secure Biometric Authentication & Real-Time Proctoring Platform**

## 2. Description

TrueView AI is a full-stack, three-service system for online proctored sessions
(exams, interviews, classes, meetings). It authenticates users with **password +
live-face (liveness-gated) + voice**, monitors sessions in real time with
**multimodal AI** (gaze, head pose, face presence, object detection, voice
activity, speaker identity, optional speech content), fuses those signals through
**context-aware policies**, and produces **evidence-based reports** that a human
reviewer audits. All trust decisions are made **server-side**; the client is
never trusted with severity, roles, or biometric data.

## 3. Problem Statement

Remote assessments suffer from identity fraud, presentation attacks
(photos/screens/videos spoofing the camera), unverifiable ambient behavior
(phone use, other people, unknown speakers), and a lack of auditable evidence.
Point solutions (face-only or voice-only monitoring) produce high false
positives and cannot be defended academically or operationally.

## 4. Proposed Solution

A unified platform that:

1. Gates **identity** behind password → PAD-gated face match → voice match
   (fail closed if any service is unavailable).
2. Monitors sessions with **multimodal AI fusion** rather than single signals.
3. Applies **session-mode policies** (EXAM/INTERVIEW/CLASS/MEETING) server-side.
4. Provides **human-in-the-loop review** and **evidence-based reports**.
5. Ships a **reproducible evaluation harness** with honest measurements.

## 5. Key Features

- 3-stage registration (password → face → voice) and 3-stage login.
- MiniFASNetV2 presentation-attack detection (photo/screen/video replay).
- MediaPipe blendshape blink detection (tilt-independent state machine).
- SFace face recognition (128-D embeddings, server-side matching).
- ECAPA-TDNN speaker verification with honest custom-vector fallback.
- Voice activity (VAD), multi-speaker detection, optional Whisper transcription.
- Gaze, head pose, and YOLOv11 object detection.
- Behaviour fusion with context-aware alert policies and trust scoring.
- Server-authoritative session state machine, timer, and auto-suspension.
- WebRTC participant→reviewer streaming relayed through Socket.IO.
- Auto-generated evidence-based reports; JWT-protected report APIs.
- Security: bcrypt, scoped JWTs, rate limiting, strict CORS, fail-closed AI paths.

## 6. Architecture

```
                         TRUEVIEW AI
                              |
        +---------------------+---------------------+
        |                     |                     |
 AUTHENTICATION          SESSION ENGINE          AI ENGINE
        |                     |                     |
 Password                 Proctor Room          Vision
 Face                     Timer                 Voice
 Liveness                 Session State         Behaviour
 Voice                    WebRTC                Speech
        |                     |                     |
        +---------------------+---------------------+
                              |
                         EVENT ENGINE  →  ALERT ENGINE
                              |                |
                         REVIEWER DASHBOARD  REPORT GENERATION
```

Three services: **client** (React 19 + Vite, :5173), **server** (Express 5 +
Socket.IO + MongoDB, :5000), **ai-service** (FastAPI + OpenCV + ONNX, :8000).
See `docs/ARCHITECTURE.md`.

## 7. Technology Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 19, Vite 8, Tailwind CSS 3, Socket.IO client, WebRTC, MediaPipe tasks-vision, recharts, framer-motion |
| Backend | Node.js, Express 5, Socket.IO 4, Mongoose, jsonwebtoken, bcryptjs, helmet, express-rate-limit, axios |
| AI | Python 3, FastAPI, OpenCV, ONNX Runtime, NumPy; optional SpeechBrain + torchaudio, faster-whisper; Ultralytics YOLOv11 |
| Database | MongoDB |

## 8. AI Models

| Capability | Model | Location | License |
| --- | --- | --- | --- |
| Face detection | OpenCV YuNet (ONNX) | AI service | Apache-2.0 |
| Face recognition | OpenCV SFace (ONNX, 128-D) | AI service | Apache-2.0 |
| Face anti-spoofing (PAD) | MiniFASNetV2 (ONNX) | AI service | MIT |
| Blink detection | MediaPipe Face Landmarker blendshapes + state machine | Browser | Apache-2.0 |
| Speaker verification | ECAPA-TDNN (SpeechBrain) — optional; custom 128-D acoustic vector fallback | AI service | Apache-2.0 |
| Voice activity | Custom energy/ZCR VAD | AI service | TrueView |
| Speech transcription | faster-whisper — optional | AI service | MIT |
| Object detection | YOLOv11 (ultralytics) | AI service | AGPL-3.0 |

Optional models report `available: false` when not installed — they are never
presented as active. Details: `docs/AI_MODELS.md`.

## 9. Installation

Prerequisites: **Node.js 18+**, **Python 3.9+** (3.10+ recommended), **MongoDB**
(local or Atlas).

```bash
# AI service
cd ai-service
python -m venv .venv && source .venv/Scripts/activate   # (Windows git-bash)
pip install -r requirements.txt

# Backend
cd server && npm install

# Frontend
cd client && npm install
```

## 10. Environment Variables

```bash
cp .env.example .env   # fill in real values (placeholders only in the template)
```

Key variables: `MONGO_URI`, `JWT_SECRET`, `AI_SERVICE_URL`, `CLIENT_URL`,
`CORS_ORIGINS`, `PORT`, `NODE_ENV`, `FACE_MATCH_THRESHOLD`,
`VOICE_MATCH_THRESHOLD`, `TIMER_WARNING_MINUTES`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `VITE_API_URL`, `VITE_SOCKET_URL`, `AI_HOST`, `AI_PORT`,
`AI_RELOAD`, `AI_CORS_ORIGINS`, `WHISPER_*`. **Never commit real secrets** —
`.env` is gitignored.

## 11. How to Run

```bash
# 1) AI service (port 8000)
cd ai-service && python main.py

# 2) Backend (port 5000)
cd server && npm run dev          # optional: npm run seed  (demo admin)

# 3) Frontend (port 5173)
cd client && npm run dev
```

Open http://localhost:5173. Dev proxies: `/ai-api` → :8000, `/api` → :5000,
`/socket.io` → :5000.

## 12. How to Test

```bash
# Frontend regression
cd client && npm run build && npm run lint

# Evaluation harness (AI models) — requires evaluation/dataset
cd evaluation && python run_evaluation.py --all

# Socket / security / load tests (requires server :5000 + MongoDB)
node security_test.js && node e2e_scenario.js && node failure_injection.js && node load_test.js
python test_phase2_endpoints.py        # AI endpoint smoke tests (:8000)
```

## 13. Evaluation

Measured results (details & caveats in `docs/EVALUATION.md`):

| Component | Metric | Result | Dataset/Test size |
| --- | --- | --- | --- |
| PAD (MiniFASNet) | Attack detection rate | 1.0 | 3 printed-photo samples |
| PAD | Live FRR | 0.0 | 2 live samples |
| Blink | TPR / FPR | 1.0 / 0.0 | 10 synthetic sequences |
| Alert engine | Severity mapping precision | 1.0 | 48 mappings |
| Socket.IO | Concurrent sessions | 50/50, 0 failures | load test |
| Face recognition | FAR | 0.6 (dataset artifact) | 2 subjects, 5 impostor probes |
| Speaker EER | — | NOT MEASURED (synthetic calibration only) | — |

## 14. Limitations

Small evaluation datasets; blink metrics synthetic; real-speaker EER not
measured; PAD not spoof-proof; ECAPA/Whisper optional; WebRTC is 1:1
participant↔reviewer; browser permission dependency; demo analytics pages use
mock UI data; session state in memory; password reset token is dev-only.
Full list: `docs/LIMITATIONS.md`.

## 15. Future Work

SFU-based multi-participant streaming; Silero VAD; larger consented datasets;
GPU/edge inference; advanced deepfake detection; httpOnly cookie auth; real
email reset; retention & cascade deletion; Redis-backed sessions.
Details: `docs/FUTURE_WORK.md`.

## 16. Project Structure

```
TrueView/
├── client/                  # React frontend (:5173)
│   └── src/
│       ├── components/      # UI + ProctorRoom components
│       ├── context/         # AuthContext, ThemeContext
│       ├── hooks/           # socket, media stream, WebRTC, landmarker, camera
│       ├── pages/           # Login, Register, Face/Voice Registration, ProctorRoom, viewers, reports
│       ├── routes/          # AppRoutes.jsx
│       ├── services/        # api.js (axios)
│       └── utils/           # sessionPolicies.js, mockData.js (demo UI), wavRecorder.js
├── server/                  # Express + Socket.IO backend (:5000)
│   ├── controllers/ routes/ middleware/ models/ sockets/ utils/
│   ├── server.js            # entry; CORS allowlist; health; DB reconnect
│   └── seed.js              # demo admin seed (env credentials)
├── ai-service/              # FastAPI AI service (:8000)
│   ├── face_detection/ face_recognition/ liveness_detection/ face_mesh/
│   ├── gaze_tracking/ head_pose/ voice_detection/ speech_analysis/
│   ├── object_detection/ behaviour_analysis/ decision_engine/
│   ├── trueview_engine/     # unified monitoring engine
│   └── main.py
├── browser-extension/       # optional Chrome extension scaffold
├── evaluation/              # harness: run_evaluation.py, security_test.js, load_test.js, ...
├── docs/                    # ARCHITECTURE, API, REALTIME, DATABASE, AI_MODELS,
│                            # AI_METHODOLOGY, SESSION_POLICIES, BEHAVIOUR_ENGINE,
│                            # EVALUATION, LIMITATIONS, FUTURE_WORK, PRIVACY,
│                            # SETUP, DEMO_GUIDE, PROJECT_DOCUMENTATION,
│                            # PRESENTATION_OUTLINE, VIVA_QUESTIONS, NOVELTY,
│                            # DATA_FLOWS, AUDIT
└── .env.example
```

## Documentation index

| Doc | Content |
| --- | --- |
| `docs/ARCHITECTURE.md` | Actual system architecture |
| `docs/API.md` | REST + AI endpoints |
| `docs/REALTIME.md` | Socket.IO/WebRTC events & authorization |
| `docs/DATABASE.md` | MongoDB collections & sensitive fields |
| `docs/AI_MODELS.md` | Models, sources, licenses, limitations |
| `docs/AI_METHODOLOGY.md` | Face/voice/speech/vision/fusion pipelines |
| `docs/SESSION_POLICIES.md` | Per-mode severity tables |
| `docs/BEHAVIOUR_ENGINE.md` | Signal fusion & human review |
| `docs/EVALUATION.md` | Measured results & method |
| `docs/LIMITATIONS.md` | Honest limitations |
| `docs/FUTURE_WORK.md` | Realistic future improvements |
| `docs/PRIVACY.md` | Data handling & retention |
| `docs/SETUP.md` | Exact setup commands & troubleshooting |
| `docs/DEMO_GUIDE.md` | 20-step reproducible demo |
| `docs/PROJECT_DOCUMENTATION.md` | Full engineering document |
| `docs/PRESENTATION_OUTLINE.md` | 15-slide outline |
| `docs/VIVA_QUESTIONS.md` | Defense Q&A |
| `docs/NOVELTY.md` | Honest novelty statement |
| `docs/DATA_FLOWS.md` | Registration/login/session flows |
| `docs/AUDIT.md` | Phase 4 codebase audit |
