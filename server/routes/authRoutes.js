const express = require('express');
const router = express.Router();
const { 
  register, 
  login, 
  verifyCredentials, 
  logout, 
  forgotPassword, 
  resetPassword, 
  registerFace, 
  registerVoice,
  startAISession,
  getFaceEmbeddings, 
  getBiometricStatus,
  faceLogin,
  voiceLogin,
  verifySessionFace,
  extensionLogin,
  getMe
} = require('../controllers/authController');
const { authLimiter, passwordResetLimiter } = require('../middleware/rateLimiter');
const { protect, protectPending } = require('../middleware/authMiddleware');

router.get('/me', protect, getMe);
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/extension-login', authLimiter, extensionLogin);
router.post('/verify-credentials', authLimiter, verifyCredentials);
router.post('/face-login', authLimiter, faceLogin);
router.post('/voice-login', authLimiter, voiceLogin);
router.post('/logout', logout);
router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.post('/reset-password', resetPassword);

// Biometric Recognition & Registration routes
router.post('/register-face', protectPending, registerFace);
router.post('/register-voice', protectPending, registerVoice);
router.get('/face-embeddings', protect, getFaceEmbeddings);
router.get('/biometric-status', protect, getBiometricStatus);
router.post('/verify-session-face', protect, verifySessionFace);
router.post('/ai-session-start', protect, startAISession);

module.exports = router;
