const Report = require('../models/Report');
const Session = require('../models/Session');
const Alert = require('../models/Alert');

// @desc    Get all proctoring reports from MongoDB
// @route   GET /api/reports
// @access  Public / Private
const getReports = async (req, res, next) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 });
    res.json({ success: true, count: reports.length, reports });
  } catch (error) {
    next(error);
  }
};

// @desc    Get a single report by ID
// @route   GET /api/reports/:id
// @access  Public / Private
const getReportById = async (req, res, next) => {
  try {
    const report = await Report.findOne({ reportId: req.params.id }) || await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    res.json({ success: true, report });
  } catch (error) {
    next(error);
  }
};

// @desc    Generate a real report for a session
// @route   POST /api/reports/generate
// @access  Public / Private
const generateReport = async (req, res, next) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required' });
    }

    let session = await Session.findOne({ sessionId });
    const alerts = await Alert.find({ sessionId });

    const phoneDetections = session?.phoneDetections || alerts.filter(a => a.type === 'PHONE_DETECTED').length;
    const totalViolations = alerts.length;
    
    // Calculate Integrity Score (100 - penalties)
    let score = 100 - (phoneDetections * 25) - (totalViolations * 5);
    score = Math.max(0, Math.min(100, score));

    const status = score < 60 ? 'FLAGGED' : score < 85 ? 'REVIEW_REQUIRED' : 'PASSED';
    const riskLevel = score < 60 ? 'HIGH_RISK' : score < 85 ? 'MEDIUM_RISK' : 'NORMAL';

    const reportId = `RPT-${Date.now().toString().slice(-6)}`;

    const report = await Report.create({
      reportId,
      sessionId,
      userName: session?.userName || 'Student Candidate',
      userEmail: session?.userEmail || 'student@trueview.ai',
      sessionType: session?.mode || 'EXAM',
      durationSeconds: session?.endTime ? Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000) : 120,
      overallIntegrityScore: score,
      riskLevel,
      totalViolations,
      phoneDetections,
      alerts: alerts.map(a => ({
        type: a.type,
        severity: a.severity,
        evidence: a.evidence,
        timestamp: a.timestamp,
      })),
      status,
    });

    res.json({ success: true, report });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getReports,
  getReportById,
  generateReport,
};
