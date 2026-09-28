const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },
    sessionId: {
      type: String,
      default: null,
    },
    name: {
      type: String,
      default: 'Candidate',
    },
    email: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['WAITING', 'VERIFYING', 'MONITORING', 'SUSPENDED', 'COMPLETED', 'LEFT', 'DISCONNECTED', 'TERMINATED'],
      default: 'WAITING',
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
    terminationReason: {
      type: String,
      default: null,
    },
    riskScore: {
      type: Number,
      default: 0,
    },
    riskLevel: {
      type: String,
      default: 'NORMAL',
    },
    violations: {
      type: Number,
      default: 0,
    },
    liveness: {
      type: String,
      default: 'LIVE',
    },
    faceDetected: {
      type: Boolean,
      default: true,
    },
    gaze: {
      type: String,
      default: 'center',
    },
    pose: {
      type: String,
      default: 'Looking Straight',
    },
    phoneDetected: {
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
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    leftAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const roomSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    joinCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    joinToken: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    ownerId: {
      type: String,
      required: true,
      index: true,
    },
    ownerName: {
      type: String,
      default: 'Session Host',
    },
    ownerEmail: {
      type: String,
      default: '',
    },
    createdBy: {
      type: String,
      index: true,
    },
    hostUserId: {
      type: String,
      index: true,
    },
    host: {
      id: { type: String, default: 'host_01' },
      name: { type: String, default: 'Session Host' },
      email: { type: String, default: 'admin@trueview.ai' },
    },
    mode: {
      type: String,
      enum: ['EXAM', 'INTERVIEW', 'ONLINE_CLASS', 'CLASS', 'MEETING', 'WORKPLACE'],
      default: 'EXAM',
    },
    sessionType: {
      type: String,
      enum: ['EXAM', 'INTERVIEW', 'ONLINE_CLASS', 'CLASS', 'MEETING', 'WORKPLACE'],
      default: 'EXAM',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'ENDED', 'CANCELLED'],
      default: 'ACTIVE',
      index: true,
    },
    maxParticipants: {
      type: Number,
      default: 30,
    },
    participantsCount: {
      type: Number,
      default: 0,
    },
    participants: [participantSchema],
    voiceAlerts: {
      type: Boolean,
      default: true,
    },
    requireIdentity: {
      type: Boolean,
      default: true,
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
    durationMinutes: {
      type: Number,
      default: 60,
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Room', roomSchema);
