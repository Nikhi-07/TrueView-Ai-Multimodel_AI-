const express = require('express');
const router = express.Router();
const { logVoiceEvent, verifyLiveSpeaker, analyzeLiveAudio, analyzeSpeech } = require('../controllers/voiceController');
const { protect } = require('../middleware/authMiddleware');

router.post('/log', protect, logVoiceEvent);
router.post('/verify-live-speaker', protect, verifyLiveSpeaker);
router.post('/analyze-audio', protect, analyzeLiveAudio);
router.post('/analyze-speech', protect, analyzeSpeech);

module.exports = router;
