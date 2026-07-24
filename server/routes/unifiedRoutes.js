const express = require('express');
const router = express.Router();
const { logUnifiedEvent, getDashboardStats, getAlerts } = require('../controllers/unifiedController');
const { protect } = require('../middleware/authMiddleware');

router.post('/log', protect, logUnifiedEvent);
router.get('/dashboard-stats', protect, getDashboardStats);
router.get('/alerts', protect, getAlerts);

module.exports = router;
