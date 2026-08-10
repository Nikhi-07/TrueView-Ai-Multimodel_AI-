"""Phase 2 endpoint smoke test – generates a synthetic audio sample and exercises
the new /analyze-audio and /transcribe endpoints against a running AI service."""

import base64
import json
import math
import random
import struct
import sys
import urllib.request
import wave

AI_URL = "http://127.0.0.1:8000"
WAV_PATH = "phase2_test_audio.wav"


def generate_test_wav(path, seconds=3.0, sr=16000):
    random.seed(42)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        frames = []
        for i in range(int(sr * seconds)):
            t = i / sr
            env = 0.5 + 0.5 * math.sin(2 * math.pi * 2.5 * t)
            sig = 0.28 * math.sin(2 * math.pi * 170 * t) * env + 0.07 * random.uniform(-1, 1)
            sample = int(max(-1.0, min(1.0, sig)) * 32767)
            frames.append(struct.pack("<h", sample))
        w.writeframes(b"".join(frames))


def b64(path):
    with open(path, "rb") as f:
        return "data:audio/wav;base64," + base64.b64encode(f.read()).decode()


def post(path, payload):
    req = urllib.request.Request(
        AI_URL + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        resp = urllib.request.urlopen(req, timeout=120)
        return json.loads(resp.read())
    except Exception as e:
        return {"_error": str(e)}


def main():
    generate_test_wav(WAV_PATH)
    audio = b64(WAV_PATH)

    print("== analyze-audio ==")
    r1 = post("/api/voice-detection/analyze-audio", {"audio": audio})
    print(json.dumps({k: r1.get(k) for k in ("speech_detected", "multiple_speakers", "speaker_count", "segments", "model", "_error")}, indent=2))

    print("== transcribe ==")
    r2 = post("/api/speech-analysis/transcribe", {"audio": audio})
    print(json.dumps({k: r2.get(k) for k in ("available", "transcript", "language", "keywords_found", "model", "message", "_error")}, indent=2))

    print("== health ==")
    req = urllib.request.Request(AI_URL + "/health")
    print(json.loads(urllib.request.urlopen(req, timeout=10).read()))

    print("ENDPOINT TEST DONE")


if __name__ == "__main__":
    main()
