const express = require('express');
const router = express.Router();
const { register, login, verifyCredentials, logout, forgotPassword, resetPassword, registerFace, getFaceEmbeddings, faceLogin } = require('../controllers/authController');
const { authLimiter } = require('../middleware/rateLimiter');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', register);
router.post('/login', authLimiter, login);
router.post('/verify-credentials', authLimiter, verifyCredentials);
router.post('/face-login', authLimiter, faceLogin);
router.post('/logout', logout);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', resetPassword);

// Face Recognition routes
router.post('/register-face', protect, registerFace);
router.get('/face-embeddings', protect, getFaceEmbeddings);

module.exports = router;
