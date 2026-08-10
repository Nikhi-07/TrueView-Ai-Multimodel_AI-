# TrueView AI — Setup & Installation

> Exact commands are taken from the actual manifests: `client/package.json`,
> `server/package.json`, `ai-service/requirements.txt`.

## Prerequisites

| Requirement | Version | Notes |
| --- | --- | --- |
| Node.js | **18+** (Express 5 / Vite 8 / React 19) | Node 20+ recommended |
| npm | 9+ | ships with Node |
| Python | **3.9+** (3.10/3.11 recommended) | needed for torch/faster-whisper wheels |
| MongoDB | 4.4+ (local or Atlas) | `mongodb://localhost:27017/trueview` by default |
| Browser | Chrome/Edge/Firefox | camera + microphone support |
| Camera + Microphone | required | browser/OS permission prompts |

## Environment variables

Copy the template:

```bash
cp .env.example .env   # then fill in real values
```

`.env` lives at the repository root. The server (`dotenv`), the AI service
(`os.environ`), and the Vite client (`VITE_*`) all read from the process
environment. **Never commit `.env`** (it is gitignored).

Minimum working local set:

```
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb://localhost:27017/trueview
JWT_SECRET=<long random string>
AI_SERVICE_URL=http://127.0.0.1:8000
CLIENT_URL=http://localhost:5173
```

See `.env.example` for the full list (thresholds, timer warnings, whisper,
admin seed credentials, CORS, AI host/port).

## 1. AI Service (FastAPI — port 8000)

```bash
cd ai-service
python -m venv .venv                 # optional but recommended
source .venv/Scripts/activate        # Windows (git-bash: source .venv/Scripts/activate)
pip install -r requirements.txt
python main.py                       # or: uvicorn main:app --reload --port 8000
```

Model notes:

- YuNet, SFace, MiniFASNetV2 ONNX are committed (`.gitignore` whitelists them).
- ECAPA-TDNN checkpoint (~90 MB) auto-downloads on first use into
  `ai-service/voice_detection/speaker_recognition/pretrained_models/` (gitignored).
- YOLOv11 (`yolo11n.pt`) and faster-whisper download on first use.
- If SpeechBrain/torchaudio install fails, the AI service still runs and uses
  the custom acoustic vector (labeled honestly).

## 2. Backend (Express + Socket.IO — port 5000)

```bash
cd server
npm install
npm run dev        # nodemon (development) — or `npm start` for plain node
```

Seed the demo admin (optional):

```bash
npm run seed       # uses ADMIN_EMAIL / ADMIN_PASSWORD from .env
```

## 3. Frontend (React/Vite — port 5173)

```bash
cd client
npm install
npm run dev
```

Open http://localhost:5173.

Development proxies (in `client/vite.config.js`):

- `/ai-api` → `http://127.0.0.1:8000` (rewritten to `/api`)
- `/api` → `http://127.0.0.1:5000`
- `/socket.io` → `http://127.0.0.1:5000`

## 4. Build & lint (regression)

```bash
cd client
npm run build      # production bundle
npm run lint       # oxlint
```

## 5. Evaluation harness

```bash
cd evaluation
python run_evaluation.py --all        # face / liveness / voice / blink / perf
node security_test.js                 # requires server (:5000) + MongoDB
node e2e_scenario.js                  # end-to-end socket scenario
node failure_injection.js             # AI-engine failure handling
node load_test.js                     # concurrency (50 sessions)
node test_phase2_socket.js            # timer/complete socket flow
python test_phase2_endpoints.py       # AI endpoint smoke tests (port 8000)
```

## 6. Common errors & troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Vite proxy error: "AI backend service ... not running" | AI service down | start `python main.py` in `ai-service` |
| Vite proxy error: "backend server ... not running" | Node server down | `npm run dev` in `server` |
| Login returns `503 AUTH_SERVICE_UNAVAILABLE` | MongoDB unreachable | start MongoDB / check `MONGO_URI` |
| Login returns `503 LIVENESS_UNAVAILABLE` | AI service down | start AI service |
| "No face profile found" | account not activated | complete face + voice registration |
| PAD says "presentation attack" on a real face | bad lighting/low-res camera | improve lighting, move closer |
| Voice verify fails with a registered speaker | ECAPA unavailable / noisy audio | install speechbrain+torchaudio; quiet room |
| Reset token link missing | production build (dev-only by design) | use `npm run dev`, or wire an email provider |
| Admin can't log in | seed not run or wrong `ADMIN_PASSWORD` | `npm run seed` with the right env |

## 7. Resource requirements

- Node server: ~80–100 MB RSS (measured).
- AI service: torch/onnxruntime/whisper can use 1–3 GB RAM when loaded; the
  measured idle process was ~8 MB RSS (see EVALUATION.md).
