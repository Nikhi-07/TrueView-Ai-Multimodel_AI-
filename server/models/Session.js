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
      enum: ['WAITING', 'DEVICE_CHECK', 'READY', 'LIVE', 'WARNING', 'SUSPENDING', 'SUSPENDED', 'RESUMING', 'COMPLETED', 'EXITED', 'FAILED', 'ACTIVE', 'TERMINATED'],
      default: 'READY',
    },
    tabSwitchCount: {
      type: Number,
      default: 0,
    },
    maxTabSwitches: {
      type: Number,
      default: 3,
    },
    tabSwitchStatus: {
      type: String,
      enum: ['NORMAL', 'WARNING', 'FINAL_WARNING', 'TERMINATED'],
      default: 'NORMAL',
    },
    tabSwitchEvents: [
      {
        timestamp: { type: Date, default: Date.now },
        count: { type: Number, default: 0 },
        maxAllowed: { type: Number, default: 3 },
        severity: { type: String, default: 'MEDIUM' },
        eventType: { type: String, default: 'TAB_SWITCH_DETECTED' },
        message: { type: String, default: '' },
      }
    ],
    terminationReason: {
      type: String,
      default: null,
    },
    terminatedAt: {
      type: Date,
      default: null,
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
    roomId: {
      type: String,
      default: null,
    },
    roomTitle: {
      type: String,
      default: null,
    },
    hostId: {
      type: String,
      default: null,
    },
    hostName: {
      type: String,
      default: null,
    },
    hostEmail: {
      type: String,
      default: null,
    },
    recordingUrl: {
      type: String,
      default: null,
    },
    durationSeconds: {
      type: Number,
      default: 0,
    },
    overallIntegrityScore: {
      type: Number,
      default: 100,
    },
    identityStatus: {
      type: String,
      enum: ['VERIFIED', 'MISMATCH', 'UNKNOWN', 'FACE_NOT_DETECTED', 'UNAVAILABLE'],
      default: 'VERIFIED',
    },
    identityMismatchCount: {
      type: Number,
      default: 0,
    },
    identityMismatchDuration: {
      type: Number,
      default: 0,
    },
    lastIdentityVerifiedAt: {
      type: Date,
      default: null,
    },
    lastIdentityMismatchAt: {
      type: Date,
      default: null,
    },
    timeline: [
      {
        timestamp: { type: Date, default: Date.now },
        eventType: { type: String, default: 'EVENT' },
        severity: { type: String, default: 'INFO' },
        evidence: { type: String, default: '' },
      }
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Session', sessionSchema);
