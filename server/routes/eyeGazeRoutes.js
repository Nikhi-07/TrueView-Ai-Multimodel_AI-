const express = require('express');
const router = express.Router();
const { logEyeGazeEvent } = require('../controllers/eyeGazeController');
const { protect } = require('../middleware/authMiddleware');

router.post('/log', protect, logEyeGazeEvent);

module.exports = router;
