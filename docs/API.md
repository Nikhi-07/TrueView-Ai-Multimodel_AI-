# TrueView AI — API Reference

> Documents the **actual** REST endpoints mounted by `server/server.js` and the
> FastAPI endpoints registered by `ai-service/main.py`. Obsolete/removed routes
> are not documented.

Base URLs (development):

- Backend REST: `http://localhost:5000/api`
- AI Service (direct): `http://localhost:8000/api` — the client reaches these via the `/ai-api` Vite proxy.

Conventions:

- `protect` = valid application JWT (`Authorization: Bearer <token>`), and the account must be `ACTIVE` with biometric registration complete.
- `admin` = JWT whose DB role is `admin`.
- All errors are JSON `{ "message": "..." }`; auth fail-closed paths return `{ "success": false, "code": "..." }`.

---

## 1. Authentication — `/api/auth`

| Method | Route | Purpose | Auth | Body / Params | Success | Errors |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/register` | Stage 1: create account (pending face) | public (rate-limited) | `fullName, email, password, phone?` | `201 { _id, pendingToken, registrationStatus }` | 400 duplicate/invalid |
| POST | `/verify-credentials` | Stage 1 of login: verify password, issue 15-min challenge token | public (rate-limited) | `email, password` | `{ requiresFaceScan, tempLoginToken }` | 401 wrong password; 403 inactive; 503 DB down (fail closed) |
| POST | `/login` | Alias of verify-credentials (password-only login is blocked) | public | `email, password` | same as verify-credentials | — |
| POST | `/face-login` | Stage 2: multi-frame liveness/PAD + face match against stored embeddings | public (rate-limited) | `email, tempLoginToken, frames[]`, `eyeBlinkLeft[]`, `eyeBlinkRight[]` | `{ success, token, user }` — full JWT | 401 LIVENESS_FAILED / FACE_MISMATCH; 503 LIVENESS_UNAVAILABLE / FACE_SERVICE_UNAVAILABLE |
| POST | `/voice-login` | Stage 3: verify live audio against stored voice embedding | public (rate-limited) | `email, tempVoiceToken, audio` | `{ token, user }` | 401 / 400 no profile |
| POST | `/register-face` | Stage 2 of registration: store face embeddings, move to voice stage | protectPending | `embeddings[]` | `{ pendingVoiceToken }` | 400 invalid embeddings |
| POST | `/register-voice` | Stage 3: store voice embedding, activate account, issue full JWT | protectPending | `embeddings[] | audio` | `{ token, registrationStatus: 'ACTIVE' }` | 400 invalid |
| GET | `/face-embeddings` | Biometric status (**no raw embeddings returned**) | protect | — | `{ id, fullName, faceRegistered, embeddingsCount }` | 404 |
| GET | `/biometric-status` | `faceRegistered`, `voiceRegistered`, `biometricReady` | protect | — | status object | — |
| POST | `/verify-session-face` | Server-side live-face match for pre-session checks (no JWT issued) | protect | `image` | `{ verified, confidence, threshold }` | 503 service down |
| POST | `/forgot-password` | Issue 15-min reset token (demo returns it; production emails it) | public (reset limiter) | `email` | `{ message, resetToken }` | 404 |
| POST | `/reset-password` | Set new password with token | public | `token, password` | `{ message }` | 400 expired/invalid |
| POST | `/logout` | No-op ack | public | — | `{ message }` | — |

## 2. Users — `/api/users`

| Method | Route | Purpose | Auth | Notes |
| --- | --- | --- | --- | --- |
| GET | `/profile` | Own profile | protect | No password/embeddings |
| PUT | `/profile` | Update name/phone/password | protect | **Password change requires `currentPassword`** (hardened in Phase 4) |
| DELETE | `/account` | Delete own account | protect | |
| GET | `/` | List all users | protect + admin | `-password` projection |

## 3. Rooms — `/api/rooms`

In-memory proctor room store (with 4 demo seed rooms for the demo flow).

| Method | Route | Purpose | Auth |
| --- | --- | --- | --- |
| GET | `/` | List rooms | none |
| POST | `/` | Create room | none (host name from token if present) |
| GET | `/:roomId` | Room detail (creates a dynamic fallback) | none |

## 4. Reports — `/api/reports`

**Phase 4 hardening: all report routes now require a valid JWT.**

| Method | Route | Purpose | Auth |
| --- | --- | --- | --- |
| GET | `/` | List reports (newest first) | protect |
| GET | `/:id` | Single report by `reportId` or Mongo `_id` | protect |
| POST | `/generate` | Generate a report for a session from stored alerts | protect |

## 5. AI Engine — `/api/ai-engine`

| Method | Route | Purpose | Auth |
| --- | --- | --- | --- |
| POST | `/log` | Persist unified engine frame result + create alerts/session | protect |
| GET | `/dashboard-stats` | Dashboard KPIs (scoped to user unless admin) | protect |
| GET | `/alerts` | Alerts for the current user (admin sees all) | protect |

## 6. Monitoring telemetry endpoints

Log/ack endpoints (JWT-protected) used by the demo viewer pages:

- `POST /api/camera/start | /stop`, `GET /api/camera/status`
- `POST /api/liveness/log`, `GET /api/liveness/status/:sessionId`
- `POST /api/face-mesh/log`, `POST /api/eye-gaze/log`, `POST /api/head-pose/log`
- `POST /api/voice/log`, `POST /api/voice/verify-live-speaker`, `POST /api/voice/analyze-audio`, `POST /api/voice/analyze-speech`
- `POST /api/object-detection/log`, `POST /api/behaviour/log`, `POST /api/decision/log`

`verify-live-speaker` / `analyze-audio` proxy to the AI service with embeddings held server-side; `analyze-speech` proxies to Whisper transcription.

## 7. Misc

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/` | `TrueView API is running...` |
| GET | `/api/health` | `{ status, service, uptimeSeconds, db, dbRetrying, time }` — never leaks credentials |

---

## 8. AI Service endpoints (FastAPI, prefix `/api`)

Reached by the client as `/ai-api/<path>` via the Vite proxy.

### Face Detection — `/face-detection`
- `POST /process-frame` — `{ image }` → `{ faces, count }`

### Face Recognition — `/face-recognition`
- `POST /extract-embedding` — `{ image }` → `{ embedding, face_detected }` (128-D SFace)
- `POST /verify` — `{ image, candidates:[{id, embedding}] }` → `{ verified, confidence, matched_user_id }`

### Liveness — `/liveness`
- `GET /generate-challenge` — random active challenge (`BLINK` / look-straight)
- `POST /evaluate-auth-liveness` — `{ image, session_id, eye_blink_left?, eye_blink_right?, face_box? }` → `{ antiSpoof, blink, face }`
- `POST /verify-multi-frame` — `{ frames[], challenge_type?, eye_blink_left[]?, eye_blink_right[]? }` → `{ status, livenessVerified, liveness_score, ... }`
- `POST /check` — single-frame fallback

### Face Mesh — `/face-mesh`
- `POST /process-face-mesh` — `{ image }` → landmarks

### Eye Gaze — `/eye-gaze`
- `POST /process-eye-gaze`, `POST /reset-session`

### Head Pose — `/head-pose`
- `POST /process-head-pose`, `POST /reset-pose-session`

### Voice Detection — `/voice-detection`
- `POST /process-audio` — VAD + speaker analysis
- `POST /reset-voice-session`
- `GET /active-model` — `{ model: 'ecapa-tdnn' | 'custom-acoustic-vector', ecapa_available }`
- `POST /extract-embedding` — `{ audio }` → `{ embedding, model, speech_detected }`
- `POST /verify-speaker` — `{ audio, candidate, threshold }` → `{ verified, confidence, model }`
- `POST /analyze-audio` — speaker + multiple-speaker clustering

### Speech Analysis — `/speech-analysis`
- `POST /transcribe` — `{ audio, keywords? }` → `{ available, transcript, language, keywords_found, model }` (Whisper, optional)

### Object Detection — `/object-detection`
- `POST /process-object-detection`, `POST /reset-object-session` (YOLOv11)

### Behaviour Analysis — `/behaviour-analysis`
- `POST /analyze-behaviour` — fused multimodal behaviour events
- `POST /reset-behaviour-session`

### Decision Engine — `/decision-engine`
- `POST /evaluate-session` — `{ telemetry }` → risk + action
- `POST /reset`

### TrueView Engine — `/ai` (unified)
- `POST /session/start` — `{ session_id, user_id?, session_type? }`
- `POST /session/{id}/process` — unified multimodal frame → `UnifiedMonitoringOutput`
- `POST /session/{id}/challenge/respond`
- `POST /feedback/submit` — reviewer judgment logging
- `GET /session/{id}/summary`
- `GET /session/{id}/status`
- `POST /session/{id}/stop`

### Health
- `GET /health` — `{ status: 'ok', service: 'trueview-ai' }`
