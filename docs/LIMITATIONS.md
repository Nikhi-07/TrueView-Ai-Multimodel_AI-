# TrueView AI — Known Limitations

Honest engineering means stating what the system cannot do. None of these are
hidden; each has a corresponding mitigation where one exists.

## Data & evaluation

1. **Small evaluation dataset** — face/PAD evaluations used 2 live + 3 attack
   samples; recognition FAR is heavily influenced by dataset artifacts. Results
   are indicative, not production-grade.
2. **Blink metrics are synthetic** — TPR/FPR measured on generated blendshape
   traces, not real cameras.
3. **No real-speaker EER** — speaker verification was calibrated on synthetic
   voices; a real EER requires consenting human speakers (ethically gated).

## AI & models

4. **PAD is not 100 % spoof-proof** — MiniFASNetV2 detects printed photos and
   common screen replays; advanced deepfakes / high-fidelity video replay may
   evade it. No anti-spoofing system is perfect.
5. **ECAPA-TDNN is optional** — if SpeechBrain/torchaudio are not installed, the
   custom 128-D acoustic vector is used (honestly labeled). Discrimination is
   weaker.
6. **Whisper transcription is optional** — offline environments run without it;
   content analysis is then unavailable (endpoint reports `available: false`).
7. **Silero VAD not integrated** — voice activity uses a custom energy/ZCR
   detector, which is more sensitive to background noise.
8. **Lighting / camera sensitivity** — face detection, PAD, and gaze all degrade
   in poor lighting, motion blur, or low-resolution cameras.
9. **Audio noise** — VAD and speaker verification degrade with background noise,
   multiple simultaneous speakers, or distant microphones.
10. **Generalization** — models were not fine-tuned on the deployment population;
    FAR/FRR will vary across demographics and devices.

## System & infrastructure

11. **WebRTC is 1:1 participant↔reviewer** — the server relays one reviewer's
    subscription; multi-participant mesh (many candidates to one reviewer) is
    not implemented (see FUTURE_WORK).
12. **Browser permission dependency** — the system requires camera+mic granted by
    the OS/browser; it cannot and does not bypass permissions. Strict EXAM mode
    suspends on interruption by design.
13. **CDN dependency for MediaPipe** — face-landmarker assets load from CDNs; if
    unreachable, blink becomes unavailable and entry gates on server PAD only.
14. **MongoDB availability** — the API degrades gracefully when MongoDB is down
    (in-memory session authority remains), but registrations/logins requiring DB
    lookups fail closed.
15. **In-memory session state** — `activeSessions` lives in the Node process;
    restarting the server loses live-room state (reports persist if Mongo was up).
16. **Demo room data** — `GET /api/rooms` returns in-memory seed/demo rooms with
    placeholder participants; real proctoring sessions are created through the
    socket flow, not these seed records.
17. **Limited concurrent testing** — load tested to 50 socket sessions; no
    multi-node horizontal scaling tests.
18. **Demo-only analytics pages** — `/sessions` and `/analytics` render empty/mock
    UI datasets (`utils/mockData.js`); real data lives in the reports/alerts APIs.

## Security constraints

19. **Password reset token returned to client** — without an email provider the
    demo returns the reset token in the API response (displayed only in dev
    builds). Production must email it.
20. **No formal pen-test** — the security test suite (`evaluation/security_test.js`)
    covers the main flows; a full third-party penetration test was not performed.
21. **JWT in localStorage** — standard for this class of SPA, but an XSS vector;
    httpOnly cookies would be stricter (listed under FUTURE_WORK).
22. **AGPL-3.0 YOLO** — YOLOv11 licensing must be reviewed for commercial
    redistribution.
