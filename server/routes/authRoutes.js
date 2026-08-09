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
  getFaceEmbeddings, 
  getBiometricStatus,
  faceLogin,
  voiceLogin 
} = require('../controllers/authController');
const { authLimiter } = require('../middleware/rateLimiter');
const { protect, protectPending } = require('../middleware/authMiddleware');

router.post('/register', register);
router.post('/login', authLimiter, login);
router.post('/verify-credentials', authLimiter, verifyCredentials);
router.post('/face-login', authLimiter, faceLogin);
router.post('/voice-login', authLimiter, voiceLogin);
router.post('/logout', logout);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', resetPassword);

// Biometric Recognition & Registration routes
router.post('/register-face', protectPending, registerFace);
router.post('/register-voice', protectPending, registerVoice);
router.get('/face-embeddings', protect, getFaceEmbeddings);
router.get('/biometric-status', protect, getBiometricStatus);

module.exports = router;
