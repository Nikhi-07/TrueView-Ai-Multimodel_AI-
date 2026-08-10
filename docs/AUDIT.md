# TrueView AI — Final Codebase Audit (Phase 4)

Date of audit: 2026-08-10 (branch `login/register`). Findings below reflect the
state **after** the Phase 4 cleanup actions were applied.

## 1. What was found & fixed

### Removed dead / obsolete files (verified unimported before removal)

**Server (`server/`)** — all were `TODO: Implement ... logic` placeholders that no
module required:

- `controllers/sessionController.js`, `controllers/alertController.js`
- `services/sessionService.js`, `services/notificationService.js`, `services/aiService.js`
- `routes/sessionRoutes.js`, `routes/alertRoutes.js`
- `utils/helpers.js`, `utils/validators.js`
- `config/db.js` — additionally **leaked the MongoDB URI to the console** on import.

**AI service (`ai-service/`)** — placeholder `service.py` files never imported
(the routers use `services/*` subpackages or inline logic):

- `face_detection/service.py`, `face_recognition/service.py`, `head_pose/service.py`,
  `gaze_tracking/service.py`, `object_detection/service.py`,
  `decision_engine/service.py`, `liveness_detection/service.py`, `utils/service.py`
- `behavior_analysis/` (US-spelling placeholder) — the real implementation is
  `behaviour_analysis/` (UK spelling), which `main.py` imports.

**Client (`client/src/`)** — unused placeholder services/hook:

- `services/authService.js`, `services/sessionService.js` (both emitted
  PII-containing debug logs: emails/user objects), `hooks/useWebSocket.js`.

### Security issues fixed

| # | Issue | Severity | Fix |
| --- | --- | --- | --- |
| 1 | CORS fallback allowed **every** origin (Express + Socket.IO `*`) | High | Strict allowlist: `CLIENT_URL`, `CORS_ORIGINS` (env), localhost (dev only), `chrome-extension://`. No-Origin clients (curl/tests) still allowed. |
| 2 | `PUT /api/users/profile` allowed a password change **without** the current password | High | Now requires `currentPassword` and validates it; otherwise `400`. |
| 3 | `GET/POST /api/reports/*` were **public** (no auth) | High | All report routes now require a valid JWT (`protect`). |
| 4 | `server/config/db.js` printed `MONGO_URI` on import | Medium | File removed. |
| 5 | `ForgotPassword` page rendered the raw reset-token link in every build | Medium | Token link only rendered when `import.meta.env.DEV` (dev builds); production never shows it. |
| 6 | `LiveVerification` page attempted client-side face matching expecting raw embeddings | Medium | Rewritten to use the server-authoritative `POST /auth/verify-session-face`; no embeddings handled client-side. |
| 7 | `seed.js` hardcoded admin credentials + dead bcrypt code | Low/Medium | Admin credentials now read from `ADMIN_EMAIL`/`ADMIN_PASSWORD`; refuses the default password when `NODE_ENV=production`. |
| 8 | AI service CORS `*` + hardcoded `reload=True`/port 8000 | Low | CORS from `AI_CORS_ORIGINS` env; host/port/reload from env. |
| 9 | Client socket URL logic didn't support an explicit URL | Low | `VITE_SOCKET_URL` env supported with existing fallbacks. |
| 10 | PII debug logs in client services | Low | Removed with the placeholder services. |

### Verified secure (no change needed)

- Password hashing: bcrypt (cost 10), `select: false`, pre-save hook.
- JWT: expiry on all tokens (30 d app / 1 h pending / 15 min challenge);
  `protect` rejects pending/challenge tokens; socket handshake rejects them too.
- Role authorization: `admin` middleware + server-side `canControlSession`.
- Socket events: `join_room` gating, replay guard after COMPLETED/EXITED,
  WebRTC signal matrix participant↔reviewer only.
- FAIL CLOSED: auth DB down → 503; AI down during face/voice login → 503; PAD
  unreachable → no entry; EXAM camera/mic interruption → suspend.
- Biometric embeddings: `select: false`; only counts exposed via
  `GET /auth/face-embeddings`; never in JWT, logs, or reports.
- Rate limiting on auth + password-reset endpoints.
- Helmet active (CSP disabled intentionally for the SPA).
- Error handler hides stacks in production.
- `.env` gitignored (root, `server/`, `client/`, `ai-service/`).

### Found but intentionally left (documented)

- `GET /api/rooms` returns in-memory **demo seed rooms** (fictional participants)
  that power the RoomManager demo flow; real proctoring uses the socket flow.
- `client/src/utils/mockData.js` feeds the `/sessions` and `/analytics` demo UI
  pages (empty arrays / static charts). Real data lives in `/reports` and
  `/alerts`. Flagged in LIMITATIONS.md.
- `ai-service/liveness_detection/blink_detection/detector.py` (legacy cv2 blink
  detector) is still used by `liveness_pipeline.py` — kept intentionally.
- Legacy face-detection model files (`res10_300x300_ssd_iter_140000.caffemodel`,
  `deploy.prototxt`, haarcascade) are unused but kept (small; removal optional).
- `evaluation/` and `ai-service/evaluation/` harnesses remain as the Phase 3
  measurement artifacts.

## 2. Remaining TODO placeholders after cleanup

Verified none remain in production paths. The demo viewer pages
(`LiveMonitoring.jsx`, `FaceMeshViewer.jsx`, `EyeGazeViewer.jsx`, `HeadPoseViewer.jsx`,
`VoiceActivityViewer.jsx`, `ObjectDetectionViewer.jsx`, `BehaviourAnalysisViewer.jsx`,
`DecisionEngineViewer.jsx`) are real integrations against the AI service.

## 3. Files changed in Phase 4

Modified:

- `.env.example` (new), `server/server.js`, `server/controllers/userController.js`,
  `server/seed.js`, `server/routes/reportRoutes.js`, `ai-service/main.py`,
  `client/src/pages/ForgotPassword.jsx`, `client/src/hooks/useProctorSocket.js`,
  `client/src/pages/LiveVerification.jsx`, `README.md`

Deleted (dead code): see list above.

## 4. Audit method

- `read_subtree` / `list_directory` exploration of `server/`, `ai-service/`, `client/`.
- ripgrep searches for secrets, console logs, TODOs, mock data, localStorage,
  embeddings exposure, hardcoded URLs.
- Import-graph verification (`grep -rn require/from`) before every deletion.
