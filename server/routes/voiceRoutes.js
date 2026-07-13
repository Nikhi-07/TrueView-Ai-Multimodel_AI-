const express = require('express');
const router = express.Router();
const { logVoiceEvent } = require('../controllers/voiceController');
const { protect } = require('../middleware/authMiddleware');

router.post('/log', protect, logVoiceEvent);

module.exports = router;
