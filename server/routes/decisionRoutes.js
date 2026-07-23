const express = require('express');
const router = express.Router();
const { logDecisionEvent } = require('../controllers/decisionController');
const { protect } = require('../middleware/authMiddleware');

router.post('/log', protect, logDecisionEvent);

module.exports = router;
