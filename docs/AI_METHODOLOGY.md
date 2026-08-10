# TrueView AI — AI Methodology (actual pipelines)

## FACE pipeline (authentication & pre-session)

```
Camera
  ↓ base64 JPEG frames
Face Detection (YuNet ONNX)
  ↓ bounding box
Liveness/PAD (MiniFASNetV2 ONNX)          Blink (MediaPipe blendshapes, client)
  ↓ live_score ≥ 0.50 threshold              ↓ OPEN→CLOSING→CLOSED→REOPEN count ≥ 1
  └──────────────┬───────────────────────────┘
                 ↓ both must pass (PAD REQUIRED; blink supplementary)
Face Embedding (SFace 128-D, server-side)
  ↓ cosine vs stored embeddings (threshold 0.48)
Identity Matching (backend decision)
  ↓
JWT issued ONLY at this single authorized decision point
```

Registration stores 128-D SFace embeddings in the user document (`select: false`).
Login (`face-login`) verifies: (1) multi-frame MiniFASNet PAD, (2) face match
against stored embeddings — both server-side. Pre-session checks use
`verify-session-face` (match only; no JWT issued).

## VOICE pipeline

```
Microphone
  ↓ audio
VAD (energy/ZCR custom; optional Silero in future)
  ↓ speech segments
ECAPA-TDNN (SpeechBrain, 192-D)  OR  custom acoustic vector (128-D)
  ↓ embedding
Speaker Matching (cosine, threshold 0.75)
  ↓
verified / not verified
```

- Registration: `voice-detection/extract-embedding` → stored with an honest
  `voiceModel` label (`ecapa-tdnn` vs `custom-acoustic-vector`), inferred from
  dimensionality (192 → ECAPA).
- Verification: `voice-detection/verify-speaker` uses the backend that produced
  the stored candidate.
- Multi-speaker analysis (`analyze-audio`): energy-gated speech windows are
  embedded and greedily clustered by cosine similarity; `speaker_count` and
  `multiple_speakers` are conservative heuristics (evidence, never accusation).

## SPEECH pipeline

```
Audio
  ↓ decode WAV
faster-whisper (optional, lazy-loaded)
  ↓ vad_filter=True, beam_size=5
Transcript + language
  ↓ keyword scan (configurable list)
keyword hits (content ONLY — never identity/liveness)
```

## VISION pipeline (monitoring)

```
Camera
  ↓
Face (YuNet)          Gaze (gaze_tracking)       Head Pose (head_pose)
  ↓                      ↓                          ↓
faces/absence          attention/iris               orientation classifier
  ↓                      ↓                          ↓
Object Detection (YOLOv11) → phone/unauthorized objects
  ↓
Behaviour Analysis (behaviour_analysis) → fused behaviour events
  ↓
events → socket `ai_event` → server policy severity
```

## FUSION pipeline

```
AI signals (per frame / per audio window)
  ↓
Event correlation + temporal fusion (trueview_engine)
  ↓
Confidence + uncertainty estimation
  ↓
Context-aware policy (session mode: EXAM/INTERVIEW/CLASS/MEETING)
  ↓
Severity computed SERVER-SIDE (sessionPolicies.js)
  ↓
Alert (trust score decay)
  ↓
Human review (reviewer dashboard + reviewer feedback logging)
  ↓
Evidence-based report
```

Individual signals are never treated as automatic proof of misconduct — severity
and suspension follow the session policy, and a human reviewer confirms events
(reviewer feedback is stored via `/ai-api/ai/feedback/submit`).
