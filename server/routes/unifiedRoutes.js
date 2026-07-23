const express = require('express');
const router = express.Router();
const { logUnifiedEvent, getDashboardStats } = require('../controllers/unifiedController');

router.post('/log', logUnifiedEvent);
router.get('/dashboard-stats', getDashboardStats);

module.exports = router;
