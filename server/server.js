require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');

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
const PORT = process.env.PORT || 5000;

// Security Middlewares
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));

// Body parser
app.use(express.json({ limit: '10mb' }));

// Database connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/trueview');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
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

// Custom error handler
app.use(errorHandler);

// Start server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
});
