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
