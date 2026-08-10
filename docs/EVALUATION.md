# TrueView AI — Evaluation (Phase 3 results)

> All values below are copied from the actual measurement files under
> `evaluation/results/` (`evaluation_report.json`, `load_test.json`,
> `resource_usage.json`). Nothing is fabricated; anything not measured is marked
> NOT MEASURED. Re-run the harness with `python evaluation/run_evaluation.py --all`.

## 1. Face recognition (SFace)

- **Dataset**: `evaluation/dataset/face/` — model-author labeled public sample images.
- **Method**: enroll first live image per subject; remaining live images are genuine probes; other-subject and attack images are impostor probes. Cosine threshold 0.48.
- **Results**:
  - Subjects enrolled: 2
  - Genuine probes: **0** → TAR / FRR / accuracy: **NOT MEASURED**
  - Impostor probes: 5 → **FAR = 0.6** (3/5 accepted; 1 accepted from a `printed_photo` category sample)
  - Cross-subject similarity matrix showed near-1.0 similarity between the two sample subjects — an artifact of the tiny, model-author-labeled dataset (documented as a caveat in the harness output).
- **Limitations**: dataset far too small to claim recognition accuracy; FAR reflects dataset artifacts more than model behavior.

## 2. Liveness / PAD (MiniFASNetV2)

- **Dataset**: `evaluation/dataset/face/live` (2) + `face/printed_photo` (3).
- **Method**: per-image `analyze_frame`; LIVE if `live_score ≥ 0.50`.
- **Results**:
  - Live samples: 2 — **false rejection rate (live) = 0.0**
  - Attack samples: 3 (printed photo) — all 3 detected — **false acceptance rate (attack) = 0.0**
  - **Overall attack detection rate = 1.0**
- **Limitations**: small sample; only printed-photo attacks present (phone/monitor/video categories had no samples in this dataset → NOT MEASURED for those categories).

## 3. Blink detector

- **Dataset**: synthetic blendshape traces (`gen_traces.py`): 3 positive (blink), 7 negative (no-blink, head movement, laptop tilt, camera movement).
- **Results**: TP 3, FN 0, FP 0, TN 7 → **TPR 1.0, FPR 0.0, accuracy 1.0**.
- **Note**: tilt/camera-motion negatives verify head motion does not register as a blink. Synthetic data only — real-camera evaluation is NOT MEASURED.

## 4. Voice verification (ECAPA-TDNN / custom)

- **Status**: **SYNTHETIC PIPELINE CALIBRATION — NOT real-speaker FAR/FRR/EER**.
- Dataset: 3 synthetic speakers, 3 genuine + 6 impostor score pairs.
- Threshold curve measured (FAR/Frr across 0.1–0.95); EER not computed because the calibration set is synthetic.
- **Real-speaker EER requires consenting speakers** (see README ethics note) → NOT MEASURED.
- Active model reported: `ecapa-tdnn` (when installed).

## 5. Alert engine (severity classifier)

- **Method**: deterministic unit check of `evaluateEventSeverity` across all 4 modes × 12 event classes = 48 mappings.
- **Result**: **precision 1.0** (48/48 correct, 0 mismatches).
- **Note**: this measures policy-mapping logic, NOT cheating-detection accuracy.

## 6. Performance / latency (AI service)

- Liveness PAD: mean 39.9 ms/frame, p95 48.1 ms (synthetic).
- Face recognition: mean 106.0 ms, p95 174.6 ms.
- Voice engine: loaded model `ecapa-tdnn` (latency NOT MEASURED in the results file).

## 7. Load test (Socket.IO concurrency) — `evaluation/load_test.js`

| Concurrent sessions | Connected | Join (mean/p95) | AI event RTT (mean/p95) | Events fired | Failures |
| --- | --- | --- | --- | --- | --- |
| 1 | 1/1 | 2 / 2 ms | 2 / 4 ms | 3 | 0 |
| 5 | 5/5 | 1 / 1 ms | 3 / 9 ms | 15 | 0 |
| 10 | 10/10 | 1 / 1 ms | 1 / 2 ms | 30 | 0 |
| 25 | 25/25 | 1 / 1 ms | 2 / 4 ms | 75 | 0 |
| 50 | 50/50 | 1 / 1 ms | 3 / 9 ms | 150 | 0 |

Cleanup after run: 109 sessions, 654 alerts removed from Mongo.

## 8. Resource usage — `evaluation/monitor_resources.py`

| Process | Samples | CPU mean (max) | RSS mean (max) |
| --- | --- | --- | --- |
| Node server | 99 | 4.0 % (93.2 %) | 82.2 MB (97.6 MB) |
| AI service | 99 | 0.0 % (0.0 %) | 8.1 MB (8.1 MB) |

**Important caveat**: the AI service process was idle (not performing inference)
during the resource run, so CPU/RSS for AI inference is NOT MEASURED. The load
test above exercised only the socket layer.

## 9. Results table

| Component | Metric | Result | Dataset/Test Size |
| --- | --- | --- | --- |
| Face recognition | FAR | 0.6 | 2 subjects, 5 impostor probes |
| Face recognition | TAR / FRR / accuracy | NOT MEASURED | 0 genuine probes |
| PAD (MiniFASNet) | Attack detection rate | 1.0 | 3 printed-photo samples |
| PAD (MiniFASNet) | Live FRR | 0.0 | 2 live samples |
| Blink | TPR / FPR | 1.0 / 0.0 | 10 synthetic sequences |
| Alert engine | Severity mapping precision | 1.0 | 48 mappings |
| Speaker verification | FAR / FRR / EER | NOT MEASURED (synthetic calibration only) | 3 synthetic speakers |
| AI latency | PAD inference | 39.9 ms mean / 48.1 p95 | synthetic frames |
| AI latency | Face recognition | 106.0 ms mean / 174.6 p95 | sample frames |
| WebRTC | — | NOT MEASURED (no multi-peer latency capture) | — |
| Socket.IO | Concurrent sessions | 50/50 connected, 0 failures | load test |
| Socket.IO | AI event RTT | 1–3 ms mean / ≤ 9 ms p95 | 273 events |
| CPU | Node server | 4.0 % mean | 99 samples |
| RAM | Node server | 82.2 MB mean | 99 samples |
| CPU/RAM | AI inference | NOT MEASURED (idle process only) | — |

## 10. How to re-run

```bash
# Model metrics (requires the dataset under evaluation/dataset/)
cd evaluation && python run_evaluation.py --all

# Socket load test (requires server on :5000 + MongoDB)
node load_test.js

# Security test suite (requires server + MongoDB)
node security_test.js

# End-to-end + failure-injection socket scenarios
node e2e_scenario.js
node failure_injection.js
```
