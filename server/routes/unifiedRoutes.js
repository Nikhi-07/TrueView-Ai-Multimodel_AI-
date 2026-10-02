const express = require('express');
const router = express.Router();
const { 
  logUnifiedEvent, 
  getDashboardStats, 
  getAlerts,
  getSessions,
  getSessionById,
  uploadSessionRecording,
  startSession,
  endSession,
  recordTabSwitch,
  resetTabSwitches
} = require('../controllers/unifiedController');
const { protect, optionalProtect } = require('../middleware/authMiddleware');

router.post('/log', optionalProtect, logUnifiedEvent);
router.post('/events', optionalProtect, logUnifiedEvent);
router.get('/dashboard-stats', protect, getDashboardStats);
router.get('/alerts', protect, getAlerts);
router.get('/sessions', protect, getSessions);
router.get('/sessions/:sessionId', optionalProtect, getSessionById);
router.post('/sessions/:sessionId/recording', uploadSessionRecording);
router.post('/sessions/:sessionId/start', optionalProtect, startSession);
router.post('/sessions/:sessionId/end', optionalProtect, endSession);
router.post('/sessions/:sessionId/tab-switch', optionalProtect, recordTabSwitch);
router.post('/sessions/:sessionId/reset-tab-switches', optionalProtect, resetTabSwitches);

module.exports = router;
