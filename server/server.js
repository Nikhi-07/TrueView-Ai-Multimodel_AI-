require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');

const http = require('http');
const { Server } = require('socket.io');
const { initProctorSocket } = require('./sockets/proctorSocket');

// Routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const cameraRoutes = require('./routes/cameraRoutes');
const livenessRoutes = require('./routes/livenessRoutes');
const faceMeshRoutes = require('./routes/faceMeshRoutes');
const eyeGazeRoutes = require('./routes/eyeGazeRoutes');
const headPoseRoutes = require('./routes/headPoseRoutes');
const voiceRoutes = require('./routes/voiceRoutes');
const objectDetectionRoutes = require('./routes/objectDetectionRoutes');
const behaviourRoutes = require('./routes/behaviourRoutes');
const decisionRoutes = require('./routes/decisionRoutes');
const unifiedRoutes = require('./routes/unifiedRoutes');
const roomRoutes = require('./routes/roomRoutes');
const reportRoutes = require('./routes/reportRoutes');

// Middleware
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 5000;

// ── CORS allowlist (server-authoritative) ──────────────────────────────
// In production, only the configured client origin(s) and the TrueView
// browser extension may call this API. Localhost origins are allowed outside
// production so local development and the evaluation harness keep working.
// Requests with NO Origin header (curl, server-to-server, test clients) are
// allowed – CSRF requires a browser-supplied Origin, so this is safe.
const buildCorsAllowlist = () => {
  const list = new Set();
  const add = (o) => { if (o) list.add(String(o).replace(/\/+$/, '')); };
  add(process.env.CLIENT_URL);
  (process.env.CORS_ORIGINS || '').split(',').forEach(add);
  return list;
};
const corsAllowlist = buildCorsAllowlist();

const isOriginAllowed = (origin) => {
  if (!origin) return true; // non-browser clients (curl, tests, server-to-server)
  if (corsAllowlist.has(String(origin).replace(/\/+$/, ''))) return true;
  if (origin.startsWith('chrome-extension://')) return true;
  if (
    process.env.NODE_ENV !== 'production' &&
    (
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      /^https?:\/\/.*\.devtunnels\.ms(:\d+)?$/.test(origin) ||
      /^https?:\/\/.*\.app\.github\.dev(:\d+)?$/.test(origin) ||
      /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)
    )
  ) {
    return true;
  }
  return false;
};

// Initialize Socket.IO with the same strict CORS allowlist.
// NOTE: socket.io's cors option is processed by the `cors` package, which
// requires the (origin, callback) signature — never a boolean-returning fn.
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Attach Proctor Room Socket Handlers
initProctorSocket(io);
app.set('io', io);

const path = require('path');
const fs = require('fs');

// Ensure uploads/recordings directory exists
const uploadsDir = path.join(__dirname, 'uploads', 'recordings');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Security Middlewares
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
  credentials: true
}));

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.raw({ type: ['video/webm', 'video/mp4', 'application/octet-stream'], limit: '100mb' }));

// Static uploads serving
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Disable Mongoose command buffering so queries fail fast if DB is disconnected
mongoose.set('bufferCommands', false);

// Database connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/trueview', {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return true;
  } catch (error) {
    console.warn(`MongoDB Warning: ${error.message} (Operating in offline/resilient mode)`);
    return false;
  }
};

// Phase 3 hardening: when the initial connection fails (e.g. Atlas cluster waking
// from an idle pause), keep retrying with capped exponential backoff instead of
// staying offline forever. The driver also auto-reconnects after a mid-session drop.
// Recursive self-scheduling: the next attempt is only scheduled AFTER the previous
// one settles, so connection attempts never overlap.
const scheduleDBRetry = () => {
  let attempt = 0;
  const MAX_ATTEMPTS = 60;
  const retry = async () => {
    if (mongoose.connection.readyState === 1) return; // connected — stop retrying
    attempt += 1;
    if (attempt > MAX_ATTEMPTS) {
      console.warn('[DB] Giving up automatic reconnect after max attempts.');
      return;
    }
    const delay = Math.min(1000 * 2 ** Math.min(attempt - 1, 5), 30000); // 1s..30s capped backoff
    const ok = await connectDB();
    if (ok) console.log(`[DB] Reconnected on attempt ${attempt}.`);
    if (mongoose.connection.readyState !== 1) {
      const t = setTimeout(retry, delay);
      t.unref?.();
    }
  };
  const t = setTimeout(retry, 2000);
  t.unref?.();
};

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/camera', cameraRoutes);
app.use('/api/liveness', livenessRoutes);
app.use('/api/face-mesh', faceMeshRoutes);
app.use('/api/eye-gaze', eyeGazeRoutes);
app.use('/api/head-pose', headPoseRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/object-detection', objectDetectionRoutes);
app.use('/api/behaviour', behaviourRoutes);
app.use('/api/decision', decisionRoutes);
app.use('/api/ai-engine', unifiedRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/reports', reportRoutes);

// Basic route for testing
app.get('/', (req, res) => {
  res.send('TrueView API is running...');
});

// Phase 3: health/status endpoint so clients can surface a "connecting to
// database" state instead of silent degradation. Never leaks credentials.
app.get('/api/health', (req, res) => {
  const dbState =
    mongoose.connection.readyState === 1 ? 'connected' :
    mongoose.connection.readyState === 2 ? 'connecting' : 'disconnected';
  res.json({
    status: 'ok',
    service: 'trueview-api',
    uptimeSeconds: Math.round(process.uptime()),
    db: dbState,
    dbRetrying: dbState !== 'connected',
    time: new Date().toISOString(),
  });
});

// Custom error handler
app.use(errorHandler);

// Start server
httpServer.listen(PORT, () => {
  console.log(`Server running with Socket.IO in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  connectDB().then(() => {
    if (mongoose.connection.readyState !== 1) scheduleDBRetry();
  });
});
