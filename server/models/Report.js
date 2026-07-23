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
    alerts: [
      {
        type: String,
        severity: String,
        evidence: String,
        timestamp: Date,
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
