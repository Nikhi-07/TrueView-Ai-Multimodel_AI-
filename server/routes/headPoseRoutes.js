const express = require('express');
const router = express.Router();
const { logHeadPoseEvent } = require('../controllers/headPoseController');
const { protect } = require('../middleware/authMiddleware');

router.post('/log', protect, logHeadPoseEvent);

module.exports = router;
