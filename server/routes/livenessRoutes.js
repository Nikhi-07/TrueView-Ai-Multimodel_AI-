const express = require('express');
const router = express.Router();
const { logLivenessResult, getLivenessStatus } = require('../controllers/livenessController');
const { protect } = require('../middleware/authMiddleware');

router.post('/log', protect, logLivenessResult);
router.get('/status/:sessionId', protect, getLivenessStatus);

module.exports = router;
