# TrueView AI — Privacy & Data Handling

This document explains how TrueView handles personal and biometric data. It does
**not** claim legal compliance with any specific regulation (GDPR, etc.) — that
requires a qualified legal review of the deployment.

## Why the camera is required

- **Registration**: to capture face embeddings used for identity verification.
- **Login**: live face frames are checked for liveness/PAD and matched against
  the registered embedding before a session token is issued.
- **Monitored sessions**: continuous face presence, gaze, head pose, and object
  detection are the monitoring signals in strict modes.

## Why the microphone is required

- **Registration**: to capture the voice embedding used for speaker verification.
- **Monitored sessions**: voice activity, speaker verification, multiple-speaker
  detection, and (optionally) speech content analysis.

## Face registration

- During registration the AI service detects the face, runs MiniFASNet PAD, and
  extracts a 128-D SFace embedding.
- Only the embedding is stored (in MongoDB, `select: false`). Raw face images
  from registration are **not stored**.
- The client never receives the stored embedding; verification is server-side.

## Voice registration

- The AI service extracts a speaker embedding (192-D ECAPA-TDNN when available,
  else a 128-D custom acoustic vector, labeled honestly).
- Only the embedding is stored; raw audio recordings are **not stored**.

## Liveness detection & speaker verification

- Liveness checks run against frames in flight; frames are not persisted.
- Speaker verification runs server-side against the stored embedding. Audio
  samples used for verification are not persisted.

## AI monitoring (sessions)

- Frame-level telemetry is analyzed in real time. Individual frames are not
  saved; only **events** (e.g. `PHONE_DETECTED`, `CAMERA_INTERRUPTED`) with
  timestamps, severity, and short descriptions are persisted as alerts.

## Event storage

- Alerts are stored in MongoDB (`alerts`) with `sessionId`, `participantId`,
  `userEmail`, event type, severity, confidence, description, timestamp.
- Sessions (`sessions`) store summary counters (phone detections, distractions,
  alert counts, trust score) — not raw media.

## Reports

- Reports aggregate alert counts and a timeline. Reports contain **no biometric
  vectors** and no raw media — only event metadata and computed scores.

## Data retention

- Alerts and reports are retained in MongoDB indefinitely by default. Retention
  policies (e.g. 90/180-day deletion) are **not implemented** and should be
  configured by the deployment owner.

## Data deletion

- A user can delete their own account via `DELETE /api/users/account` (removes
  the user document, including embeddings).
- There is no bulk/cascade deletion of that user's alerts/sessions/reports yet —
  this is a gap to close before production (see FUTURE_WORK).

## Human review

- Alerts are presented to a reviewer (admin role) in the reviewer dashboard.
- Reviewer decisions (`CONFIRMED | FALSE_POSITIVE | DISMISSED | UNCERTAIN`) are
  logged via the feedback endpoint and stored in memory by the AI engine.

## Security controls in place

- Embeddings: `select: false` in Mongoose; only read explicitly inside auth
  controllers; never returned by API endpoints (the face-embeddings endpoint
  returns counts only).
- Passwords: bcrypt-hashed, `select: false`.
- JWT: short-lived scoped tokens during registration/login; full token only after
  all biometric gates pass.
- CORS: strict allowlist (Phase 4); Socket.IO JWT handshake; WebRTC relay
  authorization; rate limiting on auth endpoints.
- Secrets: environment variables only (`.env` gitignored; `.env.example` ships
  placeholders).

## System limitations (privacy-relevant)

- Browser permissions are OS/browser-controlled; TrueView never attempts to
  bypass them. In strict EXAM mode, a required-camera/mic interruption suspends
  the session.
- Monitoring is not infallible: false positives/negatives are possible; every
  event is human-reviewable and the report uses evidence-based wording.
- MediaPipe asset loading depends on public CDNs (network metadata is visible to
  the CDN provider).
- The demo seed contains fictional participant data; do not seed production with
  demo records.

## Recommendations before real deployment

1. Define and implement retention/deletion policies (including cascade deletes).
2. Provide a privacy notice + consent flow before enabling camera/mic.
3. Deploy with HTTPS; restrict `AI_CORS_ORIGINS` and `CORS_ORIGINS`.
4. Obtain legal review of biometric-data handling for your jurisdiction.
