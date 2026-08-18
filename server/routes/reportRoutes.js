const express = require('express');
const router = express.Router();
const { getReports, getReportById, generateReport, exportReportsCsv } = require('../controllers/reportController');
const { protect } = require('../middleware/authMiddleware');

// All report endpoints require a valid application JWT.
router.get('/', protect, getReports);
router.get('/export/csv', protect, exportReportsCsv);
router.get('/:id', protect, getReportById);
router.post('/generate', protect, generateReport);

module.exports = router;
