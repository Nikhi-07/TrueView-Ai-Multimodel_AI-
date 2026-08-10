# TrueView AI — Session Policies

> Source of truth: `server/utils/sessionPolicies.js` (authoritative) mirrored by
> `client/src/utils/sessionPolicies.js` for display. The backend never trusts
> client-supplied severity.

## Session modes

| Mode | Strictness | warningLimit | criticalLimit | suspensionLimit |
| --- | --- | --- | --- | --- |
| EXAM | STRICT | 5 | 3 | 1 |
| INTERVIEW | MODERATE | 8 | 5 | 3 |
| CLASS | PERMISSIVE | 15 | 10 | 5 |
| MEETING | MINIMAL | 20 | 15 | 10 |

## Severity table (signal × mode)

| Signal | EXAM | INTERVIEW | CLASS | MEETING |
| --- | --- | --- | --- | --- |
| Camera interruption | CRITICAL – suspend immediately | HIGH – notify & pause | MEDIUM – warn | LOW – notify only |
| Microphone interruption | CRITICAL – suspend immediately | HIGH – notify & pause | MEDIUM – warn | LOW – notify only |
| Unknown speaker | HIGH | MEDIUM | INFO | INFO |
| Multiple speakers | HIGH | MEDIUM | INFO | INFO |
| Phone detected | HIGH | HIGH | INFO | INFO |
| Unauthorized object | HIGH | MEDIUM | INFO | INFO |
| Multiple faces / persons | CRITICAL | MEDIUM | INFO | INFO |
| Gaze deviation / looking away | MEDIUM (≥2 s) | LOW (≥6 s) | INFO (≥15 s) | INFO (≥30 s) |
| Face absence / user absent | HIGH | MEDIUM | LOW | INFO |
| Voice/speech detected | MEDIUM (voice disallowed) | INFO (speech allowed) | INFO | INFO |
| Identity mismatch | CRITICAL | HIGH | INFO | INFO |
| Liveness/PAD failure | CRITICAL | HIGH | INFO | INFO |
| AI engine offline | CRITICAL (auto-suspend) | MEDIUM | MEDIUM | MEDIUM |
| Participant joined/left, session started | INFO (all modes) | INFO | INFO | INFO |

Notes:

- `evaluateEventSeverity(eventType, sessionType)` maps every event type; unknown
  types default to `LOW`.
- Auto-suspension triggers (server-side, in `proctorSocket.js`):
  - `criticalAlertCount >= criticalLimit`
  - `alertCount >= warningLimit * 3`
  - `trustScore <= 20`
  - EXAM + `AI_ENGINE_OFFLINE`
  - EXAM + camera/mic `INTERRUPTED` (immediate)
- Trust score decay per event: CRITICAL −30/−25 (severity/policy paths),
  HIGH −15, MEDIUM −8, LOW −3 (min 0).

## What is NOT automatic proof

A single signal (e.g., one gaze deviation) produces a LOW/MEDIUM event and a
trust-score decrement — it never suspends a session by itself. Combinations such
as gaze deviation + phone detection + unknown speaker accumulate into a HIGH
alert and eventually a suspension when policy limits are crossed. Every event
goes through the alert engine and is available for human review.
