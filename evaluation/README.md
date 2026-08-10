# TrueView AI – Model Evaluation Harness

This directory is the controlled evaluation harness for measuring **actual** AI
performance. It exists to support academically defensible claims. Metrics are
never fabricated: if a dataset folder is empty, the report returns
`NOT MEASURED`.

## Dataset layout

```
evaluation/dataset/
├── face/
│   ├── live/            # real-person photos:   <subject>__<sample>.jpg  (user_01__, user_02__, …)
│   ├── printed_photo/   # printed photo attacks (of the same AND other subjects)
│   ├── phone_photo/     # phone-screen photo attacks (NOT MEASURED until samples exist)
│   ├── monitor_photo/   # monitor-screen photo attacks (NOT MEASURED until samples exist)
│   └── video_replay/    # frames captured from a video replay (NOT MEASURED until samples exist)
├── voice/
│   ├── registered/      # registered speaker clips:  <subject>__<sample>.wav (16 kHz mono)
│   ├── unknown/         # clips from people NOT registered
│   ├── multiple_speakers/
│   ├── noise/
│   └── silence/
└── blink/
    ├── blink/           # JSON: array of {"t": sec, "left": 0..1, "right": 0..1} (positive class)
    ├── no_blink/        # JSON: eyes open the whole sequence (negative)
    ├── head_movement/   # JSON: head motion with NO eye closure (tilt immunity)
    ├── laptop_tilt/     # JSON: laptop/camera tilt with no eye closure (tilt immunity)
    └── camera_movement/ # JSON: camera jitter with no eye closure (tilt immunity)
```

Blink JSON format:

```json
[
  { "t": 0.00, "left": 0.10, "right": 0.10 },
  { "t": 0.15, "left": 0.80, "right": 0.85 },
  { "t": 0.30, "left": 0.95, "right": 0.95 },
  { "t": 0.45, "left": 0.10, "right": 0.10 }
]
```

## Ethics / responsible collection

### Purpose
This dataset exists solely to measure the TrueView AI biometric models under
controlled, reproducible conditions. It is a local engineering artifact.

### Collection procedure
1. Recruit adult volunteers who can give informed consent. Use the participant
   identifier `USER_01`, `USER_02`, … — never names, emails, or other PII.
2. For each volunteer collect:
   - **Face:** 3–5 live photos in different lighting/distance, plus a printed
     photo of their own face (held toward the camera) for the attack set.
   - **Voice:** 3–5 clips (5–10 s, 16 kHz mono) of a varying dynamic phrase.
   - **Blink:** a 10–20 s webcam clip: natural blinking, then eyes-open with
     laptop tilt (no blink).
3. Convert attack captures (printed photo, phone display, monitor display,
   video replay) into the matching `face/printed_photo`, `phone_photo`,
   `monitor_photo`, `video_replay` folders.

### Consent requirements
- Each participant must sign/acknowledge a consent form describing: what is
  collected, why, how it is stored, who can access it, and how to request
  deletion. A consent template is included in this repository (`CONSENT.md`).
- Minors are excluded. Participants may withdraw at any time; their samples
  are deleted immediately and excluded from any reported metrics.

### Data handling, anonymization, storage, deletion
- **Never upload** biometric samples anywhere automatically. This dataset is
  local-only unless explicit consent exists.
- Samples are stored under anonymous identifiers only; mapping between
  identifiers and identities is kept outside the dataset and deleted with the
  samples.
- Store raw samples on encrypted local storage. Prefer storing embeddings,
  events, and scores over raw media where possible.
- Deletion: remove the participant's folder (and any derived embeddings) on
  request. `dataset/` contains no PII by construction.

### Dataset limitations
- Bundled samples come from the public MiniFASNet author repository
  (`https://github.com/yakhyo/face-anti-spoofing`, MIT) and are labeled as the
  author labeled them. Results are **preliminary** and only demonstrate the
  harness on reproducible attacks — they are not a substitute for a consented,
  multi-subject evaluation.
- Phone/monitor/video-replay attack categories and real-speaker voice metrics
  are reported `NOT MEASURED` until real samples exist.

## Running the harness

From the project root (AI service dependencies must be installed first):

```bash
cd ai-service && pip install -r requirements.txt
cd ../evaluation && python run_evaluation.py --all
```

Subcommands:

| Flag | Evaluates |
| --- | --- |
| `--face` | SFace recognition: TAR, FAR, FRR, accuracy |
| `--liveness` | MiniFASNet PAD: per-attack ADR, FAR, FRR |
| `--voice` | ECAPA-TDNN verification: accuracy, FAR, FRR, EER |
| `--blink` | MediaPipe blendshape blink: TPR, FPR |
| `--perf` | Inference latency: mean + p95 per model (synthetic frames) |
| `--all` | Everything above |

Results are printed to the console and written to
`evaluation/results/evaluation_report.json`.

## Metric definitions

- **TAR** True Acceptance Rate = genuine acceptances / genuine attempts
- **FAR** False Acceptance Rate = impostor/attack acceptances / impostor attempts
- **FRR** False Rejection Rate = 1 − TAR
- **ADR** Attack Detection Rate = detected attacks / attacks (liveness)
- **TPR/FPR** True/False Positive Rate (blink)
- **EER** Equal Error Rate where genuine & impostor score distributions exist

Reported values are measured on the local dataset only and should be described
as such in any write-up. Claims like "100% accurate" are never produced by this
harness.
