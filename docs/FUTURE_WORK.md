# TrueView AI — Future Work

These are realistic improvements that are **not implemented**. Nothing here is
described as already working.

## Real-time & scale

1. **Multi-participant WebRTC** — replace the 1:1 participant↔reviewer relay with
   an SFU (e.g. mediasoup/Janus) so one reviewer can view many candidates, and
   candidates can be grouped. Requires a media server.
2. **Horizontal scaling** — move `activeSessions` out of process memory into
   Redis, so multiple Node instances share session state; add sticky-socket or
   socket adapter clustering.
3. **Dedicated media relay / TURN** — production STUN/TURN for NAT traversal.

## AI improvements

4. **Silero VAD** — integrate `snakers4/silero-vad` (ONNX) to replace/augment the
   custom energy/ZCR detector for more robust voice activity.
5. **Larger evaluation datasets** — collect a consented, diverse dataset
   (multiple ethnicities, lighting conditions, devices) to measure real FAR/FRR,
   EER, and PAD attack detection on phone/monitor/video attacks.
6. **GPU / edge inference** — ONNX GPU providers and model quantization (INT8)
   to cut PAD/recognition latency further.
7. **Advanced replay/deepfake detection** — temporal consistency checks,
   frequency-artifact models, and face-motion-vs-audio sync analysis.
8. **Personalized behavioural modelling** — per-user baselines for gaze/pose to
   reduce false positives from natural behavior.
9. **Privacy-preserving biometric learning** — federated or homomorphic approaches
   so embeddings are never centralized in cleartext.

## Authentication & security

10. **httpOnly cookies** for the application JWT (CSRF tokens + strict SameSite)
    instead of localStorage, reducing XSS exposure.
11. **Email-based password reset** — send reset links through a real provider and
    stop returning tokens in API responses (the dev-only fallback is for demos).
12. **Biometric template protection** — apply cancellable/biometric-template
    transforms before storage.
13. **Rate limiting on all sensitive endpoints**, plus per-account lockout after
    repeated failed biometric attempts (attempt counters already exist in the
    User model).
14. **Audit logging** — structured, anonymized logs for compliance review.

## Platform

15. **Model/service registry** — explicit version pinning and health checks for
    each AI model; `/health` per-module with model-availability flags.
16. **Session persistence hardening** — write-ahead journaling of in-memory
    session state so a server restart doesn't lose live rooms.
17. **Advanced anomaly detection** — ML-based outlier detection over the fused
    telemetry stream rather than fixed thresholds only.
18. **Mobile/browser matrix testing** — verify camera/mic behavior across
    browsers (Chrome, Firefox, Edge, Safari) and OS permission flows.
19. **Localization & accessibility** for reviewer/participant UIs.
