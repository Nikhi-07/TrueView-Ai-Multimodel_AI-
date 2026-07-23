const express = require('express');
const router = express.Router();
const { getReports, getReportById, generateReport } = require('../controllers/reportController');

router.get('/', getReports);
router.get('/:id', getReportById);
router.post('/generate', generateReport);

module.exports = router;
