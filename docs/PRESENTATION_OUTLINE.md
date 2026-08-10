# TrueView AI — Presentation Outline (10–15 slides)

## Slide 1 — Title
TrueView AI: Context-Aware Multimodal AI Monitoring for Online Proctored
Sessions. Your name/roll/guide. One-line summary (see NOVELTY.md).

## Slide 2 — Problem
Identity fraud in online exams; photo/screen spoofing; unverifiable ambient
behavior (phone, other people, unknown speakers); lack of auditable evidence.

## Slide 3 — Motivation
Remote assessments grew post-2020; trust gap between "who registered" and "who
is present"; point solutions (face-only, voice-only) have high false positives.

## Slide 4 — Existing Systems
Commercial proctoring (ProctorU, Honorlock, Mettl); research baselines
(Silent-Face-Anti-Spoofing, ECAPA-TDNN, MediaPipe). Limitations: closed,
single-signal, weak evidence trails.

## Slide 5 — Proposed System
Password + face (PAD-gated) + voice authentication; multimodal monitoring;
context-aware policies; server-authoritative session engine; human review;
evidence-based reports. (Refer to docs/NOVELTY.md for honest positioning.)

## Slide 6 — Architecture
Diagram: client (React) → server (Express + Socket.IO + MongoDB) and client →
AI service (FastAPI). Three services, ports 5173/5000/8000.

## Slide 7 — AI Pipeline
Face: YuNet → MiniFASNet PAD → SFace embedding → match.
Voice: VAD → ECAPA-TDNN/custom → verify.
Vision: gaze/head pose/YOLO → behaviour events.
Speech: Whisper content (optional). Fusion → policy → alert.

## Slide 8 — Authentication + Liveness
3-stage registration; 3-stage login; scoped JWTs; FAIL CLOSED; MiniFASNet PAD
as a hard gate; blink as supplementary liveness.

## Slide 9 — Proctor Room
PreSessionCheck (device + PAD + blink + identity); live camera/mic; WebRTC relay
participant↔reviewer; timer; auto-suspension.

## Slide 10 — Behaviour + Alerts
Single signal ≠ proof. Severity from session policy (EXAM/INTERVIEW/CLASS/
MEETING). Trust score decay; thresholds; reviewer feedback loop.

## Slide 11 — Results
PAD ADR 1.0 (3 samples), blink TPR/FPR 1.0/0.0 (synthetic), alert mapping 48/48,
50 concurrent socket sessions, ~82 MB Node RSS. Show the table from EVALUATION.md
and be explicit about NOT MEASURED items.

## Slide 12 — Demo
Live walkthrough: register → face → voice → login with photo-spoof rejection →
EXAM session → controlled event → suspension → report. (See DEMO_GUIDE.md.)

## Slide 13 — Limitations
Small datasets; synthetic voice calibration; PAD not spoof-proof; WebRTC 1:1;
browser permission dependence; demo analytics data. (LIMITATIONS.md.)

## Slide 14 — Future Work
SFU multi-participant streaming; Silero VAD; larger consented datasets; GPU/edge
inference; deepfake detection; httpOnly cookies; retention policies.

## Slide 15 — Conclusion
System-level engineering contribution: secure multi-stage biometric identity,
server-authoritative monitoring, context-aware fusion, human-in-the-loop
review — measured honestly. Q&A.

---
Tip: slides 8, 10, and 13 are the ones examiners probe most — rehearse the
FAIL-CLOSED paths and the limitations.
