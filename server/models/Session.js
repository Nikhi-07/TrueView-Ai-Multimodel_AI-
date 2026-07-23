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
      default: 'EXAM',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'COMPLETED', 'SUSPENDED'],
      default: 'ACTIVE',
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
