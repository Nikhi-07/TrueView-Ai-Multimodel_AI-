# TrueView AI — Real-Time Communication (Socket.IO + WebRTC)

> Source of truth: `server/sockets/proctorSocket.js` (server) and
> `client/src/hooks/useProctorSocket.js`, `useParticipantBroadcast.js`,
> `useReviewerSubscriber.js` (client).

## Connection & Authentication

- The client connects with `auth: { token }` (application JWT from `localStorage`).
- The server runs a handshake middleware (`io.use`): it verifies the JWT, rejects
  pending/biometric-incomplete tokens, loads the user, and attaches
  `socket.authUser = { id, name, email, role }`.
- **Reviewer authority is derived ONLY from `socket.authUser.role === 'admin'`**
  (`canControlSession`). A client-supplied role in `join_room` is display-only.
- Sockets without a token are treated as participants and may only join rooms.

## Authorization model (who can do what)

| Action | Allowed for | Enforcement |
| --- | --- | --- |
| `join_room` | anyone (participant or reviewer) | must provide `sessionId`; joins `room_<sessionId>` |
| `start_session` | reviewer only (JWT admin) | `canControlSession` — non-admin is blocked |
| `update_media_status` | sockets that joined **this** room | `socket.sessionId === sessionId` |
| `ai_event` | sockets that joined **this** room; blocked after COMPLETED/EXITED | joined check + replay guard |
| `reviewer_command` | reviewer only | `canControlSession` |
| `subscribe_stream` | reviewer only | `canControlSession` |
| `webrtc_signal` | participant↔reviewer pairs only | matrix below |

WebRTC signaling matrix (`webrtc_signal` with `signal.type`):

| Signal | Sender | Target | Allowed |
| --- | --- | --- | --- |
| `offer` | participant | reviewer | yes |
| `answer` | reviewer | participant | yes |
| `ice` | participant | reviewer (or vice versa) | yes |
| any signal | participant | participant | **no** |
| any signal | reviewer | reviewer | **no** |

Signals are only relayed when the target socket is in the same room
(`targetSocket.sessionId === sessionId`).

## Event catalog (server → client, room-broadcast unless noted)

| Event | Payload | Receivers | Notes |
| --- | --- | --- | --- |
| `session_state` | full session state + `serverNow` | joining socket | initial state on join |
| `SESSION_TIMER_SYNC` | `serverNow, startedAt, endTime, sessionDuration, status` | joining socket + room on start/resume | server clock only |
| `SESSION_TIMER_UPDATE` | `serverNow, remainingSeconds, endTime` | room | every 5 s sweep while LIVE |
| `SESSION_TIMER_WARNING` | `minutesRemaining, message` | room | at configurable thresholds (default 10,5,1 min) |
| `SESSION_STARTED` | `{ session }` | room | reviewer `start_session` |
| `SESSION_STATE_CHANGED` | `{ status, session }` | room | every state change |
| `SESSION_SUSPENDED` | `{ session, reason, message }` | room | EXAM device interruption / thresholds / reviewer |
| `SESSION_RESUMED` | `{ session }` | room | reviewer resume |
| `SESSION_COMPLETED` | `{ session, completedByTimer }` | room | manual end or timer expiry |
| `MEDIA_STATUS_CHANGED` | `{ deviceType, status, cameraStatus, microphoneStatus, reason }` | room | camera/mic updates |
| `AI_EVENT` | normalized alert | room | AI/behaviour events (severity recomputed server-side) |
| `ALERT_CREATED` | alert | room | same as AI_EVENT |
| `TRUST_SCORE_UPDATED` | `{ trustScore }` | room | after each event |
| `THRESHOLD_EXCEEDED` | `{ alertCount, criticalAlertCount, trustScore }` | room | auto-suspension trigger |
| `LIVENESS_CHALLENGE_REQUESTED` | `{ challengeType, timestamp }` | room | reviewer `TRIGGER_LIVENESS` |
| `OFFICIAL_WARNING_ISSUED` | `{ message, timestamp }` | room | reviewer `ISSUE_WARNING` |
| `REVIEWER_ACTION` | `{ command, payload }` | room | fallback passthrough |
| `STREAM_OFFER_REQUESTED` | `{ reviewerSocketId }` | room | reviewer `subscribe_stream` → participants prepare offers |
| `webrtc_signal` | `{ sessionId, sender, signal }` | target socket | relayed signaling |
| `room_participants_updated` | `{ participantsCount, participants }` | room | join/leave |

## Client → server events

| Event | Payload | Who | Purpose |
| --- | --- | --- | --- |
| `join_room` | `{ sessionId, role, user, sessionType, sessionDuration }` | all | register into room state |
| `start_session` | `{ sessionId, sessionDuration }` | reviewer | start server timer |
| `update_media_status` | `{ sessionId, deviceType, status, reason }` | participant | report camera/mic interruption |
| `ai_event` | `{ sessionId, eventType, confidence, description, evidence }` | participant app | AI monitoring events (severity computed server-side) |
| `reviewer_command` | `{ sessionId, command, payload }` | reviewer | PAUSE / SUSPEND / RESUME / END / TRIGGER_LIVENESS / ISSUE_WARNING |
| `subscribe_stream` | `{ sessionId }` | reviewer | ask participants to send WebRTC offers |
| `webrtc_signal` | `{ sessionId, target, signal }` | participant/reviewer | relayed to target |

## Reconnection

- Client `socket.io-client` reconnects up to 10 attempts (1 s delay) and
  re-emits `join_room` with the stored join config on `connect`/`reconnect`.
- The server keeps `activeSessions` in memory; a reconnecting participant is
  re-added to the room and receives the current `session_state` + timer sync.
- Timers run on the **server clock**; browser clocks are never trusted.

## Resource lifecycle

- `disconnect` removes the participant, emits `PARTICIPANT_LEFT` (severity from policy), and broadcasts updated participant lists.
- Completed sessions are dropped from the in-memory map after a 10-minute grace period; the timer sweep interval is unref'd so it never blocks process exit.
