const express = require('express');
const router = express.Router();
const { logBehaviourEvent } = require('../controllers/behaviourController');
const { protect } = require('../middleware/authMiddleware');

router.post('/log', protect, logBehaviourEvent);

module.exports = router;
