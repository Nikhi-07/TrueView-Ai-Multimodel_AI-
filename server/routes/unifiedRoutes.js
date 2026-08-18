const express = require('express');
const router = express.Router();
const { 
  logUnifiedEvent, 
  getDashboardStats, 
  getAlerts,
  getSessions,
  getSessionById,
  uploadSessionRecording,
  endSession
} = require('../controllers/unifiedController');
const { protect } = require('../middleware/authMiddleware');

router.post('/log', protect, logUnifiedEvent);
router.get('/dashboard-stats', protect, getDashboardStats);
router.get('/alerts', protect, getAlerts);
router.get('/sessions', protect, getSessions);
router.get('/sessions/:sessionId', protect, getSessionById);
router.post('/sessions/:sessionId/recording', uploadSessionRecording);
router.post('/sessions/:sessionId/end', protect, endSession);

module.exports = router;
