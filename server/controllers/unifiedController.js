const Session = require('../models/Session');
const Alert = require('../models/Alert');
const Report = require('../models/Report');
const Room = require('../models/Room');

// @desc    Log unified TrueView AI Engine monitoring events into MongoDB
// @route   POST /api/ai-engine/log
// @access  Public / Private
const logUnifiedEvent = async (req, res, next) => {
  try {
    const {
      session_id,
      user_id = 'candidate_01',
      session_type = 'EXAM',
      roomId,
      roomTitle,
      identity,
      liveness,
      attention,
      audio,
      environment,
      behaviour,
      risk,
      decision,
      performance
    } = req.body;

    if (!session_id) {
      return res.status(400).json({ success: false, message: 'session_id is required' });
    }

    const currentRiskScore = Math.round(risk?.score ?? risk?.current ?? 0);
    const riskLevel = risk?.level ?? 'NORMAL';
    const userId = req.user ? String(req.user._id || req.user.id) : user_id;
    const userName = req.user?.fullName || req.user?.name || 'Student Candidate';
    const userEmail = req.user?.email || 'student@trueview.ai';
    const mode = (session_type || 'EXAM').toUpperCase();

    const identStatusRaw = identity?.status || (identity?.verified ? 'VERIFIED' : (identity?.face_detected === false ? 'FACE_NOT_DETECTED' : 'UNKNOWN'));
    const isIdentityMismatch = identStatusRaw === 'IDENTITY_MISMATCH' || identStatusRaw === 'POSSIBLE_USER_REPLACEMENT' || identStatusRaw === 'MISMATCH';
    const isIdentityVerified = identStatusRaw === 'IDENTITY_VERIFIED' || identStatusRaw === 'IDENTITY_CONSISTENT' || identStatusRaw === 'VERIFIED' || Boolean(identity?.verified);
    const isFaceNotDetected = identStatusRaw === 'FACE_NOT_DETECTED' || identity?.face_detected === false;

    let effectiveIdentityStatus = 'UNKNOWN';
    if (isFaceNotDetected) effectiveIdentityStatus = 'FACE_NOT_DETECTED';
    else if (isIdentityMismatch) effectiveIdentityStatus = 'MISMATCH';
    else if (isIdentityVerified) effectiveIdentityStatus = 'VERIFIED';

    // Find or create session record
    let session = await Session.findOne({ sessionId: session_id });
    if (!session) {
      session = await Session.create({
        sessionId: session_id,
        userId,
        userName,
        userEmail,
        mode,
        sessionType: mode,
        roomId: roomId || null,
        roomTitle: roomTitle || null,
        status: 'ACTIVE',
        startTime: new Date(),
        peakRiskScore: currentRiskScore,
        identityStatus: effectiveIdentityStatus,
        identityMismatchCount: isIdentityMismatch ? 1 : 0,
        lastIdentityVerifiedAt: isIdentityVerified ? new Date() : null,
        lastIdentityMismatchAt: isIdentityMismatch ? new Date() : null,
      });
    } else {
      if (currentRiskScore > session.peakRiskScore) {
        session.peakRiskScore = currentRiskScore;
      }
      if (environment?.phone_detected) {
        session.phoneDetections = (session.phoneDetections || 0) + 1;
      }
      if (attention?.status === 'DISTRACTED') {
        session.distractionCount = (session.distractionCount || 0) + 1;
      }
      if (roomId && !session.roomId) session.roomId = roomId;
      if (roomTitle && !session.roomTitle) session.roomTitle = roomTitle;
      if (mode && !session.mode) {
        session.mode = mode;
        session.sessionType = mode;
      }
      session.identityStatus = effectiveIdentityStatus;
      if (isIdentityMismatch) {
        session.identityMismatchCount = (session.identityMismatchCount || 0) + 1;
        session.lastIdentityMismatchAt = new Date();
      } else if (isIdentityVerified) {
        session.lastIdentityVerifiedAt = new Date();
      }
      await session.save();
    }

    const effectiveRoomId = roomId || session.roomId;

    // Record alerts if events present. Every transition event becomes one Alert
    // record (the client already dedupes to state transitions, so no spam), with
    // report-grade fields so the host's report timeline is meaningful.
    if (behaviour?.events && Array.isArray(behaviour.events)) {
      for (const evt of behaviour.events) {
        // Canonical severity vocabulary (matches the Proctor Room socket alerts
        // and the Report model): CRITICAL | HIGH | MEDIUM | LOW | INFO.
        const severity = evt.severity === 'CRITICAL' || evt.severity === 'HIGH'
          ? evt.severity
          : evt.severity === 'MEDIUM'
            ? 'MEDIUM'
            : evt.state === 'RESOLVED' || evt.severity === 'LOW'
              ? 'LOW'
              : 'INFO';

        await Alert.create({
          sessionId: session_id,
          participantId: user_id,
          userName: session.userName,
          userEmail: session.userEmail,
          type: evt.type,
          eventType: evt.type,
          severity,
          confidence: Number(evt.confidence) || 0.85,
          evidence: evt.evidence || `Event triggered: ${evt.type}`,
          // RESOLVED (CLEARED) lifecycle events are recorded as informational.
          status: evt.state === 'RESOLVED' ? 'RESOLVED' : 'OPEN',
          timestamp: evt.timestamp ? new Date(evt.timestamp) : new Date(),
        });

        session.totalAlerts += 1;

        // Relay live alert to Host Proctor Room via Socket.IO
        if (effectiveRoomId) {
          const io = req.app.get('io');
          if (io) {
            const alertPayload = {
              roomId: effectiveRoomId,
              sessionId: session_id,
              candidateId: userId,
              candidateName: session.userName,
              type: evt.type,
              eventType: evt.type,
              severity,
              riskScore: currentRiskScore,
              timestamp: new Date().toISOString(),
              message: evt.evidence || `AI detected ${evt.type.replace(/_/g, ' ')}`,
              confidence: Number(evt.confidence) || 0.85,
            };
            io.to(`proctor:${effectiveRoomId}`).emit('proctor_alert', alertPayload);
            io.to(`room_${effectiveRoomId}`).emit('proctor_alert', alertPayload);
            io.to(`proctor:${effectiveRoomId}`).emit('AI_EVENT', alertPayload);
            io.to(`room_${effectiveRoomId}`).emit('AI_EVENT', alertPayload);
          }
        }
      }
      await session.save();
    }

    // Update Room participant status & risk in MongoDB if roomId present
    if (effectiveRoomId) {
      try {
        const roomDoc = await Room.findOne({
          $or: [
            { roomId: effectiveRoomId.toUpperCase() },
            { joinCode: effectiveRoomId.toUpperCase() }
          ]
        });

        if (roomDoc && roomDoc.participants) {
          const pIndex = roomDoc.participants.findIndex(p => p.sessionId === session_id || p.id === userId || p.email === userEmail);
          const isPhone = Boolean(environment?.phone_detected);
          const isLive = liveness?.is_live !== false && liveness?.status !== 'spoof';
          const isFace = identity?.face_detected !== false;

          if (pIndex >= 0) {
            roomDoc.participants[pIndex].riskScore = currentRiskScore;
            roomDoc.participants[pIndex].riskLevel = riskLevel;
            roomDoc.participants[pIndex].violations = session.totalAlerts;
            roomDoc.participants[pIndex].liveness = isLive ? 'LIVE' : 'SPOOF';
            roomDoc.participants[pIndex].faceDetected = isFace;
            roomDoc.participants[pIndex].phoneDetected = isPhone;
            roomDoc.participants[pIndex].identityStatus = effectiveIdentityStatus;
            if (isIdentityMismatch) {
              roomDoc.participants[pIndex].identityMismatchCount = (roomDoc.participants[pIndex].identityMismatchCount || 0) + 1;
            }
            roomDoc.participants[pIndex].status = 'MONITORING';
            if (attention?.gaze_direction) roomDoc.participants[pIndex].gaze = attention.gaze_direction;
            if (attention?.head_pose) roomDoc.participants[pIndex].pose = attention.head_pose;
          } else {
            roomDoc.participants.push({
              id: userId,
              sessionId: session_id,
              name: session.userName,
              email: session.userEmail,
              status: 'MONITORING',
              riskScore: currentRiskScore,
              riskLevel,
              violations: session.totalAlerts,
              liveness: isLive ? 'LIVE' : 'SPOOF',
              faceDetected: isFace,
              phoneDetected: isPhone,
              identityStatus: effectiveIdentityStatus,
              identityMismatchCount: isIdentityMismatch ? 1 : 0,
              gaze: attention?.gaze_direction || 'center',
              pose: attention?.head_pose || 'Looking Straight',
              joinedAt: new Date()
            });
          }
          await roomDoc.save();

          const io = req.app.get('io');
          if (io) {
            io.to(`proctor:${effectiveRoomId}`).emit('participant_risk_updated', {
              participantId: userId,
              sessionId: session_id,
              riskScore: currentRiskScore,
              riskLevel,
              identityStatus: effectiveIdentityStatus,
              violations: session.totalAlerts,
              phoneDetected: isPhone,
              liveness: isLive ? 'LIVE' : 'SPOOF',
              participants: roomDoc.participants,
            });
            io.to(`room_${effectiveRoomId}`).emit('participant_risk_updated', {
              participantId: userId,
              sessionId: session_id,
              riskScore: currentRiskScore,
              riskLevel,
              identityStatus: effectiveIdentityStatus,
              violations: session.totalAlerts,
              phoneDetected: isPhone,
              liveness: isLive ? 'LIVE' : 'SPOOF',
              participants: roomDoc.participants,
            });
          }
        }
      } catch (rErr) {
        console.warn('[logUnifiedEvent] Error updating room participant telemetry:', rErr.message);
      }
    }

    // Broadcast live update to any active dashboards connected via Socket.IO
    req.app.get('io')?.emit('DASHBOARD_LIVE_EVENT', {
      sessionId: session_id,
      riskScore: currentRiskScore,
      riskLevel,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Unified monitoring event logged successfully',
      session_id,
      risk: { score: currentRiskScore, level: riskLevel },
      decision,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get real dynamic dashboard metrics & live events from MongoDB
// @route   GET /api/ai-engine/dashboard-stats
// @access  Public / Private
const getDashboardStats = async (req, res, next) => {
  try {
    const timeRange = (req.query.timeRange || '30D').toUpperCase();
    let query = {};
    if (req.user && req.user.role !== 'admin') {
      query.userEmail = req.user.email;
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const totalSessionsCount = await Session.countDocuments(query);
    const activeSessionsCount = await Session.countDocuments({
      ...query,
      status: { $in: ['ACTIVE', 'LIVE', 'WARNING', 'READY'] }
    });
    const completedSessionsCount = await Session.countDocuments({
      ...query,
      status: 'COMPLETED'
    });
    const todaySessionsCount = await Session.countDocuments({
      ...query,
      createdAt: { $gte: startOfDay }
    });

    const totalAlertsCount = await Alert.countDocuments(query);
    const criticalAlertsCount = await Alert.countDocuments({
      ...query,
      severity: { $in: ['CRITICAL', 'danger'] }
    });
    const highAlertsCount = await Alert.countDocuments({
      ...query,
      severity: { $in: ['HIGH', 'warning'] }
    });

    // Build Dynamic Time Buckets for Real-Time Charts
    const now = new Date();
    const buckets = [];

    if (timeRange === 'TODAY') {
      // 6 time buckets for today: 00:00, 04:00, 08:00, 12:00, 16:00, 20:00
      for (let h = 0; h < 24; h += 4) {
        const bStart = new Date(startOfDay.getTime() + h * 3600000);
        const bEnd = new Date(startOfDay.getTime() + (h + 4) * 3600000);
        const label = `${String(h).padStart(2, '0')}:00`;
        buckets.push({ label, start: bStart, end: bEnd });
      }
    } else if (timeRange === '7D') {
      // Last 7 calendar days
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const bStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
        const bEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        buckets.push({ label: `${mm}-${dd}`, start: bStart, end: bEnd });
      }
    } else if (timeRange === 'CUSTOM') {
      // 4 weekly buckets: W1, W2, W3, W4
      for (let i = 3; i >= 0; i--) {
        const bStart = new Date(now.getTime() - (i + 1) * 7 * 86400000);
        const bEnd = new Date(now.getTime() - i * 7 * 86400000);
        buckets.push({ label: `W${4 - i}`, start: bStart, end: bEnd });
      }
    } else {
      // Default '30D': 6 intervals spanning the last 30 days
      const daysPerBucket = 5;
      for (let i = 5; i >= 0; i--) {
        const dStart = new Date(now.getTime() - (i + 1) * daysPerBucket * 86400000);
        const dEnd = new Date(now.getTime() - i * daysPerBucket * 86400000);
        const mm = String(dEnd.getMonth() + 1).padStart(2, '0');
        const dd = String(dEnd.getDate()).padStart(2, '0');
        buckets.push({ label: `${mm}-${dd}`, start: dStart, end: dEnd });
      }
    }

    // Execute real aggregate queries across the time buckets
    const sessionsOverTime = [];
    const alertsOverTime = [];

    for (const b of buckets) {
      const [createdCount, startedCount, completedCount, suspendedCount] = await Promise.all([
        Session.countDocuments({ ...query, createdAt: { $gte: b.start, $lt: b.end } }),
        Session.countDocuments({ ...query, startTime: { $gte: b.start, $lt: b.end } }),
        Session.countDocuments({ ...query, status: 'COMPLETED', updatedAt: { $gte: b.start, $lt: b.end } }),
        Session.countDocuments({ ...query, status: 'SUSPENDED', updatedAt: { $gte: b.start, $lt: b.end } }),
      ]);

      sessionsOverTime.push({
        date: b.label,
        created: createdCount,
        started: startedCount,
        completed: completedCount,
        suspended: suspendedCount,
      });

      const [criticalCount, highCount, mediumCount, lowCount] = await Promise.all([
        Alert.countDocuments({ ...query, severity: { $in: ['CRITICAL', 'danger'] }, timestamp: { $gte: b.start, $lt: b.end } }),
        Alert.countDocuments({ ...query, severity: { $in: ['HIGH', 'warning'] }, timestamp: { $gte: b.start, $lt: b.end } }),
        Alert.countDocuments({ ...query, severity: 'MEDIUM', timestamp: { $gte: b.start, $lt: b.end } }),
        Alert.countDocuments({ ...query, severity: { $in: ['LOW', 'INFO', 'info'] }, timestamp: { $gte: b.start, $lt: b.end } }),
      ]);

      alertsOverTime.push({
        date: b.label,
        critical: criticalCount,
        high: highCount,
        medium: mediumCount,
        low: lowCount,
      });
    }

    const recentAlerts = await Alert.find(query).sort({ timestamp: -1 }).limit(10);
    const recentSessions = await Session.find(query).sort({ startTime: -1 }).limit(10);

    const timelineItems = recentAlerts.map(alert => ({
      id: alert._id,
      message: `[${alert.type}] ${alert.evidence} (Session ${alert.sessionId.slice(-6)})`,
      time: new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      severity: alert.severity,
    }));

    res.json({
      success: true,
      stats: {
        mySessions: totalSessionsCount,
        activeSessions: activeSessionsCount,
        completedSessions: completedSessionsCount,
        myAlerts: totalAlertsCount,
        criticalAlerts: criticalAlertsCount,
        highAlerts: highAlertsCount,
        todaySessions: todaySessionsCount,
        totalSessions: totalSessionsCount,
        totalViolations: totalAlertsCount,
        systemHealth: 100,
      },
      sessionsOverTime,
      alertsOverTime,
      alerts: recentAlerts,
      sessions: recentSessions,
      timeline: timelineItems,
    });
  } catch (error) {
    next(error);
  }
};


// @desc    Get all alerts for the current user
// @route   GET /api/ai-engine/alerts
// @access  Private
const getAlerts = async (req, res, next) => {
  try {
    let query = {};
    if (req.user && req.user.role !== 'admin') {
      query.userEmail = req.user.email;
    }
    const alerts = await Alert.find(query).sort({ timestamp: -1 });
    res.json({ success: true, alerts });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all sessions from MongoDB with optional filtering
// @route   GET /api/ai-engine/sessions
// @access  Private / Public
const getSessions = async (req, res, next) => {
  try {
    const { filter = 'ALL', search = '' } = req.query;
    let query = {};

    if (req.user && req.user.role !== 'admin') {
      const userConditions = [
        { userEmail: req.user.email },
        { userEmail: req.user.email.toLowerCase() },
      ];
      if (req.user._id) userConditions.push({ userId: String(req.user._id) });
      if (req.user.id) userConditions.push({ userId: String(req.user.id) });
      query.$or = userConditions;
    }

    if (filter === 'ACTIVE') {
      query.status = { $in: ['ACTIVE', 'LIVE', 'WARNING', 'READY'] };
    } else if (filter === 'FLAGGED') {
      query.status = { $in: ['SUSPENDED', 'SUSPENDING', 'FLAGGED', 'WARNING'] };
    }

    if (search) {
      const searchConditions = [
        { sessionId: { $regex: search, $options: 'i' } },
        { userName: { $regex: search, $options: 'i' } },
        { userEmail: { $regex: search, $options: 'i' } },
        { mode: { $regex: search, $options: 'i' } },
        { roomTitle: { $regex: search, $options: 'i' } },
      ];
      if (query.$or) {
        const userOr = query.$or;
        delete query.$or;
        query.$and = [
          { $or: userOr },
          { $or: searchConditions }
        ];
      } else {
        query.$or = searchConditions;
      }
    }

    const sessions = await Session.find(query).sort({ createdAt: -1 });
    res.json({ success: true, count: sessions.length, sessions });
  } catch (error) {
    next(error);
  }
};

// @desc    Get detailed session by sessionId including timeline & alerts
// @route   GET /api/ai-engine/sessions/:sessionId
// @access  Private / Public
const getSessionById = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const session = await Session.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    const alerts = await Alert.find({ sessionId }).sort({ timestamp: 1 });
    const timeline = alerts.map(a => ({
      id: a._id,
      timestamp: a.timestamp,
      type: a.eventType || a.type,
      severity: a.severity,
      evidence: a.evidence || a.description || '',
      status: a.status,
    }));

    res.json({
      success: true,
      session,
      alerts,
      timeline,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload & persist session video recording
// @route   POST /api/ai-engine/sessions/:sessionId/recording
// @access  Private / Public
const fs = require('fs');
const path = require('path');

const uploadSessionRecording = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    let session = await Session.findOne({ sessionId });
    if (!session) {
      session = await Session.findOne({ sessionId: { $regex: `^${sessionId}$`, $options: 'i' } });
    }
    if (!session) {
      session = await Session.create({
        sessionId,
        status: 'COMPLETED',
        startTime: new Date(),
        userName: req.user?.fullName || req.user?.name || 'Student Candidate',
        userEmail: req.user?.email || 'student@trueview.ai',
      });
    }

    const recordingsDir = path.join(__dirname, '..', 'uploads', 'recordings');
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
    }

    let bufferToWrite = null;
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      bufferToWrite = req.body;
    } else if (req.body && req.body.videoBase64) {
      const base64Data = req.body.videoBase64.replace(/^data:video\/\w+;base64,/, '');
      bufferToWrite = Buffer.from(base64Data, 'base64');
    }

    if (!bufferToWrite || bufferToWrite.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid video binary payload received'
      });
    }

    const filename = `${sessionId}_${Date.now()}.webm`;
    const filePath = path.join(recordingsDir, filename);

    // Binary-safe synchronous file write
    fs.writeFileSync(filePath, bufferToWrite);
    const writtenStat = fs.statSync(filePath);

    if (writtenStat.size !== bufferToWrite.length) {
      console.error(`[Recording Upload] Disk size mismatch: wrote ${writtenStat.size} bytes vs ${bufferToWrite.length} buffer bytes`);
    } else {
      console.log(`[Recording Upload] Successfully persisted ${filename}: ${writtenStat.size} bytes`);
    }

    const recordingUrl = `/uploads/recordings/${filename}`;
    session.recordingUrl = recordingUrl;
    await session.save();

    res.json({
      success: true,
      message: 'Session recording saved successfully',
      recordingUrl,
      size: writtenStat.size,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    End session, calculate final score, and generate report
// @route   POST /api/ai-engine/sessions/:sessionId/end
// @access  Private / Public
const endSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    let session = await Session.findOne({ sessionId });
    if (!session) {
      session = await Session.findOne({ sessionId: { $regex: `^${sessionId}$`, $options: 'i' } });
    }
    if (!session) {
      session = await Session.create({
        sessionId,
        status: 'COMPLETED',
        startTime: new Date(),
        userName: req.user?.fullName || req.user?.name || 'Student Candidate',
        userEmail: req.user?.email || 'student@trueview.ai',
      });
    }

    session.endTime = new Date();
    session.status = 'COMPLETED';
    const durationSeconds = Math.max(0, Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000));
    session.durationSeconds = durationSeconds;

    const alerts = await Alert.find({ sessionId });
    const violationAlerts = alerts.filter(a => ['CRITICAL', 'HIGH', 'MEDIUM'].includes(String(a.severity).toUpperCase()));
    const totalViolations = violationAlerts.length;
    const phoneDetections = session.phoneDetections || alerts.filter(a => a.type === 'PHONE_DETECTED' || a.eventType === 'PHONE_DETECTED').length;

    let score = 100 - (phoneDetections * 25) - (totalViolations * 5);
    score = Math.max(0, Math.min(100, score));
    session.overallIntegrityScore = score;
    await session.save();

    // Create or update Report
    const reportId = `RPT-${Date.now().toString().slice(-6)}`;
    const status = score < 60 ? 'FLAGGED' : score < 85 ? 'REVIEW_REQUIRED' : 'PASSED';
    const riskLevel = score < 60 ? 'HIGH_RISK' : score < 85 ? 'MEDIUM_RISK' : 'NORMAL';

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

    let report = await Report.findOne({ sessionId });
    if (!report) {
      report = await Report.create({
        reportId,
        sessionId,
        userName: session.userName,
        userEmail: session.userEmail,
        sessionType: session.mode || session.sessionType || 'EXAM',
        startTime: session.startTime,
        endTime: session.endTime,
        durationSeconds,
        overallIntegrityScore: score,
        riskLevel,
        totalViolations,
        phoneDetections,
        alerts: alerts.map(a => ({
          eventType: a.eventType || a.type,
          severity: a.severity,
          evidence: a.evidence || a.description || '',
          timestamp: a.timestamp,
        })),
        timeline,
        status,
      });
    } else {
      report.endTime = session.endTime;
      report.durationSeconds = durationSeconds;
      report.overallIntegrityScore = score;
      report.riskLevel = riskLevel;
      report.totalViolations = totalViolations;
      report.phoneDetections = phoneDetections;
      report.status = status;
      report.timeline = timeline;
      await report.save();
    }

    res.json({
      success: true,
      message: 'Session completed successfully',
      session,
      report,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  logUnifiedEvent,
  getDashboardStats,
  getAlerts,
  getSessions,
  getSessionById,
  uploadSessionRecording,
  endSession,
};
