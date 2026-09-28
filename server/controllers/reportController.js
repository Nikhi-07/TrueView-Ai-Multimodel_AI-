const Report = require('../models/Report');
const Session = require('../models/Session');
const Alert = require('../models/Alert');
const Room = require('../models/Room');
const mongoose = require('mongoose');

// @desc    Get all proctoring reports from MongoDB
// @route   GET /api/reports
// @access  Public / Private
const getReports = async (req, res, next) => {
  try {
    // Authorization: admins see all reports; teachers see own + reports from their hosted rooms; students see own reports.
    let query = {};
    if (req.user && req.user.role !== 'admin') {
      const userEmails = [req.user.email, req.user.email?.toLowerCase()].filter(Boolean);
      const userConditions = [
        { userEmail: { $in: userEmails } },
      ];
      if (req.user._id) userConditions.push({ candidateId: String(req.user._id) });
      if (req.user.id) userConditions.push({ candidateId: String(req.user.id) });

      // Match sessions owned by this user
      const userSessions = await Session.find({
        $or: [
          { userEmail: { $in: userEmails } },
          { userId: String(req.user._id || req.user.id) }
        ]
      }).select('sessionId').lean();
      const userSessionIds = userSessions.map(s => s.sessionId);
      if (userSessionIds.length > 0) {
        userConditions.push({ sessionId: { $in: userSessionIds } });
      }

      // If user hosts rooms, also include reports for sessions from their hosted rooms
      const uId = String(req.user._id || req.user.id);
      const hostedRooms = await Room.find({
        $or: [
          { ownerId: uId },
          { createdBy: uId },
          { hostUserId: uId },
          { 'host.id': uId },
          { 'host.email': { $in: userEmails } },
        ]
      }).select('roomId').lean();
      const hostedRoomIds = hostedRooms.map(r => r.roomId);
      if (hostedRoomIds.length > 0) {
        userConditions.push({ roomId: { $in: hostedRoomIds } });
        const hostedSessions = await Session.find({ roomId: { $in: hostedRoomIds } }).select('sessionId').lean();
        const hostedSessionIds = hostedSessions.map(s => s.sessionId);
        if (hostedSessionIds.length > 0) {
          userConditions.push({ sessionId: { $in: hostedSessionIds } });
        }
      }

      query.$or = userConditions;
    }

    const { status, mode, search } = req.query;
    if (status && status !== 'ALL') {
      query.status = status;
    }
    if (mode && mode !== 'ALL') {
      const modeCond = [
        { sessionType: { $regex: `^${mode}$`, $options: 'i' } },
        { mode: { $regex: `^${mode}$`, $options: 'i' } }
      ];
      if (query.$or) {
        query = { $and: [{ $or: query.$or }, { $or: modeCond }] };
      } else {
        query.$or = modeCond;
      }
    }

    if (search) {
      const searchCond = [
        { reportId: { $regex: search, $options: 'i' } },
        { sessionId: { $regex: search, $options: 'i' } },
        { roomId: { $regex: search, $options: 'i' } },
        { userName: { $regex: search, $options: 'i' } },
        { userEmail: { $regex: search, $options: 'i' } },
        { roomTitle: { $regex: search, $options: 'i' } },
      ];
      if (query.$and) {
        query.$and.push({ $or: searchCond });
      } else if (query.$or) {
        const existingOr = query.$or;
        query = { $and: [{ $or: existingOr }, { $or: searchCond }] };
      } else {
        query.$or = searchCond;
      }
    }

    const reports = await Report.find(query).sort({ createdAt: -1 }).lean();
    const sessionIds = reports.map(r => r.sessionId);
    const relatedSessions = await Session.find({ sessionId: { $in: sessionIds } }).select('sessionId roomId roomTitle mode sessionType userName userEmail').lean();
    const sessionMap = new Map(relatedSessions.map(s => [s.sessionId, s]));

    const enrichedReports = reports.map(r => {
      const s = sessionMap.get(r.sessionId);
      const effectiveRoomId = r.roomId || s?.roomId || (r.sessionId?.startsWith('TRV-') ? (r.sessionId.startsWith('TRV-TRV-') ? r.sessionId.split('-').slice(1, 3).join('-') : r.sessionId.split('-').slice(0, 2).join('-')) : null);
      return {
        ...r,
        roomId: effectiveRoomId,
        roomTitle: r.roomTitle || s?.roomTitle || (effectiveRoomId ? `Room ${effectiveRoomId}` : 'Proctor Examination'),
        mode: r.mode || r.sessionType || s?.mode || s?.sessionType || 'EXAM',
        sessionType: r.sessionType || r.mode || s?.sessionType || 'EXAM',
        userName: r.userName || s?.userName || 'Candidate',
        userEmail: r.userEmail || s?.userEmail || '',
        verdict: r.verdict || r.status || 'PASSED',
      };
    });

    res.json({ success: true, count: enrichedReports.length, reports: enrichedReports });
  } catch (error) {
    next(error);
  }
};

// @desc    Get a single report by ID
// @route   GET /api/reports/:id
// @access  Public / Private
const getReportById = async (req, res, next) => {
  try {
    const idParam = req.params.id;
    let reportDoc = await Report.findOne({
      $or: [
        { reportId: idParam },
        { sessionId: idParam }
      ]
    });

    if (!reportDoc && mongoose.Types.ObjectId.isValid(idParam)) {
      reportDoc = await Report.findById(idParam);
    }

    if (!reportDoc) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const session = await Session.findOne({ sessionId: reportDoc.sessionId }).lean();
    let room = null;
    const effectiveRoomId = reportDoc.roomId || session?.roomId || (reportDoc.sessionId?.startsWith('TRV-') ? (reportDoc.sessionId.startsWith('TRV-TRV-') ? reportDoc.sessionId.split('-').slice(1, 3).join('-') : reportDoc.sessionId.split('-').slice(0, 2).join('-')) : null);
    if (effectiveRoomId) {
      room = await Room.findOne({ roomId: effectiveRoomId }).lean();
    }

    // Authorization: admins, report owners, or teachers hosting the room
    if (req.user && req.user.role !== 'admin' && reportDoc.userEmail !== req.user.email) {
      const uId = String(req.user._id || req.user.id);
      let isRoomHost = false;
      if (room && (
        String(room.ownerId || '') === uId ||
        String(room.createdBy || '') === uId ||
        String(room.hostUserId || '') === uId ||
        String(room.host?.id || '') === uId ||
        room.host?.email === req.user.email
      )) {
        isRoomHost = true;
      }
      if (!isRoomHost) {
        return res.status(403).json({ success: false, message: 'Not authorized for this report' });
      }
    }

    const reportObj = reportDoc.toObject ? reportDoc.toObject() : reportDoc;
    const enriched = {
      ...reportObj,
      roomId: effectiveRoomId,
      roomTitle: reportObj.roomTitle || session?.roomTitle || (room ? room.title : (effectiveRoomId ? `Room ${effectiveRoomId}` : 'Proctor Examination')),
      mode: reportObj.mode || reportObj.sessionType || session?.mode || session?.sessionType || (room ? room.mode : 'EXAM'),
      sessionType: reportObj.sessionType || reportObj.mode || session?.sessionType || 'EXAM',
      userName: reportObj.userName || session?.userName || 'Candidate',
      userEmail: reportObj.userEmail || session?.userEmail || '',
      verdict: reportObj.verdict || reportObj.status || 'PASSED',
    };

    res.json({ success: true, report: enriched });
  } catch (error) {
    next(error);
  }
};

// @desc    Generate a real report for a session
// @route   POST /api/reports/generate
// @access  Public / Private
const generateReport = async (req, res, next) => {
  try {
    const { sessionId, roomId: reqRoomId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required' });
    }

    let session = await Session.findOne({ sessionId });
    const effectiveRoomId = reqRoomId || session?.roomId || (sessionId.startsWith('TRV-') ? (sessionId.startsWith('TRV-TRV-') ? sessionId.split('-').slice(1, 3).join('-') : sessionId.split('-').slice(0, 2).join('-')) : null);
    let room = null;
    if (effectiveRoomId) {
      room = await Room.findOne({ roomId: effectiveRoomId });
    }

    // Authorization: admins, candidate who owns session, or room host
    if (req.user && req.user.role !== 'admin' && session && session.userEmail !== req.user.email) {
      const uId = String(req.user._id || req.user.id);
      let isRoomHost = false;
      if (room && (
        String(room.ownerId || '') === uId ||
        String(room.createdBy || '') === uId ||
        String(room.hostUserId || '') === uId ||
        String(room.host?.id || '') === uId ||
        room.host?.email === req.user.email
      )) {
        isRoomHost = true;
      }
      if (!isRoomHost) {
        return res.status(403).json({ success: false, message: 'Not authorized for this session' });
      }
    }
    const alerts = await Alert.find({ sessionId });

    // Auto-complete the session record so the report's duration is accurate even
    // when the Live Monitoring page ends without marking it.
    if (session && !session.endTime) {
      session.endTime = new Date();
      session.status = 'COMPLETED';
      if (effectiveRoomId && !session.roomId) session.roomId = effectiveRoomId;
      if (room && !session.roomTitle) session.roomTitle = room.title;
      try { await session.save(); } catch (_) {}
    }

    const phoneDetections = session?.phoneDetections || alerts.filter(a => ['PHONE_DETECTED', 'MOBILE_PHONE_DETECTED'].includes(a.eventType || a.type)).length;
    // Only real violations count toward the score
    const violationAlerts = alerts.filter(a => ['CRITICAL', 'HIGH', 'MEDIUM'].includes(String(a.severity).toUpperCase()));
    const totalViolations = violationAlerts.length;
    
    // Calculate Integrity Score (100 - penalties)
    let score = 100 - (phoneDetections * 25) - (totalViolations * 5);
    score = Math.max(0, Math.min(100, score));

    const status = score < 60 ? 'FLAGGED' : score < 85 ? 'REVIEW_REQUIRED' : 'PASSED';
    const riskLevel = score < 60 ? 'HIGH_RISK' : score < 85 ? 'MEDIUM_RISK' : 'NORMAL';

    const reportId = `RPT-${Date.now().toString().slice(-6)}`;

    // Full ordered event timeline
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

    const identityMismatchCount = session?.identityMismatchCount || alerts.filter(a => ['IDENTITY_MISMATCH', 'POSSIBLE_USER_REPLACEMENT'].includes(a.eventType || a.type)).length;
    const identityStatus = session?.identityStatus || (identityMismatchCount > 0 ? 'MISMATCH' : 'VERIFIED');

    const candidateName = session?.userName || req.user?.name || req.body?.userName || 'Student Candidate';
    const candidateEmail = session?.userEmail || req.user?.email || req.body?.userEmail || 'student@trueview.ai';
    const candidateId = session?.candidateId || session?.userId || (req.user ? String(req.user._id) : null);
    const roomTitle = session?.roomTitle || (room ? room.title : (effectiveRoomId ? `Room ${effectiveRoomId}` : 'Proctor Examination'));
    const mode = session?.mode || session?.sessionType || (room ? room.mode : 'EXAM');

    const subsystemResults = {
      liveness: {
        status: !session?.livenessFailures && !alerts.some(a => (a.eventType || a.type || '').includes('SPOOF')) ? 'PASSED' : 'FLAGGED',
        model: 'ConvNeXt-Tiny Run 04',
        verified: !session?.livenessFailures && !alerts.some(a => (a.eventType || a.type || '').includes('SPOOF')),
      },
      identity: {
        status: identityStatus,
        model: 'SFace Continuous Biometrics',
        mismatchCount: identityMismatchCount,
      },
      gazeAttention: {
        status: alerts.some(a => (a.eventType || a.type || '').includes('GAZE') || (a.eventType || a.type || '').includes('OFFSCREEN')) ? 'REVIEW' : 'NORMAL',
        violations: alerts.filter(a => (a.eventType || a.type || '').includes('GAZE') || (a.eventType || a.type || '').includes('OFFSCREEN')).length,
      },
      headPose: {
        status: alerts.some(a => (a.eventType || a.type || '').includes('HEAD')) ? 'REVIEW' : 'NORMAL',
        violations: alerts.filter(a => (a.eventType || a.type || '').includes('HEAD')).length,
      },
      environmentYolo: {
        status: phoneDetections > 0 || alerts.some(a => (a.eventType || a.type || '').includes('MULTIPLE')) ? 'FLAGGED' : 'NORMAL',
        phoneDetections,
        multiplePersons: alerts.filter(a => (a.eventType || a.type || '').includes('MULTIPLE')).length,
      },
      voiceActivity: {
        status: alerts.some(a => (a.eventType || a.type || '').includes('VOICE') || (a.eventType || a.type || '').includes('AUDIO') || (a.eventType || a.type || '').includes('SPEAKER')) ? 'FLAGGED' : 'NORMAL',
        violations: alerts.filter(a => (a.eventType || a.type || '').includes('VOICE') || (a.eventType || a.type || '').includes('AUDIO') || (a.eventType || a.type || '').includes('SPEAKER')).length,
      },
      behaviourAnalysis: {
        status: riskLevel,
        overallIntegrityScore: score,
      },
    };

    const tabSwitches = session?.tabSwitchCount || alerts.filter(a => ['TAB_SWITCH_DETECTED', 'TAB_SWITCH_LIMIT_EXCEEDED'].includes(a.eventType || a.type)).length;
    const maxTabSwitches = session?.maxTabSwitches || 3;
    const isTerminated = Boolean(session?.status === 'TERMINATED' || tabSwitches >= 4 || alerts.some(a => (a.eventType || a.type) === 'TAB_SWITCH_LIMIT_EXCEEDED'));
    const terminationReason = session?.terminationReason || (isTerminated ? 'Maximum tab-switch limit exceeded' : null);
    const tabSwitchTimeline = (session?.tabSwitchEvents && session.tabSwitchEvents.length > 0)
      ? session.tabSwitchEvents
      : alerts.filter(a => ['TAB_SWITCH_DETECTED', 'TAB_SWITCH_LIMIT_EXCEEDED'].includes(a.eventType || a.type)).map(a => ({
          timestamp: a.timestamp,
          count: a.count || 1,
          severity: a.severity,
          message: a.evidence || a.description || 'Tab switch detected',
          isTermination: (a.eventType || a.type) === 'TAB_SWITCH_LIMIT_EXCEEDED',
        }));

    const finalStatus = isTerminated ? 'FLAGGED' : status;
    const finalVerdict = isTerminated ? 'TERMINATED' : status;
    const finalRisk = isTerminated ? 'CRITICAL' : riskLevel;
    const finalScore = isTerminated ? Math.min(score, 40) : score;

    let report = await Report.findOne({ sessionId });
    if (!report) {
      report = await Report.create({
        reportId,
        sessionId,
        userName: candidateName,
        userEmail: candidateEmail,
        candidateId,
        roomId: effectiveRoomId,
        roomTitle,
        mode,
        sessionType: mode,
        startTime: session?.startTime || null,
        endTime: session?.endTime || null,
        durationSeconds: session?.endTime ? Math.max(0, Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000)) : 0,
        overallIntegrityScore: finalScore,
        riskLevel: finalRisk,
        totalViolations,
        phoneDetections,
        tabSwitches,
        maxTabSwitches,
        terminated: isTerminated,
        terminationReason,
        tabSwitchTimeline,
        identityMismatchCount,
        identityStatus,
        faceVerified: identityStatus === 'VERIFIED',
        livenessPassed: true,
        alerts: alerts.map(a => ({
          eventType: a.eventType || a.type,
          severity: a.severity,
          evidence: a.evidence || a.description,
          timestamp: a.timestamp,
        })),
        timeline,
        subsystemResults,
        status: finalStatus,
        verdict: finalVerdict,
      });
    } else {
      report.endTime = session?.endTime || new Date();
      report.durationSeconds = session?.endTime ? Math.max(0, Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000)) : report.durationSeconds;
      report.overallIntegrityScore = finalScore;
      report.riskLevel = finalRisk;
      report.totalViolations = totalViolations;
      report.phoneDetections = phoneDetections;
      report.tabSwitches = tabSwitches;
      report.maxTabSwitches = maxTabSwitches;
      report.terminated = isTerminated;
      report.terminationReason = terminationReason;
      report.tabSwitchTimeline = tabSwitchTimeline;
      report.identityMismatchCount = identityMismatchCount;
      report.identityStatus = identityStatus;
      report.faceVerified = identityStatus === 'VERIFIED';
      report.roomId = report.roomId || effectiveRoomId;
      report.roomTitle = report.roomTitle || roomTitle;
      report.candidateId = report.candidateId || candidateId;
      report.mode = report.mode || mode;
      report.verdict = finalVerdict;
      report.subsystemResults = subsystemResults;
      report.alerts = alerts.map(a => ({
        eventType: a.eventType || a.type,
        severity: a.severity,
        evidence: a.evidence || a.description,
        timestamp: a.timestamp,
      }));
      report.timeline = timeline;
      report.status = finalStatus;
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
