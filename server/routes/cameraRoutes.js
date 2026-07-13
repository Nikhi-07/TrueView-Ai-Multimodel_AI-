const express = require('express');
const router = express.Router();
const { startCameraSession, stopCameraSession, getCameraStatus } = require('../controllers/cameraController');
const { protect } = require('../middleware/authMiddleware');

router.post('/start', protect, startCameraSession);
router.post('/stop', protect, stopCameraSession);
router.get('/status', protect, getCameraStatus);

module.exports = router;
