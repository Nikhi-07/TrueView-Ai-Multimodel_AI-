# TrueView AI — Demonstration Guide (major-project demo)

A reproducible 20-step demo of the real system. **No fake AI events** — every
step below uses an actual endpoint or flow. Allow ~20 minutes.

## Pre-requisites (do before the demo)

1. Start all three services (see SETUP.md): AI service (:8000), backend (:5000),
   frontend (:5173). Confirm `http://localhost:8000/health` → `{"status":"ok"}`
   and `http://localhost:5000/api/health`.
2. Confirm MongoDB is up (health endpoint shows `"db": "connected"`).
3. Seed admin: `cd server && npm run seed` (creates `admin@trueview.ai`).
4. Have two browser profiles/tabs: one for the **reviewer** (admin) and one for
   the **participant** (fresh account).
5. Have a printed photo of a face ready for the spoof-rejection step.

## The 20 steps

| # | Step | How | What happens (real) |
| --- | --- | --- | --- |
| 1 | Show architecture | Walk through docs/ARCHITECTURE.md + the repo tree | 3 services: client/server/ai-service |
| 2 | Register participant | `/register` — name/email/password | Account created `PENDING_FACE_REGISTRATION` |
| 3 | Register face | `/register-face` — allow camera | PAD check → SFace embedding → stored server-side |
| 4 | Register voice | `/register-voice` — allow mic, read phrase | VAD → speaker embedding → stored; account `ACTIVE` |
| 5 | Logout | logout button | token cleared |
| 6 | Login (password + live face) | `/login` — password, then look at camera | verify-credentials → challenge token → multi-frame PAD → face match → JWT |
| 7 | Demonstrate liveness | watch the login step 2 | MiniFASNet + blink gate shown in UI |
| 8 | Photo spoof rejection | during login/face registration hold a **printed photo** to the camera | PAD returns SPOOF → login blocked (`LIVENESS_FAILED`) — this is the money shot |
| 9 | Reviewer creates EXAM session | reviewer logs in as admin → RoomManager → create room (EXAM) | room created (in-memory) |
| 10 | Participant joins | participant opens the room link | socket `join_room` → state READY |
| 11 | Device check | PreSessionCheck screen | camera/mic granted, PAD+blink+identity verified → ENTER enabled |
| 12 | Enter Proctor Room | click ENTER | participant room loads |
| 13 | Show camera/mic status | participant UI + reviewer | `MEDIA_STATUS_CHANGED` events, status badges |
| 14 | Show live AI monitoring | reviewer view | AI events stream (gaze/pose/face/voice) from `/ai/session/{id}/process` |
| 15 | Demonstrate registered speaker | participant speaks clearly (INTERVIEW/CLASS mode) | `REGISTERED_SPEAKER` (INFO) event — speaker matches profile |
| 16 | Controlled AI event | reviewer `TRIGGER_LIVENESS` (or participant looks away / covers face in EXAM) | `LIVENESS_CHALLENGE_REQUESTED` / `GAZE_DEVIATION` / `NO_FACE_DETECTED` |
| 17 | Show reviewer alert | reviewer alert feed | `ALERT_CREATED` with policy severity + trust score drop |
| 18 | Demonstrate suspension | EXAM: disable camera (or let critical alerts accumulate) | server auto-suspends → `SESSION_SUSPENDED`; reviewer can `RESUME_SESSION` |
| 19 | Complete/end session | reviewer `END_SESSION` (or wait for timer expiry) | status COMPLETED → report auto-generated |
| 20 | Open generated report | `/reports` | evidence-based report with score, counts, timeline |

## Demo talking points

- **Security**: passwords bcrypt; embeddings never leave the server; JWT only
  after liveness + face match; server-authoritative severity; fail-closed paths.
- **Privacy**: only event metadata persisted; no raw media/embeddings in reports.
- **Honesty**: show EVALUATION.md — small datasets, synthetic voice calibration,
  PAD not 100 %; then state the engineering contribution (integration + fusion
  + human-in-the-loop, not a new model).
- **Spare steps** if time allows: `security_test.js` output (auth bypass
  attempts rejected), `load_test.js` (50 concurrent sessions).

## What NOT to do in the demo

- Do not claim "impossible to cheat" or "100 % accurate".
- Do not fabricate alerts — let the real engine produce them.
- Do not demo voice verification in EXAM mode expecting INFO (EXAM treats
  voice as disallowed — use INTERVIEW mode for step 15).
