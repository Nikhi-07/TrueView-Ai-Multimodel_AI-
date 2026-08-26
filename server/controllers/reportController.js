const Report = require('../models/Report');
const Session = require('../models/Session');
const Alert = require('../models/Alert');

// @desc    Get all proctoring reports from MongoDB
// @route   GET /api/reports
// @access  Public / Private
const getReports = async (req, res, next) => {
  try {
    // Authorization: admins see all reports; other users see only their own.
    let query = {};
    if (req.user && req.user.role !== 'admin') {
      query.$or = [
        { userEmail: req.user.email },
        { userEmail: req.user.email.toLowerCase() },
      ];
    }
    const reports = await Report.find(query).sort({ createdAt: -1 });
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
    // Authorization: non-admins may only read their own reports.
    if (req.user && req.user.role !== 'admin' && report.userEmail !== req.user.email) {
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
    // Authorization: non-admins may only generate reports for their own sessions.
    if (req.user && req.user.role !== 'admin' && session && session.userEmail !== req.user.email) {
      return res.status(403).json({ success: false, message: 'Not authorized for this session' });
    }
    const alerts = await Alert.find({ sessionId });

    // Auto-complete the session record so the report's duration is accurate even
    // when the Live Monitoring page (no socket session) ends without marking it.
    if (session && !session.endTime) {
      session.endTime = new Date();
      session.status = 'COMPLETED';
      try { await session.save(); } catch (_) {}
    }

    const phoneDetections = session?.phoneDetections || alerts.filter(a => a.type === 'PHONE_DETECTED').length;
    // Only real violations count toward the score (CLEARED/informational events don't).
    const violationAlerts = alerts.filter(a => ['CRITICAL', 'HIGH', 'MEDIUM'].includes(String(a.severity).toUpperCase()));
    const totalViolations = violationAlerts.length;
    
    // Calculate Integrity Score (100 - penalties)
    let score = 100 - (phoneDetections * 25) - (totalViolations * 5);
    score = Math.max(0, Math.min(100, score));

    const status = score < 60 ? 'FLAGGED' : score < 85 ? 'REVIEW_REQUIRED' : 'PASSED';
    const riskLevel = score < 60 ? 'HIGH_RISK' : score < 85 ? 'MEDIUM_RISK' : 'NORMAL';

    const reportId = `RPT-${Date.now().toString().slice(-6)}`;

    // Full ordered event timeline for the host's report — every recorded record.
    const timeline = alerts
      .slice()
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map(a => ({
        timestamp: a.timestamp,
        eventType: a.eventType || a.type,
        severity: a.severity,
        description: a.evidence || a.description || '',
        confidence: a.confidence,
      }));

    const identityMismatchCount = session?.identityMismatchCount || alerts.filter(a => a.type === 'IDENTITY_MISMATCH').length;
    const identityStatus = session?.identityStatus || (identityMismatchCount > 0 ? 'MISMATCH' : 'VERIFIED');

    let report = await Report.findOne({ sessionId });
    if (!report) {
      report = await Report.create({
        reportId,
        sessionId,
        userName: session?.userName || 'Student Candidate',
        userEmail: session?.userEmail || 'student@trueview.ai',
        sessionType: session?.mode || 'EXAM',
        startTime: session?.startTime || null,
        endTime: session?.endTime || null,
        durationSeconds: session?.endTime ? Math.max(0, Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000)) : 0,
        overallIntegrityScore: score,
        riskLevel,
        totalViolations,
        phoneDetections,
        identityMismatchCount,
        identityStatus,
        faceVerified: identityStatus === 'VERIFIED',
        livenessPassed: true,
        alerts: alerts.map(a => ({
          type: a.type,
          eventType: a.eventType || a.type,
          severity: a.severity,
          evidence: a.evidence,
          timestamp: a.timestamp,
        })),
        timeline,
        status,
      });
    } else {
      report.endTime = session?.endTime || new Date();
      report.durationSeconds = session?.endTime ? Math.max(0, Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000)) : report.durationSeconds;
      report.overallIntegrityScore = score;
      report.riskLevel = riskLevel;
      report.totalViolations = totalViolations;
      report.phoneDetections = phoneDetections;
      report.identityMismatchCount = identityMismatchCount;
      report.identityStatus = identityStatus;
      report.faceVerified = identityStatus === 'VERIFIED';
      report.alerts = alerts.map(a => ({
        type: a.type,
        eventType: a.eventType || a.type,
        severity: a.severity,
        evidence: a.evidence,
        timestamp: a.timestamp,
      }));
      report.timeline = timeline;
      report.status = status;
      await report.save();
    }

    res.json({ success: true, report });
  } catch (error) {
    next(error);
  }
};

// @desc    Export proctoring reports as CSV
// @route   GET /api/reports/export/csv
// @access  Private / Public
const exportReportsCsv = async (req, res, next) => {
  try {
    const query = req.user && req.user.role !== 'admin' ? { userEmail: req.user.email } : {};
    const reports = await Report.find(query).sort({ createdAt: -1 });

    const headers = [
      'Report ID',
      'Session ID',
      'Candidate Name',
      'Candidate Email',
      'Session Mode',
      'Integrity Score (%)',
      'Risk Level',
      'Status',
      'Total Violations',
      'Phone Detections',
      'Duration (sec)',
      'Start Time',
      'End Time',
    ];

    const rows = reports.map(r => [
      `"${r.reportId}"`,
      `"${r.sessionId}"`,
      `"${(r.userName || '').replace(/"/g, '""')}"`,
      `"${(r.userEmail || '').replace(/"/g, '""')}"`,
      `"${r.sessionType || 'EXAM'}"`,
      r.overallIntegrityScore ?? 100,
      `"${r.riskLevel || 'NORMAL'}"`,
      `"${r.status || 'PASSED'}"`,
      r.totalViolations || 0,
      r.phoneDetections || 0,
      r.durationSeconds || 0,
      `"${r.startTime ? new Date(r.startTime).toISOString() : ''}"`,
      `"${r.endTime ? new Date(r.endTime).toISOString() : ''}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=trueview_proctoring_reports_${Date.now()}.csv`);
    res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getReports,
  getReportById,
  generateReport,
  exportReportsCsv,
};
