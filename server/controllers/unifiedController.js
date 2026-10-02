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

    const effectiveRoomId = roomId || session.roomId || (session_id && session_id.startsWith('TRV-') ? (session_id.startsWith('TRV-TRV-') ? session_id.split('-').slice(1, 3).join('-') : session_id.split('-').slice(0, 2).join('-')) : null);

    // Resolve room owner if room is known
    let roomOwnerId = null;
    let roomDoc = null;
    if (effectiveRoomId) {
      try {
        roomDoc = await Room.findOne({
          $or: [
            { roomId: effectiveRoomId.toUpperCase() },
            { joinCode: effectiveRoomId.toUpperCase() }
          ]
        });
        if (roomDoc) {
          roomOwnerId = roomDoc.ownerId || roomDoc.createdBy || roomDoc.hostUserId || roomDoc.host?.id;
        }
      } catch (_) {}
    }

    // Record alerts if events present. Every transition event becomes one Alert
    // record (the client already dedupes to state transitions, so no spam), with
    // report-grade fields so the host's report timeline is meaningful.
    if (behaviour?.events && Array.isArray(behaviour.events)) {
      for (const evt of behaviour.events) {
        const evtObj = typeof evt === 'string' ? { type: evt, eventType: evt, severity: evt.includes('PHONE') || evt.includes('SPOOF') ? 'HIGH' : 'MEDIUM', evidence: evt.replace(/_/g, ' ') } : evt;
        if (evtObj.should_alert === false || evtObj.in_cooldown === true || evtObj.state === 'COOLDOWN' || evtObj.state === 'OBSERVING') {
          continue;
        }
        const eventType = evtObj.type || evtObj.eventType || 'VIOLATION';
        // Canonical severity vocabulary (matches the Proctor Room socket alerts
        // and the Report model): CRITICAL | HIGH | MEDIUM | LOW | INFO.
        const severity = evtObj.severity === 'CRITICAL' || evtObj.severity === 'HIGH'
          ? evtObj.severity
          : evtObj.severity === 'MEDIUM'
            ? 'MEDIUM'
            : evtObj.state === 'RESOLVED' || evtObj.severity === 'LOW'
              ? 'LOW'
              : 'INFO';

        await Alert.create({
          sessionId: session_id,
          roomId: effectiveRoomId,
          hostId: roomOwnerId,
          studentId: userId,
          participantId: user_id || userId,
          userName: session.userName,
          userEmail: session.userEmail,
          type: eventType,
          eventType,
          severity,
          confidence: Number(evtObj.confidence) || 0.85,
          evidence: evtObj.evidence || `Event triggered: ${eventType}`,
          // RESOLVED (CLEARED) lifecycle events are recorded as informational.
          status: evtObj.state === 'RESOLVED' ? 'RESOLVED' : 'OPEN',
          timestamp: evtObj.timestamp ? new Date(evtObj.timestamp) : new Date(),
        });

        session.totalAlerts += 1;

        const io = req.app.get('io');
        if (io) {
          const alertPayload = {
            roomId: effectiveRoomId,
            sessionId: session_id,
            candidateId: userId,
            studentId: userId,
            candidateName: session.userName,
            studentName: session.userName,
            type: eventType,
            eventType: eventType,
            category: evtObj.category || 'BEHAVIOUR',
            source: evtObj.source || 'AI_ENGINE',
            severity,
            riskScore: currentRiskScore,
            timestamp: new Date().toISOString(),
            message: evtObj.evidence || evtObj.message || `AI detected ${eventType.replace(/_/g, ' ')}`,
            description: evtObj.evidence || evtObj.message || `AI detected ${eventType.replace(/_/g, ' ')}`,
            evidence: evtObj.evidence || '',
            confidence: Number(evtObj.confidence) || 0.85,
            state: evtObj.state || 'CONFIRMED',
            status: evtObj.state === 'RESOLVED' ? 'RESOLVED' : 'OPEN',
          };

          // Emit to active monitoring session rooms
          io.to(`room_${session_id}`).emit('proctor:event', alertPayload);
          io.to(`session:${session_id}`).emit('proctor:event', alertPayload);
          io.to(`room_${session_id}`).emit('AI_EVENT', alertPayload);
          io.to(`session:${session_id}`).emit('AI_EVENT', alertPayload);
          io.to(`room_${session_id}`).emit('ALERT_CREATED', alertPayload);
          io.to(`session:${session_id}`).emit('ALERT_CREATED', alertPayload);
          io.to(`room_${session_id}`).emit('proctor_alert', alertPayload);
          io.to(`session:${session_id}`).emit('proctor_alert', alertPayload);
          io.to(`room_${session_id}`).emit('TRUST_SCORE_UPDATED', { trustScore: Math.max(0, 100 - currentRiskScore) });
          io.to(`session:${session_id}`).emit('TRUST_SCORE_UPDATED', { trustScore: Math.max(0, 100 - currentRiskScore) });
          io.to(`room_${session_id}`).emit('RISK_SCORE_UPDATED', { riskScore: currentRiskScore, riskLevel });
          io.to(`session:${session_id}`).emit('RISK_SCORE_UPDATED', { riskScore: currentRiskScore, riskLevel });

          // Relay live alert to Host Proctor Room via Socket.IO
          if (effectiveRoomId) {
            io.to(`proctor:${effectiveRoomId}`).emit('proctor_alert', alertPayload);
            io.to(`room:proctor:${effectiveRoomId}`).emit('proctor_alert', alertPayload);
            io.to(`room_${effectiveRoomId}`).emit('proctor_alert', alertPayload);
            io.to(`proctor:${effectiveRoomId}`).emit('AI_EVENT', alertPayload);
            io.to(`room_${effectiveRoomId}`).emit('AI_EVENT', alertPayload);
            io.to(`proctor:${effectiveRoomId}`).emit('AI_ALERT_CREATED', alertPayload);
            io.to(`room_${effectiveRoomId}`).emit('AI_ALERT_CREATED', alertPayload);
            io.to(`proctor:${effectiveRoomId}`).emit('proctor:event', alertPayload);
            io.to(`proctor:${effectiveRoomId}`).emit('participant_risk_updated', {
              roomId: effectiveRoomId,
              sessionId: session_id,
              candidateId: userId,
              candidateName: session.userName,
              riskScore: currentRiskScore,
              riskLevel,
              violations: session.totalAlerts,
            });
            io.to(`room_${effectiveRoomId}`).emit('participant_risk_updated', {
              roomId: effectiveRoomId,
              sessionId: session_id,
              candidateId: userId,
              candidateName: session.userName,
              riskScore: currentRiskScore,
              riskLevel,
              violations: session.totalAlerts,
            });

            if (roomOwnerId) {
              io.to(`user:${roomOwnerId}`).emit('proctor_alert', alertPayload);
              io.to(`user:${roomOwnerId}`).emit('AI_EVENT', alertPayload);
              io.to(`user:${roomOwnerId}`).emit('AI_ALERT_CREATED', alertPayload);
              io.to(`user:${roomOwnerId}`).emit('ALERT_CREATED', alertPayload);
            }
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
    let sessionQuery = {};
    let alertQuery = {};

    if (req.user && req.user.role !== 'admin') {
      const userId = String(req.user._id || req.user.id);
      const userEmails = [req.user.email, req.user.email?.toLowerCase()].filter(Boolean);

      // Find all rooms owned by this user
      const hostedRooms = await Room.find({
        $or: [
          { ownerId: userId },
          { createdBy: userId },
          { hostUserId: userId },
          { 'host.id': userId },
          { 'host.email': { $in: userEmails } },
        ]
      }).select('roomId').lean();
      const hostedRoomIds = hostedRooms.map(r => r.roomId);

      const sessionConditions = [
        { userEmail: { $in: userEmails } },
        { userId: userId }
      ];
      if (hostedRoomIds.length > 0) {
        sessionConditions.push({ roomId: { $in: hostedRoomIds } });
        sessionConditions.push({ hostId: userId });
      }
      sessionQuery.$or = sessionConditions;

      const alertConditions = [
        { userEmail: { $in: userEmails } },
        { participantId: userId },
        { studentId: userId }
      ];
      if (hostedRoomIds.length > 0) {
        alertConditions.push({ roomId: { $in: hostedRoomIds } });
        alertConditions.push({ hostId: userId });
      }
      alertQuery.$or = alertConditions;
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const totalSessionsCount = await Session.countDocuments(sessionQuery);
    const activeSessionsCount = await Session.countDocuments({
      ...sessionQuery,
      status: { $in: ['ACTIVE', 'LIVE', 'WARNING', 'READY'] }
    });
    const completedSessionsCount = await Session.countDocuments({
      ...sessionQuery,
      status: 'COMPLETED'
    });
    const todaySessionsCount = await Session.countDocuments({
      ...sessionQuery,
      createdAt: { $gte: startOfDay }
    });

    const totalAlertsCount = await Alert.countDocuments(alertQuery);
    const criticalAlertsCount = await Alert.countDocuments({
      ...alertQuery,
      severity: { $in: ['CRITICAL', 'danger'] }
    });
    const highAlertsCount = await Alert.countDocuments({
      ...alertQuery,
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
        Session.countDocuments({ ...sessionQuery, createdAt: { $gte: b.start, $lt: b.end } }),
        Session.countDocuments({ ...sessionQuery, startTime: { $gte: b.start, $lt: b.end } }),
        Session.countDocuments({ ...sessionQuery, status: 'COMPLETED', updatedAt: { $gte: b.start, $lt: b.end } }),
        Session.countDocuments({ ...sessionQuery, status: 'SUSPENDED', updatedAt: { $gte: b.start, $lt: b.end } }),
      ]);

      sessionsOverTime.push({
        date: b.label,
        created: createdCount,
        started: startedCount,
        completed: completedCount,
        suspended: suspendedCount,
      });

      const [criticalCount, highCount, mediumCount, lowCount] = await Promise.all([
        Alert.countDocuments({ ...alertQuery, severity: { $in: ['CRITICAL', 'danger'] }, timestamp: { $gte: b.start, $lt: b.end } }),
        Alert.countDocuments({ ...alertQuery, severity: { $in: ['HIGH', 'warning'] }, timestamp: { $gte: b.start, $lt: b.end } }),
        Alert.countDocuments({ ...alertQuery, severity: 'MEDIUM', timestamp: { $gte: b.start, $lt: b.end } }),
        Alert.countDocuments({ ...alertQuery, severity: { $in: ['LOW', 'INFO', 'info'] }, timestamp: { $gte: b.start, $lt: b.end } }),
      ]);

      alertsOverTime.push({
        date: b.label,
        critical: criticalCount,
        high: highCount,
        medium: mediumCount,
        low: lowCount,
      });
    }

    const recentAlerts = await Alert.find(alertQuery).sort({ timestamp: -1 }).limit(10);
    const recentSessions = await Session.find(sessionQuery).sort({ startTime: -1 }).limit(10);

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
      const userId = String(req.user._id || req.user.id);
      const userEmails = [req.user.email, req.user.email?.toLowerCase()].filter(Boolean);

      // Find all rooms owned by this user
      const hostedRooms = await Room.find({
        $or: [
          { ownerId: userId },
          { createdBy: userId },
          { hostUserId: userId },
          { 'host.id': userId },
          { 'host.email': { $in: userEmails } },
        ]
      }).select('roomId').lean();
      const hostedRoomIds = hostedRooms.map(r => r.roomId);

      const alertConditions = [
        { userEmail: { $in: userEmails } },
        { participantId: userId },
        { studentId: userId },
      ];
      if (hostedRoomIds.length > 0) {
        alertConditions.push({ roomId: { $in: hostedRoomIds } });
        alertConditions.push({ hostId: userId });
      }
      query.$or = alertConditions;
    }
    const alerts = await Alert.find(query).sort({ timestamp: -1 }).lean();
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
    const { filter = 'ALL', search = '', mode = 'ALL' } = req.query;
    let query = {};

    if (req.user && req.user.role !== 'admin') {
      const userId = String(req.user._id || req.user.id);
      const userEmails = [req.user.email, req.user.email?.toLowerCase()].filter(Boolean);
      const userConditions = [
        { userEmail: { $in: userEmails } },
        { userId: userId },
      ];

      // If user is a host of any virtual rooms, include sessions from their hosted rooms
      const hostedRooms = await Room.find({
        $or: [
          { ownerId: userId },
          { createdBy: userId },
          { hostUserId: userId },
          { 'host.id': userId },
          { 'host.email': { $in: userEmails } },
        ]
      }).select('roomId').lean();
      const hostedRoomIds = hostedRooms.map(r => r.roomId);
      if (hostedRoomIds.length > 0) {
        userConditions.push({ roomId: { $in: hostedRoomIds } });
        userConditions.push({ hostId: userId });
      }

      query.$or = userConditions;
    }

    if (filter === 'ACTIVE') {
      query.status = { $in: ['ACTIVE', 'LIVE', 'WARNING', 'READY'] };
    } else if (filter === 'COMPLETED') {
      query.status = { $in: ['COMPLETED', 'EXITED'] };
    } else if (filter === 'SUSPENDED') {
      query.status = { $in: ['SUSPENDED', 'SUSPENDING', 'FLAGGED'] };
    } else if (filter === 'FLAGGED') {
      query.status = { $in: ['SUSPENDED', 'SUSPENDING', 'FLAGGED', 'WARNING'] };
    }

    if (mode && mode !== 'ALL') {
      const modeConditions = [
        { mode: { $regex: `^${mode}$`, $options: 'i' } },
        { sessionType: { $regex: `^${mode}$`, $options: 'i' } },
      ];
      if (query.$or) {
        query = { $and: [{ $or: query.$or }, { $or: modeConditions }] };
      } else {
        query.$or = modeConditions;
      }
    }

    if (search) {
      const searchConditions = [
        { sessionId: { $regex: search, $options: 'i' } },
        { roomId: { $regex: search, $options: 'i' } },
        { userName: { $regex: search, $options: 'i' } },
        { userEmail: { $regex: search, $options: 'i' } },
        { mode: { $regex: search, $options: 'i' } },
        { roomTitle: { $regex: search, $options: 'i' } },
        { hostName: { $regex: search, $options: 'i' } },
      ];
      if (query.$and) {
        query.$and.push({ $or: searchConditions });
      } else if (query.$or) {
        const existingOr = query.$or;
        query = { $and: [{ $or: existingOr }, { $or: searchConditions }] };
      } else {
        query.$or = searchConditions;
      }
    }

    const sessions = await Session.find(query).sort({ createdAt: -1 }).lean();

    // Enrich sessions with matching room details and report presence
    const sessionIds = sessions.map(s => s.sessionId);
    const existingReports = await Report.find({ sessionId: { $in: sessionIds } }).select('reportId sessionId status').lean();
    const reportMap = new Map(existingReports.map(r => [r.sessionId, r]));

    const roomIds = sessions.map(s => s.roomId).filter(Boolean);
    const rooms = await Room.find({ roomId: { $in: roomIds } }).select('roomId title host').lean();
    const roomMap = new Map(rooms.map(r => [r.roomId, r]));

    const enrichedSessions = sessions.map(s => {
      const matchedReport = reportMap.get(s.sessionId);
      const matchedRoom = roomMap.get(s.roomId);
      return {
        ...s,
        roomTitle: s.roomTitle || matchedRoom?.title || (s.roomId ? `Room ${s.roomId}` : 'Monitored Session'),
        hostName: s.hostName || matchedRoom?.host?.name || 'Session Host',
        hostEmail: s.hostEmail || matchedRoom?.host?.email || '',
        reportId: matchedReport?.reportId || null,
        hasReport: Boolean(matchedReport),
        reportStatus: matchedReport?.status || null,
      };
    });

    res.json({ success: true, count: enrichedSessions.length, sessions: enrichedSessions });
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
    const sessionDoc = await Session.findOne({ sessionId });
    if (!sessionDoc) {
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

    const sessionObj = sessionDoc.toObject ? sessionDoc.toObject() : sessionDoc;
    let room = null;
    const effectiveRoomId = sessionObj.roomId || (sessionId.startsWith('TRV-') ? (sessionId.startsWith('TRV-TRV-') ? sessionId.split('-').slice(1, 3).join('-') : sessionId.split('-').slice(0, 2).join('-')) : null);
    if (effectiveRoomId) {
      room = await Room.findOne({ roomId: effectiveRoomId }).lean();
    }
    const report = await Report.findOne({ sessionId }).select('reportId verdict overallIntegrityScore status').lean();

    const enrichedSession = {
      ...sessionObj,
      roomId: effectiveRoomId,
      roomTitle: sessionObj.roomTitle || (room ? room.title : (effectiveRoomId ? `Room ${effectiveRoomId}` : 'Proctor Examination')),
      hostName: sessionObj.hostName || (room?.host ? (room.host.name || room.host.fullName) : 'Proctor Host'),
      hostEmail: sessionObj.hostEmail || (room?.host ? room.host.email : ''),
      hasReport: !!report,
      reportId: report?.reportId || null,
    };

    res.json({
      success: true,
      session: enrichedSession,
      alerts,
      timeline,
      report,
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
// @desc    Register/start a new monitoring session (called by extension when monitoring begins)
// @route   POST /api/ai-engine/sessions/:sessionId/start
// @access  Private / Public
const startSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { roomId, roomTitle, mode, sessionType, source } = req.body || {};
    const userId = req.user ? String(req.user._id || req.user.id) : (req.body?.userId || 'extension_candidate');
    const userName = req.user?.fullName || req.user?.name || req.body?.userName || 'Student Candidate';
    const userEmail = req.user?.email || req.body?.userEmail || 'student@trueview.ai';
    const effectiveMode = (mode || sessionType || 'EXAM').toUpperCase();

    // Upsert: find or create the session document
    let session = await Session.findOne({ sessionId });
    if (!session) {
      session = await Session.create({
        sessionId,
        userId,
        userName,
        userEmail,
        mode: effectiveMode,
        sessionType: effectiveMode,
        roomId: roomId || null,
        roomTitle: roomTitle || null,
        status: 'ACTIVE',
        startTime: new Date(),
        source: source || 'EXTENSION',
      });
    } else {
      // Update metadata if session already existed (e.g. from logUnifiedEvent)
      if (!session.userId && userId) session.userId = userId;
      if (!session.userName || session.userName === 'Student Candidate') session.userName = userName;
      if (!session.userEmail || session.userEmail === 'student@trueview.ai') session.userEmail = userEmail;
      if (!session.roomId && roomId) session.roomId = roomId;
      if (!session.roomTitle && roomTitle) session.roomTitle = roomTitle;
      if (session.status !== 'ACTIVE') session.status = 'ACTIVE';
      if (!session.startTime) session.startTime = new Date();
      await session.save();
    }

    // Notify Socket.IO so live dashboards update
    const io = req.app.get('io');
    if (io) {
      const payload = { sessionId, userId, userEmail, roomId: session.roomId, status: 'ACTIVE', source: source || 'EXTENSION', timestamp: new Date().toISOString() };
      io.emit('SESSION_STARTED', payload);
      if (session.roomId) {
        io.to(`room_${session.roomId}`).emit('SESSION_STARTED', payload);
        io.to(`proctor:${session.roomId}`).emit('SESSION_STARTED', payload);
      }
    }

    return res.json({
      success: true,
      message: 'Session started and registered.',
      sessionId,
      session,
    });
  } catch (error) {
    next(error);
  }
};

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

    const effectiveRoomId = session.roomId || req.body?.roomId || (sessionId.startsWith('TRV-') ? (sessionId.startsWith('TRV-TRV-') ? sessionId.split('-').slice(1, 3).join('-') : sessionId.split('-').slice(0, 2).join('-')) : null);
    if (!session.roomId && effectiveRoomId) {
      session.roomId = effectiveRoomId;
    }
    if (!session.roomTitle && effectiveRoomId) {
      const room = await Room.findOne({ roomId: effectiveRoomId }).lean();
      if (room) {
        session.roomTitle = room.title;
        session.hostId = String(room.host?.id || '');
        session.hostName = room.host?.name || 'Session Host';
        session.hostEmail = room.host?.email || '';
      }
    }
    if (req.user) {
      if (!session.userId) session.userId = String(req.user._id || req.user.id);
      if (!session.userName || session.userName === 'Student Candidate') session.userName = req.user.fullName || req.user.name;
      if (!session.userEmail || session.userEmail === 'student@trueview.ai') session.userEmail = req.user.email;
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
        roomId: effectiveRoomId,
        roomTitle: session.roomTitle || req.body?.roomTitle || null,
        candidateId: session.userId || (req.user ? String(req.user._id) : null),
        userName: session.userName,
        userEmail: session.userEmail,
        sessionType: session.mode || session.sessionType || 'EXAM',
        mode: session.mode || session.sessionType || 'EXAM',
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
        verdict: status,
      });
    } else {
      if (effectiveRoomId && !report.roomId) report.roomId = effectiveRoomId;
      if (session.roomTitle && !report.roomTitle) report.roomTitle = session.roomTitle;
      if (session.userId && !report.candidateId) report.candidateId = session.userId;
      report.endTime = session.endTime;
      report.durationSeconds = durationSeconds;
      report.overallIntegrityScore = score;
      report.riskLevel = riskLevel;
      report.totalViolations = totalViolations;
      report.phoneDetections = phoneDetections;
      report.status = status;
      report.verdict = status;
      report.timeline = timeline;
      await report.save();
    }

    // === Socket.IO Broadcasts so Reports.jsx & Sessions.jsx auto-refresh ===
    try {
      const io = req.app.get('io');
      if (io) {
        const completedPayload = {
          sessionId,
          roomId: effectiveRoomId,
          reportId: report.reportId,
          integrityScore: score,
          status,
          userName: session.userName,
          userEmail: session.userEmail,
          timestamp: new Date().toISOString(),
        };
        // Broadcast globally so any connected client (proctor, candidate) updates
        io.emit('SESSION_COMPLETED', completedPayload);
        io.emit('REPORT_CREATED', completedPayload);
        if (effectiveRoomId) {
          io.to(`room_${effectiveRoomId}`).emit('SESSION_COMPLETED', completedPayload);
          io.to(`proctor:${effectiveRoomId}`).emit('REPORT_CREATED', completedPayload);
        }
        if (session.userId) {
          io.to(`user:${session.userId}`).emit('REPORT_CREATED', completedPayload);
        }
      }
    } catch (_) {}

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

// @desc    Record candidate tab switch violation, increment authoritative count, check termination limit
// @route   POST /api/ai-engine/sessions/:sessionId/tab-switch
// @access  Public / Private
const recordTabSwitch = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { roomId: reqRoomId, episodeId, hiddenDuration } = req.body || {};

    let session = await Session.findOne({ sessionId });
    if (!session) {
      session = await Session.findOne({ sessionId: { $regex: `^${sessionId}$`, $options: 'i' } });
    }
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    const maxAllowed = session.maxTabSwitches || 3;

    // Deduplication check: if this episode was already recorded, return current state idempotently
    if (episodeId && session.tabSwitchEvents && session.tabSwitchEvents.some(e => e.episodeId === episodeId)) {
      return res.json({
        success: true,
        sessionId,
        count: session.tabSwitchCount || 0,
        maxAllowed,
        tabSwitchStatus: session.tabSwitchStatus || 'NORMAL',
        terminated: session.status === 'TERMINATED' || (session.tabSwitchCount || 0) >= 4,
        deduplicated: true,
        message: 'Episode already processed.',
      });
    }

    // Debounce duplicate request with the exact same episode ID
    if (episodeId && session.tabSwitchEvents && session.tabSwitchEvents.length > 0) {
      const lastEvt = session.tabSwitchEvents[session.tabSwitchEvents.length - 1];
      if (lastEvt.episodeId === episodeId) {
        return res.json({
          success: true,
          sessionId,
          count: session.tabSwitchCount || 0,
          maxAllowed,
          tabSwitchStatus: session.tabSwitchStatus || 'NORMAL',
          terminated: session.status === 'TERMINATED' || (session.tabSwitchCount || 0) >= 4,
          deduplicated: true,
          message: 'Debounced duplicate request for episode.',
        });
      }
    }

    // If session is already terminated, return current state
    if (session.status === 'TERMINATED') {
      return res.json({
        success: true,
        sessionId,
        count: session.tabSwitchCount || (maxAllowed + 1),
        maxAllowed,
        tabSwitchStatus: 'TERMINATED',
        terminated: true,
        message: 'Session has already been terminated.',
      });
    }

    // Authoritative increment
    const newCount = (session.tabSwitchCount || 0) + 1;
    session.tabSwitchCount = newCount;

    let tabSwitchStatus = 'NORMAL';
    let isTerminated = false;
    let eventType = 'TAB_SWITCH_DETECTED';
    let severity = 'MEDIUM';
    let warningMessage = '';

    if (newCount === 1) {
      tabSwitchStatus = 'WARNING';
      warningMessage = `Tab switch detected (Warning 1 of ${maxAllowed}). Please return to the examination window.`;
    } else if (newCount === 2) {
      tabSwitchStatus = 'WARNING';
      warningMessage = `Tab switch detected (Warning 2 of ${maxAllowed}).`;
    } else if (newCount === 3) {
      tabSwitchStatus = 'FINAL_WARNING';
      warningMessage = `Final warning: Tab switch detected (Warning 3 of ${maxAllowed}). One more tab switch will terminate your session.`;
    } else {
      // 4th or more: TERMINATE
      tabSwitchStatus = 'TERMINATED';
      isTerminated = true;
      eventType = 'TAB_SWITCH_LIMIT_EXCEEDED';
      severity = 'CRITICAL';
      warningMessage = `Session terminated: Maximum tab-switch limit exceeded (${newCount}/${maxAllowed}).`;

      session.status = 'TERMINATED';
      session.terminationReason = 'Maximum tab-switch limit exceeded';
      session.terminatedAt = new Date();
      session.endTime = new Date();
      session.overallIntegrityScore = Math.max(0, (session.overallIntegrityScore || 100) - 50);
    }

    session.tabSwitchStatus = tabSwitchStatus;

    if (!session.tabSwitchEvents) session.tabSwitchEvents = [];
    const eventRecord = {
      timestamp: new Date(),
      episodeId: episodeId || `ep_${Date.now()}`,
      hiddenDuration: hiddenDuration || null,
      count: newCount,
      maxAllowed,
      severity,
      eventType,
      message: warningMessage,
    };
    session.tabSwitchEvents.push(eventRecord);

    if (!session.timeline) session.timeline = [];
    session.timeline.push({
      timestamp: new Date(),
      eventType,
      severity,
      evidence: warningMessage,
    });

    session.totalAlerts = (session.totalAlerts || 0) + 1;
    if (isTerminated) {
      session.criticalAlertsCount = (session.criticalAlertsCount || 0) + 1;
    }
    await session.save();

    // Resolve room owner and room
    const effectiveRoomId = session.roomId || reqRoomId || (sessionId.startsWith('TRV-') ? (sessionId.startsWith('TRV-TRV-') ? sessionId.split('-').slice(1, 3).join('-') : sessionId.split('-').slice(0, 2).join('-')) : null);

    let roomOwnerId = null;
    let roomDoc = null;
    if (effectiveRoomId) {
      try {
        roomDoc = await Room.findOne({
          $or: [
            { roomId: effectiveRoomId.toUpperCase() },
            { joinCode: effectiveRoomId.toUpperCase() }
          ]
        });
        if (roomDoc) {
          roomOwnerId = roomDoc.ownerId || roomDoc.createdBy || roomDoc.hostUserId || roomDoc.host?.id;

          // Update participant in room participants array
          if (roomDoc.participants) {
            const pIdx = roomDoc.participants.findIndex(p => p.sessionId === sessionId || p.id === session.userId || p.email === session.userEmail);
            if (pIdx >= 0) {
              roomDoc.participants[pIdx].tabSwitchCount = newCount;
              roomDoc.participants[pIdx].tabSwitchStatus = tabSwitchStatus;
              roomDoc.participants[pIdx].violations = (roomDoc.participants[pIdx].violations || 0) + 1;

              if (isTerminated) {
                roomDoc.participants[pIdx].status = 'TERMINATED';
                roomDoc.participants[pIdx].riskLevel = 'CRITICAL';
                roomDoc.participants[pIdx].riskScore = 100;
                roomDoc.participants[pIdx].terminationReason = 'TAB SWITCH LIMIT EXCEEDED';
              } else {
                roomDoc.participants[pIdx].riskScore = Math.min(100, (roomDoc.participants[pIdx].riskScore || 0) + 15);
                roomDoc.participants[pIdx].riskLevel = roomDoc.participants[pIdx].riskScore > 60 ? 'HIGH' : 'MEDIUM';
              }
              await roomDoc.save();
            }
          }
        }
      } catch (_) {}
    }

    // Create Alert record in MongoDB
    await Alert.create({
      sessionId,
      roomId: effectiveRoomId,
      hostId: roomOwnerId,
      studentId: session.userId,
      participantId: session.userId,
      userName: session.userName,
      userEmail: session.userEmail,
      type: eventType,
      eventType,
      severity,
      confidence: 1.0,
      evidence: warningMessage,
      description: warningMessage,
      status: 'OPEN',
      timestamp: new Date(),
    });

    // If terminated, create or update Report record
    if (isTerminated) {
      try {
        let report = await Report.findOne({ sessionId });
        const reportId = report?.reportId || `RPT-${Date.now().toString().slice(-6)}`;
        if (!report) {
          report = await Report.create({
            reportId,
            sessionId,
            roomId: effectiveRoomId,
            roomTitle: session.roomTitle,
            candidateId: session.userId,
            userName: session.userName,
            userEmail: session.userEmail,
            mode: session.mode || 'EXAM',
            sessionType: session.sessionType || 'EXAM',
            status: 'FLAGGED',
            verdict: 'TERMINATED',
            overallIntegrityScore: 40,
            riskLevel: 'CRITICAL',
            tabSwitches: newCount,
            maxTabSwitches: maxAllowed,
            terminated: true,
            terminationReason: 'Maximum tab-switch limit exceeded',
            tabSwitchTimeline: session.tabSwitchEvents,
            startTime: session.startTime,
            endTime: session.endTime,
          });
        } else {
          report.status = 'FLAGGED';
          report.verdict = 'TERMINATED';
          report.overallIntegrityScore = Math.min(report.overallIntegrityScore || 50, 40);
          report.riskLevel = 'CRITICAL';
          report.tabSwitches = newCount;
          report.maxTabSwitches = maxAllowed;
          report.terminated = true;
          report.terminationReason = 'Maximum tab-switch limit exceeded';
          report.tabSwitchTimeline = session.tabSwitchEvents;
          report.endTime = session.endTime;
          await report.save();
        }
      } catch (_) {}
    }

    // Real-time Socket.IO Broadcasts
    const io = req.app.get('io');
    if (io) {
      const payload = {
        type: eventType,
        eventType,
        severity,
        roomId: effectiveRoomId,
        sessionId,
        studentId: session.userId,
        candidateId: session.userId,
        studentName: session.userName,
        candidateName: session.userName,
        count: newCount,
        maxAllowed,
        tabSwitchCount: newCount,
        tabSwitchStatus,
        status: isTerminated ? 'TERMINATED' : 'WARNING',
        reason: isTerminated ? 'TAB SWITCH LIMIT EXCEEDED' : `Warning ${newCount}/${maxAllowed}`,
        message: warningMessage,
        description: warningMessage,
        evidence: warningMessage,
        timestamp: new Date().toISOString(),
      };

      // Candidate session channels
      io.to(`room_${sessionId}`).emit('TAB_SWITCH_EVENT', payload);
      io.to(`session:${sessionId}`).emit('TAB_SWITCH_EVENT', payload);
      io.to(`room_${sessionId}`).emit(eventType, payload);
      io.to(`session:${sessionId}`).emit(eventType, payload);
      if (isTerminated) {
        io.to(`room_${sessionId}`).emit('SESSION_TERMINATED', payload);
        io.to(`session:${sessionId}`).emit('SESSION_TERMINATED', payload);
      }

      // Room and host channels
      if (effectiveRoomId) {
        io.to(`proctor:${effectiveRoomId}`).emit('TAB_SWITCH_EVENT', payload);
        io.to(`proctor:${effectiveRoomId}`).emit(eventType, payload);
        io.to(`proctor:${effectiveRoomId}`).emit('proctor_alert', payload);
        io.to(`proctor:${effectiveRoomId}`).emit('AI_ALERT_CREATED', payload);
        io.to(`room_${effectiveRoomId}`).emit('proctor_alert', payload);
        io.to(`room_${effectiveRoomId}`).emit('AI_ALERT_CREATED', payload);
        io.to(`proctor:${effectiveRoomId}`).emit('participant_risk_updated', {
          roomId: effectiveRoomId,
          sessionId,
          candidateId: session.userId,
          candidateName: session.userName,
          tabSwitchCount: newCount,
          tabSwitchStatus,
          status: isTerminated ? 'TERMINATED' : 'MONITORING',
          riskLevel: isTerminated ? 'CRITICAL' : 'HIGH',
          riskScore: isTerminated ? 100 : (session.peakRiskScore || 40),
          violations: session.totalAlerts,
        });

        if (isTerminated) {
          io.to(`proctor:${effectiveRoomId}`).emit('SESSION_TERMINATED', payload);
          io.to(`room_${effectiveRoomId}`).emit('SESSION_TERMINATED', payload);
        }

        // Direct notification to Room Owner's personal channel
        if (roomOwnerId) {
          io.to(`user:${roomOwnerId}`).emit('TAB_SWITCH_EVENT', payload);
          io.to(`user:${roomOwnerId}`).emit(eventType, payload);
          io.to(`user:${roomOwnerId}`).emit('proctor_alert', payload);
          io.to(`user:${roomOwnerId}`).emit('AI_ALERT_CREATED', payload);
          io.to(`user:${roomOwnerId}`).emit('participant_risk_updated', {
            roomId: effectiveRoomId,
            sessionId,
            candidateId: session.userId,
            candidateName: session.userName,
            tabSwitchCount: newCount,
            tabSwitchStatus,
            status: isTerminated ? 'TERMINATED' : 'MONITORING',
            riskLevel: isTerminated ? 'CRITICAL' : 'HIGH',
            riskScore: isTerminated ? 100 : (session.peakRiskScore || 40),
            violations: session.totalAlerts,
          });
        }
      }
    }

    res.json({
      success: true,
      sessionId,
      count: newCount,
      maxAllowed,
      tabSwitchStatus,
      terminated: isTerminated,
      message: warningMessage,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Authoritatively reset tab switch counters and restore session from false termination
// @route   POST /api/ai-engine/sessions/:sessionId/reset-tab-switches
// @access  Public / Private
const resetTabSwitches = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { roomId: reqRoomId } = req.body || {};

    let session = await Session.findOne({ sessionId });
    if (!session) {
      session = await Session.findOne({ sessionId: { $regex: `^${sessionId}$`, $options: 'i' } });
    }
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    const maxAllowed = session.maxTabSwitches || 3;
    session.tabSwitchCount = 0;
    session.tabSwitchStatus = 'NORMAL';
    session.tabSwitchEvents = [];

    // If session was terminated specifically due to tab switches, restore to ACTIVE
    if (session.status === 'TERMINATED' && (
      !session.terminationReason ||
      session.terminationReason.toLowerCase().includes('tab-switch') ||
      session.terminationReason.toLowerCase().includes('tab switch')
    )) {
      session.status = 'ACTIVE';
      session.terminationReason = null;
      session.terminatedAt = null;
    }

    await session.save();

    // Also update Room participant if present
    const effectiveRoomId = session.roomId || reqRoomId;
    let roomOwnerId = null;
    if (effectiveRoomId) {
      try {
        const roomDoc = await Room.findOne({
          $or: [
            { roomId: effectiveRoomId.toUpperCase() },
            { joinCode: effectiveRoomId.toUpperCase() }
          ]
        });
        if (roomDoc) {
          roomOwnerId = roomDoc.ownerId || roomDoc.createdBy || roomDoc.hostUserId || roomDoc.host?.id;
          if (roomDoc.participants) {
            const pIdx = roomDoc.participants.findIndex(p => p.sessionId === sessionId || p.id === session.userId || p.email === session.userEmail);
            if (pIdx >= 0) {
              roomDoc.participants[pIdx].tabSwitchCount = 0;
              roomDoc.participants[pIdx].tabSwitchStatus = 'NORMAL';
              if (roomDoc.participants[pIdx].status === 'TERMINATED' && roomDoc.participants[pIdx].terminationReason?.includes('TAB SWITCH')) {
                roomDoc.participants[pIdx].status = 'ACTIVE';
                roomDoc.participants[pIdx].terminationReason = null;
                roomDoc.participants[pIdx].riskLevel = 'LOW';
                roomDoc.participants[pIdx].riskScore = 15;
              }
              await roomDoc.save();
            }
          }
        }
      } catch (_) {}
    }

    // Socket.io broadcast of reset
    const io = req.app.get('io');
    if (io) {
      const payload = {
        type: 'TAB_SWITCH_RESET',
        eventType: 'TAB_SWITCH_RESET',
        sessionId,
        roomId: effectiveRoomId,
        count: 0,
        tabSwitchCount: 0,
        tabSwitchStatus: 'NORMAL',
        maxAllowed,
        terminated: false,
        timestamp: new Date().toISOString()
      };
      io.to(`room_${sessionId}`).emit('TAB_SWITCH_RESET', payload);
      io.to(`session:${sessionId}`).emit('TAB_SWITCH_RESET', payload);
      if (effectiveRoomId) {
        io.to(`proctor:${effectiveRoomId}`).emit('TAB_SWITCH_RESET', payload);
        io.to(`room_${effectiveRoomId}`).emit('TAB_SWITCH_RESET', payload);
        if (roomOwnerId) {
          io.to(`user:${roomOwnerId}`).emit('TAB_SWITCH_RESET', payload);
        }
      }
    }

    return res.json({
      success: true,
      sessionId,
      count: 0,
      maxAllowed,
      tabSwitchStatus: 'NORMAL',
      terminated: false,
      message: 'Tab switch count reset to 0/3 successfully.'
    });
  } catch (err) {
    console.error('[unifiedController] resetTabSwitches error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = {
  logUnifiedEvent,
  getDashboardStats,
  getAlerts,
  getSessions,
  getSessionById,
  uploadSessionRecording,
  startSession,
  endSession,
  recordTabSwitch,
  resetTabSwitches,
};
