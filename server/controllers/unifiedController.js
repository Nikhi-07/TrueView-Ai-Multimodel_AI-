const Session = require('../models/Session');
const Alert = require('../models/Alert');
const Report = require('../models/Report');

// @desc    Log unified TrueView AI Engine monitoring events into MongoDB
// @route   POST /api/ai-engine/log
// @access  Public / Private
const logUnifiedEvent = async (req, res, next) => {
  try {
    const {
      session_id,
      user_id = 'candidate_01',
      session_type = 'EXAM',
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

    // Find or create session record
    let session = await Session.findOne({ sessionId: session_id });
    if (!session) {
      session = await Session.create({
        sessionId: session_id,
        userId: user_id,
        userName: req.user?.fullName || 'Student Candidate',
        userEmail: req.user?.email || 'student@trueview.ai',
        mode: session_type,
        status: 'ACTIVE',
        startTime: new Date(),
        peakRiskScore: currentRiskScore,
      });
    } else {
      if (currentRiskScore > session.peakRiskScore) {
        session.peakRiskScore = currentRiskScore;
      }
      if (environment?.phone_detected) {
        session.phoneDetections += 1;
      }
      if (attention?.status === 'DISTRACTED') {
        session.distractionCount += 1;
      }
      await session.save();
    }

    // Record alerts if events present
    if (behaviour?.events && Array.isArray(behaviour.events)) {
      for (const evt of behaviour.events) {
        const severity = evt.severity === 'CRITICAL' ? 'danger' : evt.severity === 'HIGH' ? 'warning' : 'info';
        
        await Alert.create({
          sessionId: session_id,
          userName: session.userName,
          userEmail: session.userEmail,
          type: evt.type,
          severity: severity,
          evidence: evt.evidence || `Event triggered: ${evt.type}`,
          timestamp: new Date(),
        });

        session.totalAlerts += 1;
        await session.save();
      }
    }

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
    let query = {};
    if (req.user && req.user.role !== 'admin') {
      query.userEmail = req.user.email;
    }

    const activeSessionsCount = await Session.countDocuments({ ...query, status: 'ACTIVE' });
    const totalSessionsCount = await Session.countDocuments(query);
    const totalAlertsCount = await Alert.countDocuments(query);
    const phoneDetectionsCount = await Session.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: '$phoneDetections' } } }
    ]);

    const totalPhoneViolations = phoneDetectionsCount[0]?.total || 0;

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
        activeSessions: activeSessionsCount || 0,
        usersOnline: activeSessionsCount + 1,
        todaysAlerts: totalAlertsCount,
        totalViolations: totalPhoneViolations,
        systemHealth: 100,
      },
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

module.exports = {
  logUnifiedEvent,
  getDashboardStats,
  getAlerts,
};
