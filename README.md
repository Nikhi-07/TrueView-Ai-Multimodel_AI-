# TrueView AI – Smart Proctoring System

> Modern, scalable, and production-ready project scaffold for an AI-powered web application.

## 🚀 Features

- **Frontend:** React 18, Vite, Tailwind CSS v3, React Router v6
- **UI Design:** Modern AI-inspired dark theme, glassmorphism, responsive layout, smooth transitions
- **Pages:** Dashboard, Live Monitoring, Sessions, Reports, Alerts, Analytics, Users, Settings, Profile, Help, Login, Register, Forgot Password
- **Components:** Reusable UI components (Navbar, Sidebar, Charts, Tables, Alerts, Modals, Camera, Audio Visualizer, etc.)
- **Backend (Placeholder):** Node.js + Express + MongoDB structured folders
- **AI Service (Placeholder):** Python + FastAPI structured folders ready for Ollama integration

## 📁 Project Structure

```
TrueView/
├── client/                 # Frontend React Application
│   ├── src/
│   │   ├── assets/
│   │   ├── components/     # Reusable UI components
│   │   ├── context/        # React context providers
│   │   ├── hooks/          # Custom React hooks
│   │   ├── layouts/        # Page layouts (Dashboard, Auth)
│   │   ├── pages/          # Application views
│   │   ├── routes/         # React Router configuration
│   │   ├── services/       # API and frontend services
│   │   └── utils/          # Helper functions and constants
│   └── package.json
├── server/                 # Backend Node.js Application (Placeholder)
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── sockets/
│   ├── utils/
│   └── server.js
└── ai-service/             # AI Processing Service (Placeholder)
    ├── behavior_analysis/
    ├── decision_engine/
    ├── face_detection/
    ├── face_recognition/
    ├── gaze_tracking/
    ├── head_pose/
    ├── liveness_detection/
    ├── object_detection/
    ├── speech_analysis/
    ├── utils/
    ├── main.py
    └── requirements.txt
```

## 🛠️ Getting Started

### Prerequisites
- Node.js (v18+)
- Python (3.9+)

### Running the Frontend
1. Navigate to the client directory:
   ```bash
   cd client
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open http://localhost:5173 in your browser.

## 🔮 Future Integration
This scaffold provides the complete UI, routing, and folder architecture. You can now begin integrating:
- The backend Node.js APIs in the `server/` directory.
- The AI models and Ollama workflows in the `ai-service/` directory.
- Real WebSocket connections in `client/src/hooks/useWebSocket.js`.
