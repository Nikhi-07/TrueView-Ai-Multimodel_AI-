# TrueView AI — Architecture

> This document describes the **actual** implementation in this repository (Phases 1–4).
> It reflects the code, not an idealized design.

## 1. High-Level Architecture

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
                         EVENT ENGINE
                              |
                         ALERT ENGINE
                              |
                  +-----------+-----------+
                  |                       |
              REVIEWER                 REPORT
              DASHBOARD               GENERATION
```

Three cooperating services run side by side:

| Service | Tech | Port (default) | Purpose |
| --- | --- | --- | --- |
| `client/` | React 19 + Vite + Tailwind + Socket.IO client | 5173 | Browser UI (auth, registration, proctor room, reviewer, reports) |
| `server/` | Node.js + Express 5 + Socket.IO + MongoDB (Mongoose) | 5000 | REST API, JWT auth, socket authority, session state machine, timer, alerts, reports |
| `ai-service/` | Python + FastAPI + OpenCV + ONNX Runtime + (optional) SpeechBrain/torchaudio + faster-whisper | 8000 | All AI inference: face, liveness/PAD, voice, speech, gaze, head pose, objects, behaviour fusion |

The client talks to the server over REST (`/api/*`) and Socket.IO (`/socket.io`),
and to the AI service directly through a Vite dev proxy (`/ai-api` → port 8000)
in development, or through the configured `AI_SERVICE_URL` in production.

## 2. Frontend Architecture (`client/src`)

- **Routing** — `routes/AppRoutes.jsx`:
  - Public auth layout: `/login`, `/register`, `/register-face`, `/register-voice`, `/forgot-password`, `/reset-password`
  - Protected area (JWT required): `/proctor-room/:id`, `/rooms`, `/monitoring`, `/sessions`, `/reports`, `/alerts`, `/analytics`, `/users` (admin), `/settings`, `/profile`, `/face-registration`, plus AI demo viewers.
- **Auth context** — `context/AuthContext.jsx` stores JWT in `localStorage` (`trueview_token`) with pending-registration tokens (`trueview_pending_token`, `trueview_pending_voice_token`). On startup it validates the stored token via `/api/auth` profile fetch.
- **Services** — `services/api.js` (axios instance, attaches `Authorization: Bearer`), no PII logging.
- **Proctor Room** — `pages/ProctorRoom.jsx` dispatches to `components/ProctorRoom/`:
  - `PreSessionCheck.jsx` — device + liveness + identity gate before entry (server-authoritative).
  - `ParticipantProctorRoom.jsx` — live camera, AI engine telemetry, media interruption handling.
  - Reviewer components (in same folder) — live stream via WebRTC, alert feed, controls.
- **Hooks**:
  - `useProctorSocket.js` — Socket.IO client with reconnect + re-join.
  - `useControlledMediaStream.js` — tracks camera/mic tracks, detects interruptions (ended/muted/devicechange).
  - `useParticipantBroadcast.js` / `useReviewerSubscriber.js` — WebRTC offer/answer/ICE via server relay.
  - `useFaceLandmarker.js` — client-side MediaPipe Face Landmarker (blendshape blink signals).
  - `useCamera.js` — camera capture helpers.
- **Session policies mirror** — `utils/sessionPolicies.js` mirrors the server policy file for UI display; **authoritative decisions are made server-side**.

## 3. Backend Architecture (`server`)

- `server.js` — Express app, helmet, strict CORS allowlist, body limit 10 MB, MongoDB connect with capped exponential backoff, Socket.IO with the same CORS allowlist, `/api/health` endpoint.
- `routes/` + `controllers/` — mounted REST surface:
  - `/api/auth` (register, verify-credentials, face-login, voice-login, register-face, register-voice, biometric-status, verify-session-face, forgot/reset password)
  - `/api/users` (profile, password change, account delete; admin list)
  - `/api/rooms` (in-memory proctor room CRUD + demo seed rooms)
  - `/api/reports` (list/get/generate — now JWT-protected)
  - `/api/ai-engine` (unified engine event logging + dashboard stats + alerts)
  - `/api/voice`, `/api/liveness`, `/api/camera`, `/api/face-mesh`, `/api/eye-gaze`, `/api/head-pose`, `/api/object-detection`, `/api/behaviour`, `/api/decision` (monitoring telemetry logging endpoints)
- `middleware/` — `authMiddleware` (protect, protectPending, admin), `rateLimiter` (auth + password-reset limits), `errorHandler` (stack hidden in production).
- `sockets/proctorSocket.js` — **the session engine** (see REALTIME.md and Session State Machine below).
- `models/` — User, Session, Alert, Report.
- `utils/sessionPolicies.js` — server-authoritative policy + severity engine.

## 4. AI Service Architecture (`ai-service`)

`main.py` mounts routers under `/api/...`:

| Prefix | Module | What it does |
| --- | --- | --- |
| `/api/face-detection` | YuNet ONNX | Detect faces in frames |
| `/api/face-recognition` | SFace ONNX | 128-D embeddings; verify against candidates |
| `/api/liveness` | MiniFASNetV2 ONNX + MediaPipe blendshape blink | PAD (photo/screen/video replay) + temporal blink state machine |
| `/api/face-mesh` | MediaPipe Face Mesh (legacy server pipeline) | Landmark extraction |
| `/api/eye-gaze` | gaze_tracking | Gaze direction/attention |
| `/api/head-pose` | head_pose | Pose estimation + orientation classifier |
| `/api/voice-detection` | VAD + ECAPA-TDNN (opt.) / custom acoustic vector | Voice activity, speaker embedding, speaker verify, multi-speaker clustering |
| `/api/speech-analysis` | faster-whisper (opt.) | Transcription + keyword analysis (content only) |
| `/api/object-detection` | YOLOv11 (ultralytics) | Phone/object detection |
| `/api/behaviour-analysis` | behaviour_analysis | Fuses gaze/pose/objects/audio into behaviour events |
| `/api/decision-engine` | decision_engine | Risk scoring, rule engine, session evaluation |
| `/api/ai` | trueview_engine (Unified Monitoring API) | Session lifecycle, unified frame processing, active challenges, reviewer feedback, summaries |

The `trueview_engine` package is the Phase 3 unified engine: session manager, model manager (reuses singletons), confidence fusion, temporal fusion, event correlation, policy engine, calibration, uncertainty, explainability, reviewer feedback store, accuracy evaluation.

## 5. Database Architecture

MongoDB (`trueview` database) with Mongoose. Collections: `users`, `sessions`, `alerts`, `reports`. See DATABASE.md.

## 6. Real-Time Architecture

- Socket.IO namespace (default `/`) with JWT handshake auth.
- Server-side `activeSessions` Map holds authoritative session state; persisted to Mongo best-effort.
- WebRTC signaling relayed through the server with a strict participant↔reviewer matrix.
- See REALTIME.md for the full event catalog.

## 7. Authentication Architecture

Three-stage registration (Password → Face → Voice) and three-stage login (Password → Liveness+PAD → Face match → Voice match). Every stage issues a short-lived scoped JWT; the full application JWT is only minted after the final verified step. All biometric verification is **server-authoritative**; embeddings never leave the backend (see PRIVACY.md, AI_METHODOLOGY.md).

## 8. Monitoring / Alert / Report Architecture

- The client's AI loop posts unified frames to `/ai-api/ai/session/{id}/process`; behaviour events are emitted over the socket as `ai_event`.
- The server recomputes severity from `sessionPolicies.js` — client-sent severity is never trusted.
- Trust score decays per event; EXAM thresholds auto-suspend.
- On completion (manual or timer), `generateSessionReport` builds an evidence-based report in `reports`.

## 9. Failure Handling

- Auth DB down → `503 AUTH_SERVICE_UNAVAILABLE` (fail closed).
- AI service down during face-login → `503` (fail closed, no JWT).
- Pre-session PAD unreachable → entry blocked ("verification cannot be completed").
- EXAM camera/mic interruption → immediate suspension.
- EXAM AI engine offline event → suspension.
- MongoDB offline → server runs in resilient mode; sockets still authoritative in memory.

## 10. Security Architecture

See the AUDIT.md and PRIVACY.md documents. Highlights: bcrypt password hashing (`select: false`), JWT expiry + scoped tokens, rate limiting, helmet, strict CORS (this phase), socket role checks server-side, WebRTC relay authorization, biometric embeddings `select: false` and never returned, secrets only in environment variables.
