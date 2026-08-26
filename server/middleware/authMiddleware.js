const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - Verify full authenticated application token
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Rejects temporary/pending tokens from access to full API
      if (decoded.pendingFace || decoded.pendingVoice || decoded.faceLoginChallenge || decoded.voiceLoginChallenge) {
        return res.status(403).json({
          message: 'Biometric authentication incomplete',
          registrationStatus: decoded.pendingVoice ? 'PENDING_VOICE_REGISTRATION' : 'PENDING_FACE_REGISTRATION'
        });
      }

      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({ message: 'Not authorized, user not found' });
      }

      if (req.user.registrationStatus === 'PENDING_FACE_REGISTRATION' || req.user.registrationStatus === 'PENDING_VOICE_REGISTRATION') {
        return res.status(403).json({
          message: 'Biometric registration required to access account',
          registrationStatus: req.user.registrationStatus
        });
      }

      if (req.user.status !== 'Active') {
        return res.status(403).json({ message: 'Account is not active' });
      }

      next();
    } catch (error) {
      console.error('Auth Middleware Error:', error);
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

// Middleware for mandatory face registration step (accepts pending or full tokens)
const protectPending = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return res.status(401).json({ message: 'User not found' });
      }

      next();
    } catch (error) {
      res.status(401).json({ message: 'Invalid registration session token' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'No registration session token provided' });
  }
};

// Optional protect - Populates req.user if token is present, but allows unauthenticated candidate requests to proceed
const optionalProtect = async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.id && !decoded.pendingFace && !decoded.pendingVoice) {
        req.user = await User.findById(decoded.id).select('-password');
      }
    } catch (_) {}
  }
  next();
};

// Admin middleware
const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as an admin' });
  }
};

module.exports = { protect, protectPending, optionalProtect, admin };

