"""
Generate reproducible synthetic blink blendshape traces for the TrueView evaluation
dataset. The traces are JSON arrays of {"t": seconds, "left": 0..1, "right": 0..1}.

These are SYNTHETIC calibration signals — they exercise the temporal state machine
(OPEN -> CLOSING -> CLOSED -> REOPEN) deterministically and are NOT camera captures.
They are used to validate the detector logic (e.g., laptop tilt must NOT change the
eyeBlink blendshapes, therefore must not count a blink).
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATASET = os.path.join(HERE, "dataset", "blink")

OPEN_VAL = 0.08      # typical open-eye blendshape
CLOSED_VAL = 0.92    # typical closed-eye blendshape


def trace(path, frames):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(frames, f, indent=1)


def blink(open_t=0.4, closed_t=0.35):
    """One blink: OPEN -> CLOSING -> CLOSED -> OPEN. Returns list of frames."""
    frames, t = [], 0.0
    step = 0.05
    # open
    while t < open_t:
        frames.append({"t": round(t, 2), "left": OPEN_VAL, "right": OPEN_VAL})
        t += step
    # closing
    while t < open_t + 0.1:
        frames.append({"t": round(t, 2), "left": 0.55, "right": 0.6})
        t += step
    # closed
    while t < open_t + 0.1 + closed_t:
        frames.append({"t": round(t, 2), "left": CLOSED_VAL, "right": CLOSED_VAL})
        t += step
    # reopen
    while t < open_t + 0.1 + closed_t + 0.1:
        frames.append({"t": round(t, 2), "left": 0.4, "right": 0.45})
        t += step
    while t < open_t + 0.1 + closed_t + 0.3:
        frames.append({"t": round(t, 2), "left": OPEN_VAL, "right": OPEN_VAL})
        t += step
    return frames


def eyes_open(duration=4.0, jitter=0.04, seed=7):
    """No blink: eyes open with small sensor noise (must stay below blink thresholds)."""
    import random
    rnd = random.Random(seed)
    frames, t = [], 0.0
    while t < duration:
        frames.append({
            "t": round(t, 2),
            "left": round(max(0.0, min(0.25, OPEN_VAL + rnd.uniform(-jitter, jitter))), 3),
            "right": round(max(0.0, min(0.25, OPEN_VAL + rnd.uniform(-jitter, jitter))), 3),
        })
        t += 0.05
    return frames


def head_motion_no_blink(duration=5.0, seed=11):
    """
    Tilt/rotation with NO eye closure. Critically, head yaw/pitch do NOT change the
    eyeBlinkLeft/eyeBlinkRight blendshapes — the values stay at open-eye levels.
    """
    import random
    rnd = random.Random(seed)
    frames, t = [], 0.0
    while t < duration:
        frames.append({
            "t": round(t, 2),
            "left": round(max(0.0, OPEN_VAL + rnd.uniform(-0.02, 0.02)), 3),
            "right": round(max(0.0, OPEN_VAL + rnd.uniform(-0.02, 0.02)), 3),
        })
        t += 0.05
    return frames


def main():
    # blink / positive class
    trace(os.path.join(DATASET, "blink", "participant__single_blink.json"), blink())
    trace(os.path.join(DATASET, "blink", "participant__double_blink.json"),
          blink(open_t=0.4) + blink(open_t=1.6))
    trace(os.path.join(DATASET, "blink", "participant__triple_blink.json"),
          blink(open_t=0.4) + blink(open_t=1.6) + blink(open_t=2.8))

    # no_blink / negative
    trace(os.path.join(DATASET, "no_blink", "participant__eyes_open.json"), eyes_open())
    trace(os.path.join(DATASET, "no_blink", "participant__eyes_open_noisy.json"), eyes_open(seed=23, jitter=0.08))

    # head movement / tilt immunity (eyes stay open -> zero blinks)
    trace(os.path.join(DATASET, "head_movement", "participant__tilt_no_blink.json"),
          head_motion_no_blink(seed=11))
    trace(os.path.join(DATASET, "head_movement", "participant__slow_turn_no_blink.json"),
          head_motion_no_blink(seed=29, duration=6.0))

    # laptop tilt / camera movement (same blendshape independence)
    trace(os.path.join(DATASET, "laptop_tilt", "participant__tilt_up_no_blink.json"),
          head_motion_no_blink(seed=31))
    trace(os.path.join(DATASET, "laptop_tilt", "participant__tilt_down_no_blink.json"),
          head_motion_no_blink(seed=37))
    trace(os.path.join(DATASET, "camera_movement", "participant__camera_jitter_no_blink.json"),
          head_motion_no_blink(seed=41))

    print("Blink traces generated in", DATASET)


if __name__ == "__main__":
    main()
