const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: String,
      default: 'candidate_01',
    },
    userEmail: {
      type: String,
      default: 'student@trueview.ai',
    },
    userName: {
      type: String,
      default: 'Student Candidate',
    },
    mode: {
      type: String,
      enum: ['EXAM', 'INTERVIEW', 'CLASS', 'MEETING', 'ONLINE_CLASS', 'WORKPLACE'],
      default: 'EXAM',
    },
    sessionType: {
      type: String,
      enum: ['EXAM', 'INTERVIEW', 'CLASS', 'MEETING', 'ONLINE_CLASS', 'WORKPLACE'],
      default: 'EXAM',
    },
    status: {
      type: String,
      enum: ['WAITING', 'DEVICE_CHECK', 'READY', 'LIVE', 'WARNING', 'SUSPENDING', 'SUSPENDED', 'RESUMING', 'COMPLETED', 'EXITED', 'FAILED', 'ACTIVE'],
      default: 'READY',
    },
    cameraStatus: {
      type: String,
      enum: ['ACTIVE', 'INTERRUPTED', 'DISABLED', 'UNKNOWN'],
      default: 'ACTIVE',
    },
    microphoneStatus: {
      type: String,
      enum: ['ACTIVE', 'INTERRUPTED', 'DISABLED', 'UNKNOWN'],
      default: 'ACTIVE',
    },
    trustScore: {
      type: Number,
      default: 100,
    },
    warningLimit: {
      type: Number,
      default: 5,
    },
    criticalLimit: {
      type: Number,
      default: 3,
    },
    suspensionLimit: {
      type: Number,
      default: 1,
    },
    suspensionReason: {
      type: String,
      default: null,
    },
    startTime: {
      type: Date,
      default: Date.now,
    },
    endTime: {
      type: Date,
      default: null,
    },
    peakRiskScore: {
      type: Number,
      default: 0,
    },
    totalAlerts: {
      type: Number,
      default: 0,
    },
    criticalAlertsCount: {
      type: Number,
      default: 0,
    },
    phoneDetections: {
      type: Number,
      default: 0,
    },
    distractionCount: {
      type: Number,
      default: 0,
    },
    gazeDeviations: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Session', sessionSchema);
