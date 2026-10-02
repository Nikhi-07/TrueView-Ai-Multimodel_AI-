const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    reportId: {
      type: String,
      required: true,
      unique: true,
    },
    sessionId: {
      type: String,
      required: true,
    },
    userName: {
      type: String,
      default: 'Student Candidate',
    },
    userEmail: {
      type: String,
      default: 'student@trueview.ai',
    },
    candidateId: {
      type: String,
      default: null,
    },
    roomId: {
      type: String,
      default: null,
    },
    roomTitle: {
      type: String,
      default: null,
    },
    mode: {
      type: String,
      default: 'EXAM',
    },
    verdict: {
      type: String,
      default: 'PASSED',
    },
    sessionType: {
      type: String,
      default: 'EXAM',
    },
    durationSeconds: {
      type: Number,
      default: 0,
    },
    startTime: {
      type: Date,
      default: null,
    },
    endTime: {
      type: Date,
      default: null,
    },
    completedByTimer: {
      type: Boolean,
      default: false,
    },
    overallIntegrityScore: {
      type: Number,
      default: 100,
    },
    riskLevel: {
      type: String,
      default: 'NORMAL',
    },
    totalViolations: {
      type: Number,
      default: 0,
    },
    tabSwitches: {
      type: Number,
      default: 0,
    },
    maxTabSwitches: {
      type: Number,
      default: 3,
    },
    terminated: {
      type: Boolean,
      default: false,
    },
    terminationReason: {
      type: String,
      default: null,
    },
    tabSwitchTimeline: [
      {
        timestamp: { type: Date, default: Date.now },
        episodeId: { type: String, default: null },
        hiddenDuration: { type: Number, default: null },
        count: { type: Number, default: 0 },
        severity: { type: String, default: 'MEDIUM' },
        message: { type: String, default: '' },
        isTermination: { type: Boolean, default: false },
      }
    ],
    phoneDetections: {
      type: Number,
      default: 0,
    },
    cameraInterruptions: {
      type: Number,
      default: 0,
    },
    microphoneInterruptions: {
      type: Number,
      default: 0,
    },
    multipleSpeakerEvents: {
      type: Number,
      default: 0,
    },
    speechEvents: {
      type: Number,
      default: 0,
    },
    livenessFailures: {
      type: Number,
      default: 0,
    },
    objectDetections: {
      type: Number,
      default: 0,
    },
    gazeEvents: {
      type: Number,
      default: 0,
    },
    behaviourAlerts: {
      type: Number,
      default: 0,
    },
    suspensionEvents: {
      type: Number,
      default: 0,
    },
    webRtcConnections: {
      type: Number,
      default: 0,
    },
    webRtcDisconnects: {
      type: Number,
      default: 0,
    },
    faceVerified: {
      type: Boolean,
      default: false,
    },
    livenessPassed: {
      type: Boolean,
      default: false,
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
    alerts: [
      {
        // NOTE: field is named `eventType` because a `type` key would be
        // interpreted by Mongoose as the schema-type marker (turning this array
        // into [String] and breaking object subdocuments).
        eventType: String,
        severity: String,
        evidence: String,
        timestamp: Date,
      },
    ],
    timeline: [
      {
        timestamp: Date,
        eventType: String,
        severity: String,
        description: String,
        confidence: Number,
      },
    ],
    subsystemResults: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ['PASSED', 'FLAGGED', 'REVIEW_REQUIRED'],
      default: 'PASSED',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Report', reportSchema);
