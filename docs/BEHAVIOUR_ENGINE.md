# TrueView AI — Behaviour Engine & Alert Fusion

## Principle

Individual AI signals are **NOT** automatic proof of misconduct. TrueView's
behaviour engine fuses multiple signals with context (session type, frequency,
duration, confidence) into evidence that a human reviewer evaluates.

```
Gaze deviation alone            → LOW / no alert
Gaze deviation + phone + unknown speaker → HIGH alert (policy-dependent)
```

## Signals

| Signal | Source | Direction |
| --- | --- | --- |
| Gaze deviation / looking away | gaze_tracking (`eye-gaze`) | more = worse |
| Head pose / orientation | head_pose | supporting evidence |
| Phone / unauthorized object | YOLOv11 (`object-detection`) | strong |
| Face absence / user absent | YuNet face detection | strong in EXAM |
| Multiple faces / persons | face detection | strong in EXAM |
| Voice activity | VAD (`voice-detection/process-audio`) | mode-dependent |
| Unknown / multiple speakers | ECAPA or custom embeddings clustering | mode-dependent |
| Registered speaker | speaker verification vs stored embedding | positive/neutral |
| Speech content keywords | faster-whisper (`speech-analysis`) | context only |
| Liveness / PAD failure | MiniFASNet | critical in EXAM |
| Device interruption | `useControlledMediaStream` → socket | critical in EXAM |

## Event → severity mapping

Each AI event type is normalized (`VALID_EVENT_TYPES`) and mapped through
`evaluateEventSeverity(type, mode)` **server-side** (see SESSION_POLICIES.md).
Client-supplied severity is ignored.

## Fusion inputs

- **Confidence** — clamped 0..1; from the AI module.
- **Frequency** — cumulative alert counts per session.
- **Duration** — temporal windowing by the trueview_engine (memory engine,
  temporal fusion, event correlation) before an event is confirmed.
- **Session type** — the policy table above.
- **Policy** — warning/critical/suspension limits + trust score.

## Output

- `AI_EVENT` / `ALERT_CREATED` broadcast to the room.
- Trust score decay (`TRUST_SCORE_UPDATED`).
- Auto-suspension when limits are exceeded.
- All events persist as `Alert` documents for the report timeline.

## Human-in-the-loop

- The reviewer dashboard lists alerts with evidence.
- Reviewer feedback (`CONFIRMED | FALSE_POSITIVE | DISMISSED | UNCERTAIN`) is
  logged via `POST /ai-api/ai/feedback/submit` and stored by
  `trueview_engine/feedback/reviewer_feedback.py`.
- The report uses evidence-based wording — it counts events and reports
  thresholds, it does not accuse.

## Trust score (0–100)

Starts at 100. Decays by severity on every event. The score and the policy
limits drive auto-suspension. It is a monitoring signal, not a verdict.
