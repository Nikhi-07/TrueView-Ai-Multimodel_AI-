const express = require('express');
const router = express.Router();
const { getReports, getReportById, generateReport } = require('../controllers/reportController');
const { protect } = require('../middleware/authMiddleware');

// All report endpoints require a valid application JWT. Reports contain
// participant names, emails and full event timelines – never public.
router.get('/', protect, getReports);
router.get('/:id', protect, getReportById);
router.post('/generate', protect, generateReport);

module.exports = router;
