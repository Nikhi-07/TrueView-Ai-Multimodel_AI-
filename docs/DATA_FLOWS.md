# TrueView AI — Data Flows (actual implementation)

## 1. REGISTRATION (3 stages)

```
User
  ↓ fullName, email, password, phone
Frontend  POST /api/auth/register            → User created with registrationStatus=PENDING_FACE_REGISTRATION, pendingToken (1h, pendingFace)
Backend   (bcrypt hash stored; account Inactive)
  ↓ pendingToken (Authorization: Bearer)
Frontend  POST /ai-api/liveness/evaluate-auth-liveness  → MiniFASNet PAD + blink (must be LIVE)
  ↓ live frame
Frontend  POST /ai-api/face-recognition/extract-embedding → 128-D SFace embedding
Frontend  POST /api/auth/register-face       → embeddings stored (select:false); status=PENDING_VOICE_REGISTRATION; pendingVoiceToken (1h)
Backend
  ↓ pendingVoiceToken
Frontend  POST /ai-api/voice-detection/extract-embedding → ECAPA 192-D or custom 128-D embedding (+ honest model label)
Frontend  POST /api/auth/register-voice       → voice embedding stored; status=ACTIVE; full JWT (30d) issued
Backend
  ↓
ACTIVE ACCOUNT
```

## 2. LOGIN (3 stages)

```
User
  ↓ email, password
Frontend  POST /api/auth/verify-credentials   → password verified → tempLoginToken (15m, faceLoginChallenge)
Backend   (DB down ⇒ 503 FAIL CLOSED)
  ↓ camera frames
Frontend  POST /ai-api/liveness/verify-multi-frame  → MiniFASNet PAD (status=LIVE required) + blink arrays
Frontend  POST /api/auth/face-login           → server matches live frame vs stored embeddings (SFace, 0.48)
Backend   (LIVENESS must pass, then FACE match; JWT minted ONLY here)
  ↓ optional voice stage
Frontend  POST /api/auth/voice-login          → server verifies live audio vs stored voice embedding (0.75)
Backend   (faceVerified claim required in token)
  ↓
JWT → Dashboard
```

## 3. MONITORED SESSION (Proctor Room)

```
Reviewer (admin JWT) creates room  → /api/rooms  (or joins socket)
Participant joins Proctor Room     → socket join_room (server records participant)
  ↓
PreSessionCheck: getUserMedia(camera+mic) → liveness (PAD) + blink + verify-session-face (identity)
  ↓ all gates pass
Device check complete → ENTER PROCTOR ROOM (server state READY)
  ↓ reviewer: start_session → server status LIVE + authoritative endTime
Camera + Microphone (useControlledMediaStream tracks interruption)
  ↓
AI Engine loop: POST /ai-api/ai/session/{id}/process (unified multimodal frame)
  → gaze / head pose / objects / face / VAD+speaker / speech (optional)
  ↓ behaviour events
socket emit ai_event { sessionId, eventType, confidence, description }
  ↓
EVENT ENGINE (server): normalize type → evaluateEventSeverity(type, mode) → severity
  ↓ trust score decay; persist Alert; broadcast AI_EVENT/ALERT_CREATED
ALERT ENGINE: threshold check → auto-suspend (EXAM interruption ⇒ immediate)
  ↓
Reviewer dashboard: live stream (WebRTC relayed), alert feed, controls
  (PAUSE/SUSPEND/RESUME/END/TRIGGER_LIVENESS/ISSUE_WARNING), reviewer feedback
  ↓
Session ends (manual END_SESSION or server timer expiry) → status COMPLETED
  ↓
Report generation (evidence-based: event counts + timeline; no raw media/biometrics)
  ↓
Reports page (JWT-protected)
```
