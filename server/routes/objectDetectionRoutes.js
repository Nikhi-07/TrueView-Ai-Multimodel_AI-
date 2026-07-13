const express = require('express');
const router = express.Router();
const { logObjectDetectionEvent } = require('../controllers/objectDetectionController');
const { protect } = require('../middleware/authMiddleware');

router.post('/log', protect, logObjectDetectionEvent);

module.exports = router;
