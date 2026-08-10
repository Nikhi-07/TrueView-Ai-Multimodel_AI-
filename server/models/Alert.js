const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      default: () => `evt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    },
    sessionId: {
      type: String,
      required: true,
    },
    participantId: {
      type: String,
      default: 'cand_01',
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
    eventType: {
      type: String,
      default: function() { return this.type; }
    },
    severity: {
      type: String,
      enum: ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'info', 'warning', 'danger'],
      default: 'MEDIUM',
    },
    confidence: {
      type: Number,
      default: 0.85,
    },
    description: {
      type: String,
      default: '',
    },
    evidence: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['OPEN', 'REVIEWED', 'DISMISSED', 'RESOLVED'],
      default: 'OPEN',
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
