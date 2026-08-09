const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Please add a full name'],
    },
    email: {
      type: String,
      required: [true, 'Please add an email'],
      unique: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email',
      ],
    },
    password: {
      type: String,
      required: [true, 'Please add a password'],
      minlength: 6,
      select: false, // Don't return password by default
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    profilePicture: {
      type: String,
      default: '',
    },
    phone: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive', 'Suspended'],
      default: 'Inactive',
    },
    registrationStatus: {
      type: String,
      enum: ['PENDING_FACE_REGISTRATION', 'PENDING_VOICE_REGISTRATION', 'ACTIVE'],
      default: 'PENDING_FACE_REGISTRATION',
    },
    faceRegistered: {
      type: Boolean,
      default: false,
    },
    faceVerified: {
      type: Boolean,
      default: false,
    },
    faceRegisteredAt: {
      type: Date,
      default: null,
    },
    lastFaceVerifiedAt: {
      type: Date,
      default: null,
    },
    faceVerificationAttempts: {
      type: Number,
      default: 0,
    },
    lastFailedFaceVerification: {
      type: Date,
      default: null,
    },
    voiceRegistered: {
      type: Boolean,
      default: false,
    },
    voiceVerified: {
      type: Boolean,
      default: false,
    },
    voiceRegisteredAt: {
      type: Date,
      default: null,
    },
    lastVoiceVerifiedAt: {
      type: Date,
      default: null,
    },
    voiceVerificationAttempts: {
      type: Number,
      default: 0,
    },
    lastFailedVoiceVerification: {
      type: Date,
      default: null,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    faceEmbeddings: {
      type: [[Number]],
      default: [],
      select: false, // Do not expose face embeddings in normal queries
    },
    voiceEmbeddings: {
      type: [[Number]],
      default: [],
      select: false, // Do not expose voice embeddings in normal queries
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

// Encrypt password using bcrypt before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method to match user entered password to hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
