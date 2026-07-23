const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
    },
    userEmail: {
      type: String,
      default: 'student@trueview.ai',
    },
    userName: {
      type: String,
      default: 'Student Candidate',
    },
    type: {
      type: String,
      required: true,
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'danger', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
      default: 'warning',
    },
    evidence: {
      type: String,
      default: '',
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Alert', alertSchema);
