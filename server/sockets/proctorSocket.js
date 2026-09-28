// sockets/proctorSocket.js
// TrueView AI – Real-time Virtual Proctor Room Socket Handler
//
// Security model:
//  - Session state is backend-authoritative (kept in memory; persisted to Mongo best-effort).
//  - Reviewer commands are only accepted from sockets whose role is reviewer/admin/host.
//  - Alert severity is computed SERVER-SIDE from the event type + session policy.
//    Severity values sent by clients are never trusted.
//  - FAIL CLOSED: if required AI monitoring is unavailable in EXAM mode, the session is suspended.
//  - WebRTC signaling is relayed ONLY between authorized reviewer (admin) sockets and
//    participant sockets in the same room. Participants can never receive another
//    participant's media and can never issue reviewer control commands.

const jwt = require('jsonwebtoken');
const Session = require('../models/Session');
const Alert = require('../models/Alert');
const Report = require('../models/Report');
const User = require('../models/User');
const Room = require('../models/Room');
const { POLICY_THRESHOLDS, evaluateEventSeverity } = require('../utils/sessionPolicies');

const activeSessions = new Map();

// Default durations (seconds) per session mode when the reviewer does not specify one.
const DEFAULT_SESSION_DURATION = {
  EXAM: 60 * 60,      // 60 minutes
  INTERVIEW: 30 * 60, // 30 minutes
  CLASS: 60 * 60,
  MEETING: 60 * 60,
};

// Timer warning thresholds (minutes remaining) – configurable via env.
const TIMER_WARNINGS_MIN = (process.env.TIMER_WARNING_MINUTES || '10,5,1')
  .split(',')
  .map((n) => parseInt(n, 10))
  .filter((n) => Number.isFinite(n))
  .sort((a, b) => a - b);

// Reviewer authority is determined SERVER-SIDE from the authenticated JWT (role === 'admin').
// The client-supplied role in join_room is only used for display purposes.
const canControlSession = (socket) => Boolean(socket.authUser && socket.authUser.role === 'admin');

const VALID_EVENT_TYPES = new Set([
  'CAMERA_INTERRUPTED', 'MICROPHONE_INTERRUPTED', 'MULTIPLE_FACES_DETECTED', 'MULTIPLE_PERSONS',
  'MULTIPLE_PEOPLE_DETECTED', 'PHONE_DETECTED', 'MOBILE_PHONE_DETECTED', 'UNAUTHORIZED_OBJECT',
  'IDENTITY_MISMATCH', 'POSSIBLE_USER_REPLACEMENT', 'UNKNOWN_SPEAKER', 'MULTIPLE_SPEAKERS',
  'GAZE_DEVIATION', 'LOOKING_AWAY', 'OFFSCREEN_GLANCE', 'REPEATED_DISTRACTION', 'PROLONGED_DISTRACTION',
  'EYES_CLOSED', 'HEAD_TURNED', 'HEAD_MOVEMENT',
  'USER_ABSENT', 'NO_FACE_DETECTED', 'VOICE_DETECTED', 'SPEECH_DETECTED',
  'REGISTERED_SPEAKER', 'NO_VOICE', 'HIGH_BACKGROUND_NOISE', 'VOICE_INTERRUPTED', 'LOW_LIGHT',
  'BLURRY_FRAME', 'CRITICAL_RISK_THRESHOLD', 'AI_ENGINE_OFFLINE', 'MONITORING_THRESHOLD_EXCEEDED',
  'LIVENESS_FAILED', 'ACTIVE_CHALLENGE_FAILED', 'SESSION_STARTED', 'PARTICIPANT_JOINED', 'PARTICIPANT_LEFT',
  'SPEECH_CONTENT_EVENT', 'WEBRTC_CONNECTION_OPEN', 'WEBRTC_CONNECTION_CLOSED',
  // Event lifecycle (DETECTED -> CLEARED) types emitted by the AI engine
  'PHONE_CLEARED', 'MULTIPLE_PERSONS_CLEARED', 'FACE_PRESENT', 'GAZE_CLEARED', 'SPEECH_STOPPED',
  'EYES_OPEN', 'HEAD_POSITION_NORMAL', 'LIVENESS_CONFIRMED',
  'SPOOF_DETECTED', 'SPEAKING_DETECTED',
]);

// ── Real-time event lifecycle & priority (Section 10/11/19 of the real-time spec) ──
// Events with persistent physical state are deduplicated: the FIRST qualified
// detection creates the alert immediately, repeat detections are suppressed
// (never delaying or duplicating), and a CLEARED event closes the lifecycle.
// One-shot/informational events (joins, voice registration, WebRTC) always emit.
const LIFECYCLE_EVENTS = new Map([
  ['PHONE_DETECTED', 'phone'], ['MOBILE_PHONE_DETECTED', 'phone'], ['PHONE_CLEARED', 'phone'],
  ['MULTIPLE_FACES_DETECTED', 'multiple_faces'], ['MULTIPLE_PERSONS', 'multiple_faces'], ['MULTIPLE_PEOPLE_DETECTED', 'multiple_faces'], ['MULTIPLE_PERSONS_CLEARED', 'multiple_faces'],
  ['NO_FACE_DETECTED', 'no_face'], ['USER_ABSENT', 'no_face'], ['FACE_PRESENT', 'no_face'],
  ['GAZE_DEVIATION', 'gaze'], ['LOOKING_AWAY', 'gaze'], ['PROLONGED_DISTRACTION', 'gaze'],
  ['REPEATED_DISTRACTION', 'gaze'], ['OFFSCREEN_GLANCE', 'gaze'], ['GAZE_CLEARED', 'gaze'],
  ['EYES_CLOSED', 'eyes'], ['EYES_OPEN', 'eyes'],
  ['HEAD_TURNED', 'head_pose'], ['HEAD_MOVEMENT', 'head_pose'], ['HEAD_POSITION_NORMAL', 'head_pose'],
  ['SPEECH_DETECTED', 'speaking'], ['SPEAKING_DETECTED', 'speaking'], ['VOICE_DETECTED', 'speaking'], ['SPEECH_STOPPED', 'speaking'],
  ['UNAUTHORIZED_OBJECT', 'object'],
  ['LIVENESS_FAILED', 'liveness'], ['ACTIVE_CHALLENGE_FAILED', 'liveness'], ['SPOOF_DETECTED', 'liveness'], ['LIVENESS_CONFIRMED', 'liveness'],
  ['IDENTITY_MISMATCH', 'identity'], ['POSSIBLE_USER_REPLACEMENT', 'identity'],
  ['UNKNOWN_SPEAKER', 'speaker'], ['MULTIPLE_SPEAKERS', 'speaker'],
]);
const CLEAR_EVENTS = new Set([
  'PHONE_CLEARED', 'MULTIPLE_PERSONS_CLEARED', 'FACE_PRESENT', 'GAZE_CLEARED', 'SPEECH_STOPPED',
  'EYES_OPEN', 'HEAD_POSITION_NORMAL', 'LIVENESS_CONFIRMED'
]);

// Priority classes: P0 (critical) through P3 (low). Used by the frontend to order
// the live alert stack; critical events always surface first.
const SEVERITY_PRIORITY = { CRITICAL: 'P0', HIGH: 'P1', MEDIUM: 'P2', LOW: 'P3', INFO: 'P3' };

// Duplicate-detection TTL: if a lifecycle state stays DETECTED without a CLEARED
// event (module without an explicit clear signal), it expires so a later detection
// can alert again. Safety valve only — the AI engine emits CLEARED transitions.
const LIFECYCLE_TTL_MS = 20 * 1000;
// Client capture timestamps older than this when they reach the server are flagged
// STALE so a backed-up AI queue can never masquerade as a fresh real-time alert.
const STALE_EVENT_THRESHOLD_MS = 2500;

function eventLifecycleKey(eventType) {
  return LIFECYCLE_EVENTS.get(String(eventType || '').toUpperCase()) || null;
}

function isClearEvent(eventType) {
  return CLEAR_EVENTS.has(String(eventType || '').toUpperCase());
}

// Standard meta for every alert so the performance panel can measure the full
// event -> server -> socket -> UI path (Section 3 of the real-time spec).
function buildAlertMeta(captureTimestamp) {
  const now = Date.now();
  return {
    priority: 'P3', // replaced by caller with severity-derived priority
    serverReceivedTimestamp: now,
    alertCreatedTimestamp: now,
    socketEmittedTimestamp: now,
    stale: Number.isFinite(captureTimestamp) && now - captureTimestamp > STALE_EVENT_THRESHOLD_MS,
  };
}

function getOrCreateSessionState(sessionId, initialMode = 'EXAM', sessionDurationSeconds) {
  if (!activeSessions.has(sessionId)) {
    const mode = (initialMode || 'EXAM').toUpperCase();
    const thresholds = POLICY_THRESHOLDS[mode] || POLICY_THRESHOLDS.EXAM;
    const duration = Number(sessionDurationSeconds) > 0
      ? Math.round(Number(sessionDurationSeconds))
      : (DEFAULT_SESSION_DURATION[mode] || 3600);
    activeSessions.set(sessionId, {
      sessionId,
      sessionType: mode,
      mode,
      status: 'READY', // WAITING, DEVICE_CHECK, READY, LIVE, WARNING, SUSPENDING, SUSPENDED, RESUMING, COMPLETED, EXITED, FAILED
      cameraStatus: 'ACTIVE',
      microphoneStatus: 'ACTIVE',
      trustScore: 100,
      alertCount: 0,
      criticalAlertCount: 0,
      suspensionReason: null,
      suspensionCount: 0,
      warningLimit: thresholds.warningLimit,
      criticalLimit: thresholds.criticalLimit,
      suspensionLimit: thresholds.suspensionLimit,
      sessionDuration: duration,          // seconds (server-authoritative)
      startedAt: null,
      endedAt: null,
      endTime: null,                      // absolute server timestamp (ms)
      completedByTimer: false,
      participants: [],
      alerts: [],
      aiEngineOnline: true,
    });
  }
  return activeSessions.get(sessionId);
}

// ── Best-effort Mongo persistence ──────────────────────────────────
async function persistSession(session) {
  try {
    const candidateParticipant = session.participants?.find((p) => p.role === 'participant') || session.participants?.[0];
    const updateData = {
      sessionId: session.sessionId,
      mode: session.sessionType,
      sessionType: session.sessionType,
      status: session.status,
      cameraStatus: session.cameraStatus,
      microphoneStatus: session.microphoneStatus,
      trustScore: session.trustScore,
      warningLimit: session.warningLimit,
      criticalLimit: session.criticalLimit,
      suspensionLimit: session.suspensionLimit,
      suspensionReason: session.suspensionReason,
      startTime: session.startedAt || new Date(),
      endTime: session.endedAt,
      totalAlerts: session.alertCount,
      criticalAlertsCount: session.criticalAlertCount,
    };
    if (session.roomId) updateData.roomId = session.roomId;
    if (session.roomTitle) updateData.roomTitle = session.roomTitle;
    if (session.userId || candidateParticipant?.id) {
      updateData.userId = session.userId || candidateParticipant.id;
    }
    if (session.userName || candidateParticipant?.name) {
      updateData.userName = session.userName || candidateParticipant.name;
    }
    if (session.userEmail || candidateParticipant?.email) {
      updateData.userEmail = session.userEmail || candidateParticipant.email;
    }

    await Session.findOneAndUpdate(
      { sessionId: session.sessionId },
      { $set: updateData },
      { upsert: true, setDefaultsOnInsert: true }
    );
  } catch (e) {
    // DB offline / resilient mode – in-memory state remains authoritative.
  }
}

async function persistAlert(alert) {
  try {
    // The Alert schema requires `type`; socket events carry `eventType`.
    // Normalize here so every socket-generated alert is persisted (and shows
    // up in the final report timeline).
    await Alert.create({ ...alert, type: alert.eventType || alert.type || 'AI_EVENT' });
  } catch (e) {
    // ignore persistence failures
  }
}

// Auto-generate a professional session report when a session completes.
// Uses evidence-based wording (no automatic accusations).
async function generateSessionReport(session, opts = {}) {
  // Alerts from Mongo when available; fall back to the authoritative in-memory
  // history so a transient DB blip never silently drops the report timeline.
  let alerts = session.alerts || [];
  try {
    const persisted = await Alert.find({ sessionId: session.sessionId });
    if (persisted && persisted.length) alerts = persisted;
  } catch (e) {
    // DB unavailable -> in-memory session.alerts (already capped) are used.
  }
  try {

    const count = (eventTypes) => alerts.filter((a) => (eventTypes || []).includes(a.eventType)).length;

    const phoneDetections = count(['PHONE_DETECTED', 'UNAUTHORIZED_OBJECT']);
    const cameraInterruptions = count(['CAMERA_INTERRUPTED']);
    const microphoneInterruptions = count(['MICROPHONE_INTERRUPTED']);
    const multipleSpeakerEvents = count(['MULTIPLE_SPEAKERS', 'UNKNOWN_SPEAKER']);
    const speechEvents = count(['SPEECH_CONTENT_EVENT', 'SPEECH_DETECTED', 'VOICE_DETECTED']);
    const livenessFailures = count(['LIVENESS_FAILED', 'ACTIVE_CHALLENGE_FAILED', 'SPOOF_ATTACK']);
    const objectDetections = phoneDetections;
    const gazeEvents = count(['GAZE_DEVIATION', 'LOOKING_AWAY', 'OFFSCREEN_GLANCE', 'REPEATED_DISTRACTION', 'PROLONGED_DISTRACTION']);
    const behaviourAlerts = count(['USER_ABSENT', 'NO_FACE_DETECTED', 'MULTIPLE_FACES_DETECTED', 'MULTIPLE_PERSONS']);
    const suspensionEvents = session.suspensionCount || 0;
    const webRtcConnections = count(['WEBRTC_CONNECTION_OPEN']);
    const webRtcDisconnects = count(['WEBRTC_CONNECTION_CLOSED']);

    // Face/identity verification status summary (no automatic accusations).
    // Driven by FACE/IDENTITY signals only (REGISTERED_SPEAKER is a voice event).
    const identityRiskEvents = ['IDENTITY_MISMATCH', 'LIVENESS_FAILED', 'ACTIVE_CHALLENGE_FAILED',
      'SPOOF_ATTACK', 'MULTIPLE_FACES_DETECTED', 'NO_FACE_DETECTED', 'MULTIPLE_PERSONS'];
    const faceVerified = !alerts.some((a) => identityRiskEvents.includes(a.eventType));
    const livenessPassed = livenessFailures === 0;

    const totalViolations = alerts.filter((a) => ['HIGH', 'CRITICAL', 'MEDIUM'].includes(a.severity)).length;

    let score = 100 - phoneDetections * 25 - totalViolations * 5 - (suspensionEvents ? 15 * suspensionEvents : 0);
    score = Math.max(0, Math.min(100, Math.round(score)));

    const status = score < 60 ? 'FLAGGED' : score < 85 ? 'REVIEW_REQUIRED' : 'PASSED';
    const riskLevel = score < 60 ? 'HIGH_RISK' : score < 85 ? 'MEDIUM_RISK' : 'NORMAL';
    const durationSeconds =
      session.startedAt && session.endedAt
        ? Math.max(0, Math.round((new Date(session.endedAt) - new Date(session.startedAt)) / 1000))
        : 0;

    const timeline = alerts
      .slice()
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map((a) => ({
        timestamp: a.timestamp,
        eventType: a.eventType,
        severity: a.severity,
        description: a.description || a.evidence || '',
        confidence: a.confidence,
      }));

    const candidateParticipant = session.participants?.find((p) => p.role === 'participant') || session.participants?.[0];
    const candidateName = session.userName || candidateParticipant?.name || 'Participant';
    const candidateEmail = session.userEmail || candidateParticipant?.email || '';
    const candidateId = session.userId || candidateParticipant?.id || null;
    const effectiveRoomId = session.roomId || (session.sessionId?.startsWith('TRV-') ? (session.sessionId.startsWith('TRV-TRV-') ? session.sessionId.split('-').slice(1, 3).join('-') : session.sessionId.split('-').slice(0, 2).join('-')) : null);

    const payload = {
      reportId: `RPT-${Date.now().toString().slice(-6)}`,
      sessionId: session.sessionId,
      roomId: effectiveRoomId,
      roomTitle: session.roomTitle || null,
      candidateId,
      userName: candidateName,
      userEmail: candidateEmail,
      sessionType: session.sessionType || 'EXAM',
      mode: session.sessionType || 'EXAM',
      durationSeconds,
      startTime: session.startedAt,
      endTime: session.endedAt,
      completedByTimer: Boolean(opts.completedByTimer || session.completedByTimer),
      overallIntegrityScore: score,
      riskLevel,
      totalViolations,
      phoneDetections,
      cameraInterruptions,
      microphoneInterruptions,
      multipleSpeakerEvents,
      speechEvents,
      livenessFailures,
      objectDetections,
      gazeEvents,
      behaviourAlerts,
      suspensionEvents,
      webRtcConnections,
      webRtcDisconnects,
      faceVerified,
      livenessPassed,
      alerts: alerts.map((a) => ({
        eventType: a.eventType || a.type,
        severity: a.severity,
        evidence: a.evidence,
        timestamp: a.timestamp,
      })),
      timeline,
      status,
    };

    // Retry the write a few times so transient DB blips don't lose the report.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await Report.findOneAndUpdate({ sessionId: session.sessionId }, payload, { upsert: true });
        return;
      } catch (e) {
        console.error(`[Report] write attempt ${attempt + 1} failed for ${session.sessionId}: ${e.message}`);
        if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  } catch (e) {
    // best-effort report generation (DB may be offline)
  }
}

function makeEventId() {
  return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
}

function initProctorSocket(io) {
  // ── Socket authentication (JWT handshake) ──
  // Prevents clients from spoofing the reviewer role: reviewer controls are only
  // granted to authenticated users whose DB role is 'admin'.
  io.use(async (socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Reject pending/biometric-incomplete tokens
        if (!decoded.pendingFace && !decoded.pendingVoice && !decoded.faceLoginChallenge && !decoded.voiceLoginChallenge && decoded.id) {
          const user = await User.findById(decoded.id).select('fullName email role');
          if (user) {
            socket.authUser = { id: String(user._id), name: user.fullName, email: user.email, role: user.role };
          }
        }
      } catch (e) {
        // unauthenticated socket proceeds as participant (join_room without token)
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    console.log(`[ProctorSocket] Client connected: ${socket.id}`);

    if (socket.authUser && socket.authUser.id) {
      socket.join(`user:${socket.authUser.id}`);
      console.log(`[ProctorSocket] Socket ${socket.id} joined personal room user:${socket.authUser.id}`);
    }

    socket.on('subscribe_user_dashboard', ({ userId }) => {
      const effectiveId = socket.authUser ? socket.authUser.id : (userId ? String(userId) : null);
      if (effectiveId) {
        socket.join(`user:${effectiveId}`);
        console.log(`[ProctorSocket] Socket ${socket.id} subscribed to user:${effectiveId}`);
      }
    });

    // Join Proctor Room
    socket.on('join_room', ({ sessionId, roomId, role, user, sessionType, sessionDuration }) => {
      const extractedRoomId = roomId || (sessionId && sessionId.startsWith('TRV-') ? sessionId.split('-').slice(0, 2).join('-') : null);
      const effectiveRoomId = extractedRoomId || roomId;
      const roomName = `room_${sessionId}`;
      socket.join(roomName);
      socket.join(`session:${sessionId}`);
      socket.sessionId = sessionId;
      if (effectiveRoomId) {
        socket.roomId = effectiveRoomId;
        socket.join(`proctor:${effectiveRoomId}`);
        socket.join(`room:proctor:${effectiveRoomId}`);
        socket.join(`room_${effectiveRoomId}`);
      }

      // Display role from client; AUTHORITATIVE role comes from the JWT (socket.authUser)
      socket.role = socket.authUser && socket.authUser.role === 'admin' ? 'reviewer' : (role === 'reviewer' || role === 'host' ? role : 'participant');
      const displayUser = user || (socket.authUser ? { id: socket.authUser.id, name: socket.authUser.name, role: socket.authUser.role } : null);

      const sessionState = getOrCreateSessionState(sessionId, sessionType, sessionDuration);
      if (effectiveRoomId && !sessionState.roomId) {
        sessionState.roomId = effectiveRoomId;
      }

      if (displayUser && !sessionState.participants.some((p) => p.id === displayUser.id || p.id === socket.id)) {
        sessionState.participants.push({
          socketId: socket.id,
          id: displayUser.id || socket.id,
          name: displayUser.name || (socket.role === 'reviewer' || socket.role === 'host' ? 'Reviewer / Host' : 'Participant'),
          email: displayUser.email || '',
          role: socket.role,
          joinedAt: new Date().toISOString(),
        });

        // Inform the room a participant joined (evidence-based, not accusatory)
        if (socket.role === 'participant') {
          sessionState.userId = displayUser.id || socket.id;
          sessionState.userName = displayUser.name || 'Participant';
          sessionState.userEmail = displayUser.email || '';
          persistSession(sessionState);
          const joinAlert = {
            eventId: makeEventId(),
            sessionId,
            roomId: effectiveRoomId,
            participantId: displayUser.id || socket.id,
            candidateName: displayUser.name || 'Participant',
            timestamp: new Date().toISOString(),
            eventType: 'PARTICIPANT_JOINED',
            severity: 'INFO',
            confidence: 1.0,
            description: `${displayUser.name || 'Participant'} joined the monitored session.`,
            status: 'OPEN',
            state: 'DETECTED',
            ...buildAlertMeta(),
            priority: 'P3',
          };
          sessionState.alerts.unshift(joinAlert);
          if (sessionState.alerts.length > 200) sessionState.alerts.pop();
          sessionState.alertCount += 1;
          persistAlert(joinAlert);
          io.to(roomName).emit('AI_EVENT', joinAlert);
          io.to(`session:${sessionId}`).emit('AI_EVENT', joinAlert);
          if (effectiveRoomId) {
            io.to(`proctor:${effectiveRoomId}`).emit('proctor_alert', joinAlert);
            io.to(`proctor:${effectiveRoomId}`).emit('participant_joined', {
              roomId: effectiveRoomId,
              sessionId,
              candidate: { id: displayUser.id || socket.id, name: displayUser.name || 'Participant', email: displayUser.email || '' },
              participantsCount: sessionState.participants.length,
              participants: sessionState.participants,
            });
            io.to(`room_${effectiveRoomId}`).emit('room_participants_updated', {
              participantsCount: sessionState.participants.length,
              participants: sessionState.participants,
            });
          }
        }
      }

      console.log(`[ProctorSocket] ${socket.role} (${socket.id}) joined ${roomName} & proctor:${effectiveRoomId} (mode=${sessionState.sessionType})`);

      // Emit current state + server time sync (browser clocks are never trusted).
      const { eventStates, _lastPersist, ...publicSessionState } = sessionState;
      socket.emit('session_state', { ...publicSessionState, serverNow: Date.now() });
      socket.emit('SESSION_TIMER_SYNC', {
        serverNow: Date.now(),
        startedAt: sessionState.startedAt,
        endTime: sessionState.endTime,
        sessionDuration: sessionState.sessionDuration,
        status: sessionState.status,
      });

      // Notify room
      io.to(roomName).emit('room_participants_updated', {
        participantsCount: sessionState.participants.length,
        participants: sessionState.participants,
      });
      if (effectiveRoomId) {
        io.to(`proctor:${effectiveRoomId}`).emit('room_participants_updated', {
          participantsCount: sessionState.participants.length,
          participants: sessionState.participants,
        });
      }
    });

    // Start Session — SERVER-AUTHORITATIVE: only reviewers (authenticated admins)
    // may start the session timer. A participant socket can never do so.
    socket.on('start_session', ({ sessionId, sessionDuration }) => {
      if (!canControlSession(socket)) {
        console.warn(`[ProctorSocket] BLOCKED start_session from non-admin socket ${socket.id}`);
        return;
      }
      const session = getOrCreateSessionState(sessionId, undefined, sessionDuration);
      // The reviewer's configured duration is authoritative: if provided, update
      // the in-memory session state BEFORE computing endTime (the session may
      // already exist from join_room with the mode default).
      if (Number(sessionDuration) > 0) {
        session.sessionDuration = Math.round(Number(sessionDuration));
      }
      session.status = 'LIVE';
      if (!session.startedAt) {
        session.startedAt = new Date().toISOString();
        // Server-authoritative end time = server start time + configured duration
        session.endTime = Date.now() + session.sessionDuration * 1000;
        session.endedAt = null;
        session.completedByTimer = false;
      }
      persistSession(session);

      io.to(`room_${sessionId}`).emit('SESSION_STARTED', { session });
      io.to(`room_${sessionId}`).emit('SESSION_STATE_CHANGED', { status: 'LIVE', session });
      io.to(`room_${sessionId}`).emit('SESSION_TIMER_SYNC', {
        serverNow: Date.now(),
        startedAt: session.startedAt,
        endTime: session.endTime,
        sessionDuration: session.sessionDuration,
        status: session.status,
      });
    });

    // Device / Media Track Status Update
    socket.on('update_media_status', ({ sessionId, deviceType, status, reason }) => {
      // Only sockets that actually joined THIS room may report its device state.
      if (!sessionId || socket.sessionId !== sessionId) {
        console.warn(`[ProctorSocket] BLOCKED update_media_status from unjoined socket ${socket.id}`);
        return;
      }
      const session = getOrCreateSessionState(sessionId);

      if (deviceType === 'camera') session.cameraStatus = status;
      else if (deviceType === 'microphone') session.microphoneStatus = status;

      const roomName = `room_${sessionId}`;
      io.to(roomName).emit('MEDIA_STATUS_CHANGED', {
        deviceType,
        status,
        cameraStatus: session.cameraStatus,
        microphoneStatus: session.microphoneStatus,
        reason,
        timestamp: new Date().toISOString(),
      });

      // EXAM mode: immediate suspension on required device interruption
      if (session.sessionType === 'EXAM' && status === 'INTERRUPTED') {
        const violationType = deviceType === 'camera' ? 'CAMERA_INTERRUPTED' : 'MICROPHONE_INTERRUPTED';
        session.status = 'SUSPENDED';
        session.suspensionReason = violationType;
        session.suspensionCount += 1;

        const criticalAlert = {
          eventId: makeEventId(),
          sessionId,
          participantId: socket.id,
          timestamp: new Date().toISOString(),
          eventType: violationType,
          severity: 'CRITICAL',
          confidence: 1.0,
          description: `Required ${deviceType} monitoring stream was unexpectedly interrupted during strict EXAM session.`,
          status: 'OPEN',
          state: 'DETECTED',
          ...buildAlertMeta(),
          priority: 'P0', // must come AFTER the spread so it is not overwritten
        };

        session.alerts.unshift(criticalAlert);
        session.criticalAlertCount += 1;
        session.trustScore = Math.max(0, session.trustScore - 40);
        persistSession(session);
        persistAlert(criticalAlert);

        io.to(roomName).emit('AI_EVENT', criticalAlert);
        io.to(roomName).emit('ALERT_CREATED', criticalAlert);
        io.to(roomName).emit('SESSION_SUSPENDED', {
          session,
          reason: violationType,
          message: `Session suspended: ${deviceType.toUpperCase()} monitoring was interrupted.`,
        });
        io.to(roomName).emit('SESSION_STATE_CHANGED', { status: 'SUSPENDED', session });
      }
    });

    socket.on('join-session', ({ sessionId, roomId }) => {
      const targetSessionId = sessionId || socket.sessionId;
      if (targetSessionId) {
        socket.join(`room_${targetSessionId}`);
        socket.join(`session:${targetSessionId}`);
        socket.sessionId = targetSessionId;
        console.log(`[ProctorSocket] Client ${socket.id} joined session:${targetSessionId}`);
      }
    });
    socket.on('join_session', ({ sessionId, roomId }) => {
      const targetSessionId = sessionId || socket.sessionId;
      if (targetSessionId) {
        socket.join(`room_${targetSessionId}`);
        socket.join(`session:${targetSessionId}`);
        socket.sessionId = targetSessionId;
        console.log(`[ProctorSocket] Client ${socket.id} joined session:${targetSessionId}`);
      }
    });

    // AI Event Received – severity is recomputed server-side
    const handleAiEvent = (eventData) => {
      if (!eventData || typeof eventData !== 'object') return;
      const {
        sessionId: rawSessionId,
        eventType,
        type,
        confidence = 0.85,
        description,
        message,
        evidence,
        captureTimestamp,
        state,
        category,
        source,
        metadata
      } = eventData;

      const sessionId = rawSessionId || socket.sessionId;
      // Only sockets that joined THIS room may inject events into it (prevents
      // cross-session alert pollution from arbitrary sockets).
      if (!sessionId || socket.sessionId !== sessionId) {
        console.warn(`[ProctorSocket] BLOCKED ai_event from unjoined socket ${socket.id}`);
        return;
      }
      const session = getOrCreateSessionState(sessionId);
      // Replay guard: once a session is completed/exited, no further events may be
      // injected into it (prevents stale/old events from polluting the final report).
      if (session.status === 'COMPLETED' || session.status === 'EXITED') {
        console.warn(`[ProctorSocket] BLOCKED ai_event for completed session ${sessionId}`);
        return;
      }

      const rawType = eventType || type || 'UNKNOWN_EVENT';
      const normalizedType = String(rawType).toUpperCase();
      // NEVER trust the client-provided severity: compute from session policy.
      const severity = VALID_EVENT_TYPES.has(normalizedType)
        ? evaluateEventSeverity(normalizedType, session.sessionType)
        : 'LOW';

      const nowMs = Date.now();
      const lifecycleKey = eventLifecycleKey(normalizedType);
      const resolving = isClearEvent(normalizedType) || String(state || '').toUpperCase() === 'RESOLVED';

      // ── Event lifecycle state machine (DETECTED -> CLEARED) ───────────────
      // The FIRST qualified detection creates the alert IMMEDIATELY (no cooldown).
      // Repeat detections of an already-open lifecycle are suppressed (no spam),
      // and CLEARED closes the lifecycle with an informational alert.
      if (!session.eventStates) session.eventStates = {};
      const eventStates = session.eventStates;

      let shouldCreate = true;
      if (lifecycleKey) {
        const st = eventStates[lifecycleKey];
        // Safety valve: expire stuck DETECTED states so later detections re-alert.
        if (st && st.status !== 'CLEARED' && nowMs - (st.firstSeen || nowMs) > LIFECYCLE_TTL_MS) {
          st.status = 'CLEARED';
        }
        if (resolving) {
          // Only emit CLEARED if there is an OPEN lifecycle to close (avoids
          // CLEARED spam when the engine never confirmed a detection).
          shouldCreate = Boolean(st && st.status !== 'CLEARED');
          if (shouldCreate) {
            st.status = 'CLEARED';
            st.lastSeen = nowMs;
          }
        } else {
          if (!st || st.status === 'CLEARED') {
            eventStates[lifecycleKey] = { status: 'DETECTED', firstSeen: nowMs, lastSeen: nowMs };
            shouldCreate = true;
          } else {
            // Already-open lifecycle: suppress the duplicate alert entirely.
            st.lastSeen = nowMs;
            shouldCreate = false;
          }
        }
      }

      if (!shouldCreate) return; // duplicate of an open lifecycle — never re-alert

      const eventId = makeEventId();
      const meta = buildAlertMeta(Number(captureTimestamp));
      meta.priority = SEVERITY_PRIORITY[severity] || 'P3';

      // Participant identity is derived from the socket's join record — a
      // client-supplied participantId is never trusted.
      const joinedParticipant = session.participants.find((p) => p.socketId === socket.id);
      const rawEvidence = evidence || message || description || `AI detected ${normalizedType}`;
      const newAlert = {
        eventId,
        id: eventId,
        sessionId,
        participantId: (joinedParticipant && joinedParticipant.id) || socket.id,
        timestamp: new Date().toISOString(),
        eventType: normalizedType,
        type: normalizedType,
        category: category || 'BEHAVIOUR',
        source: source || 'AI_ENGINE',
        severity: resolving && severity === 'LOW' ? 'INFO' : severity,
        priority: meta.priority,
        confidence: Math.max(0, Math.min(1, Number(confidence) || 0)),
        description: description || message || rawEvidence,
        message: message || description || rawEvidence,
        evidence: rawEvidence,
        status: resolving ? 'CLEARED' : 'OPEN',
        state: resolving ? 'RESOLVED' : 'DETECTED',
        captureTimestamp: Number(captureTimestamp) || undefined,
        serverReceivedTimestamp: meta.serverReceivedTimestamp,
        alertCreatedTimestamp: meta.alertCreatedTimestamp,
        socketEmittedTimestamp: meta.socketEmittedTimestamp,
        stale: meta.stale,
        metadata: metadata || {},
      };

      session.alerts.unshift(newAlert);
      if (session.alerts.length > 200) session.alerts.pop(); // cap in-memory history (Mongo persists everything)
      session.alertCount += 1;

      // CLEARED lifecycle alerts are informational — they never penalize trust.
      if (!resolving) {
        if (severity === 'CRITICAL') {
          session.criticalAlertCount += 1;
          session.trustScore = Math.max(0, session.trustScore - 25);
        } else if (severity === 'HIGH') {
          session.trustScore = Math.max(0, session.trustScore - 15);
        } else if (severity === 'MEDIUM') {
          session.trustScore = Math.max(0, session.trustScore - 8);
        } else {
          session.trustScore = Math.max(0, session.trustScore - 3);
        }
      }

      if (normalizedType === 'AI_ENGINE_OFFLINE') {
        session.aiEngineOnline = false;
      }

      const effectiveRoomId = session.roomId || (sessionId.startsWith('TRV-') ? sessionId.split('-').slice(0, 2).join('-') : null);
      const riskScore = Math.max(0, 100 - session.trustScore);
      const riskLevel = riskScore > 60 ? 'HIGH' : riskScore > 20 ? 'MEDIUM' : 'NORMAL';

      const proctorAlertPayload = {
        roomId: effectiveRoomId,
        sessionId,
        candidateId: (joinedParticipant && joinedParticipant.id) || socket.id,
        candidateName: (joinedParticipant && joinedParticipant.name) || 'Candidate',
        type: normalizedType,
        eventType: normalizedType,
        severity: newAlert.severity,
        riskScore,
        riskLevel,
        timestamp: newAlert.timestamp,
        message: newAlert.description || `AI detected ${normalizedType.replace(/_/g, ' ')}`,
        confidence: newAlert.confidence,
      };

      const canonicalProctorEvent = {
        id: eventId,
        sessionId,
        timestamp: newAlert.timestamp,
        type: normalizedType,
        eventType: normalizedType,
        category: category || 'BEHAVIOUR',
        severity: newAlert.severity,
        confidence: newAlert.confidence,
        source: source || 'AI_ENGINE',
        message: newAlert.message,
        evidence: newAlert.evidence,
        state: newAlert.state,
        status: newAlert.status,
        riskScore,
        riskLevel,
        metadata: metadata || {}
      };

      const roomName = `room_${sessionId}`;
      io.to(roomName).emit('proctor:event', canonicalProctorEvent);
      io.to(`session:${sessionId}`).emit('proctor:event', canonicalProctorEvent);
      io.to(roomName).emit('AI_EVENT', newAlert);
      io.to(`session:${sessionId}`).emit('AI_EVENT', newAlert);
      io.to(roomName).emit('ALERT_CREATED', newAlert);
      io.to(`session:${sessionId}`).emit('ALERT_CREATED', newAlert);
      io.to(roomName).emit('proctor_alert', proctorAlertPayload);
      io.to(`session:${sessionId}`).emit('proctor_alert', proctorAlertPayload);
      io.to(roomName).emit('TRUST_SCORE_UPDATED', { trustScore: session.trustScore });
      io.to(`session:${sessionId}`).emit('TRUST_SCORE_UPDATED', { trustScore: session.trustScore });
      io.to(roomName).emit('RISK_SCORE_UPDATED', { riskScore, riskLevel });
      io.to(`session:${sessionId}`).emit('RISK_SCORE_UPDATED', { riskScore, riskLevel });

      if (effectiveRoomId) {
        io.to(`proctor:${effectiveRoomId}`).emit('proctor_alert', proctorAlertPayload);
        io.to(`room:proctor:${effectiveRoomId}`).emit('proctor_alert', proctorAlertPayload);
        io.to(`room_${effectiveRoomId}`).emit('proctor_alert', proctorAlertPayload);
        io.to(`proctor:${effectiveRoomId}`).emit('AI_EVENT', newAlert);
        io.to(`proctor:${effectiveRoomId}`).emit('proctor:event', canonicalProctorEvent);
        io.to(`proctor:${effectiveRoomId}`).emit('participant_risk_updated', {
          roomId: effectiveRoomId,
          sessionId,
          candidateId: proctorAlertPayload.candidateId,
          candidateName: proctorAlertPayload.candidateName,
          riskScore,
          riskLevel,
          violations: session.alertCount,
        });
        io.to(`room_${effectiveRoomId}`).emit('participant_risk_updated', {
          roomId: effectiveRoomId,
          sessionId,
          candidateId: proctorAlertPayload.candidateId,
          candidateName: proctorAlertPayload.candidateName,
          riskScore,
          riskLevel,
          violations: session.alertCount,
        });
      }

      // Persist asynchronously; never block live alert delivery on a DB write.
      persistAlert(newAlert);
      if (severity === 'CRITICAL' || !session._lastPersist || nowMs - session._lastPersist > 5000) {
        session._lastPersist = nowMs;
        persistSession(session);
      }

      // Auto-suspension check (policy thresholds, server-authoritative)
      const exceeded =
        session.criticalAlertCount >= session.criticalLimit ||
        session.alertCount >= session.warningLimit * 3 ||
        session.trustScore <= 20 ||
        (normalizedType === 'AI_ENGINE_OFFLINE' && session.sessionType === 'EXAM');

      if (exceeded && session.status !== 'SUSPENDED' && session.status !== 'SUSPENDING') {
        session.status = 'SUSPENDED';
        session.suspensionReason = normalizedType === 'AI_ENGINE_OFFLINE' ? 'AI_ENGINE_OFFLINE' : 'MONITORING_THRESHOLD_EXCEEDED';
        session.suspensionCount += 1;
        persistSession(session);

        io.to(roomName).emit('THRESHOLD_EXCEEDED', {
          alertCount: session.alertCount,
          criticalAlertCount: session.criticalAlertCount,
          trustScore: session.trustScore,
        });

        io.to(roomName).emit('SESSION_SUSPENDED', {
          session,
          reason: session.suspensionReason,
          message: 'Your session has been temporarily suspended because the configured monitoring threshold was exceeded.',
        });

        io.to(roomName).emit('SESSION_STATE_CHANGED', { status: 'SUSPENDED', session });
      }
    };

    socket.on('ai_event', handleAiEvent);
    socket.on('proctor:event', handleAiEvent);
    socket.on('proctor_alert', handleAiEvent);
    socket.on('alert', handleAiEvent);

    // Reviewer Action Controls & Voice Commands – SERVER-AUTHORITATIVE ROLE CHECK
    socket.on('reviewer_command', ({ sessionId, command, payload }) => {
      if (!canControlSession(socket)) {
        console.warn(`[ProctorSocket] BLOCKED reviewer command ${command} from unauthenticated/non-admin socket ${socket.id}`);
        return;
      }

      const session = getOrCreateSessionState(sessionId);
      const roomName = `room_${sessionId}`;
      console.log(`[ProctorSocket] Reviewer command: ${command} on ${sessionId}`);

      switch (command) {
        case 'PAUSE_SESSION':
          session.status = 'WARNING';
          io.to(roomName).emit('SESSION_STATE_CHANGED', { status: 'WARNING', session });
          break;

        case 'SUSPEND_SESSION':
          session.status = 'SUSPENDED';
          session.suspensionReason = payload?.reason || 'SUSPENDED_BY_REVIEWER';
          session.suspensionCount += 1;
          persistSession(session);
          io.to(roomName).emit('SESSION_SUSPENDED', {
            session,
            reason: session.suspensionReason,
            message: 'Session suspended by the reviewer.',
          });
          io.to(roomName).emit('SESSION_STATE_CHANGED', { status: 'SUSPENDED', session });
          break;

        case 'RESUME_SESSION':
          session.status = 'LIVE';
          session.suspensionReason = null;
          persistSession(session);
          io.to(roomName).emit('SESSION_RESUMED', { session });
          io.to(roomName).emit('SESSION_STATE_CHANGED', { status: 'LIVE', session });
          io.to(roomName).emit('SESSION_TIMER_SYNC', {
            serverNow: Date.now(),
            startedAt: session.startedAt,
            endTime: session.endTime,
            sessionDuration: session.sessionDuration,
            status: session.status,
          });
          break;

        case 'END_SESSION':
          session.status = 'COMPLETED';
          session.endedAt = new Date().toISOString();
          persistSession(session);
          generateSessionReport(session, { completedByTimer: false });
          io.to(roomName).emit('SESSION_COMPLETED', { session });
          io.to(roomName).emit('SESSION_STATE_CHANGED', { status: 'COMPLETED', session });
          setTimeout(() => {
            activeSessions.delete(sessionId);
            warnedMinutes.delete(sessionId);
          }, 10 * 60 * 1000)?.unref?.();
          break;

        case 'TRIGGER_LIVENESS':
          io.to(roomName).emit('LIVENESS_CHALLENGE_REQUESTED', {
            challengeType: payload?.type || 'BLINK',
            timestamp: new Date().toISOString(),
          });
          break;

        case 'ISSUE_WARNING':
          io.to(roomName).emit('OFFICIAL_WARNING_ISSUED', {
            message: payload?.message || 'Official Warning: Please remain focused on your screen.',
            timestamp: new Date().toISOString(),
          });
          break;

        default:
          io.to(roomName).emit('REVIEWER_ACTION', { command, payload });
          break;
      }
    });

    // ── WebRTC signaling (relayed through the authoritative server) ──
    // Only ADMIN (reviewer) sockets may subscribe to participant media, and
    // signaling is relayed exclusively between an admin socket and a participant
    // socket in the same room. Participants can never exchange media with each other.

    socket.on('subscribe_stream', ({ sessionId }) => {
      if (!canControlSession(socket)) {
        console.warn(`[ProctorSocket] BLOCKED stream subscription from non-admin socket ${socket.id}`);
        return;
      }
      const roomName = `room_${sessionId}`;
      // Ask every participant socket in the room to prepare an offer for this reviewer.
      io.to(roomName).emit('STREAM_OFFER_REQUESTED', { reviewerSocketId: socket.id });
    });

    socket.on('webrtc_signal', ({ sessionId, target, signal }) => {
      const session = activeSessions.get(sessionId);
      if (!session) return;

      const type = signal && signal.type;
      const targetSocket = io.sockets.sockets.get(target);
      if (!targetSocket || targetSocket.sessionId !== sessionId) return;

      const senderIsAdmin = canControlSession(socket);
      const targetIsAdmin = canControlSession(targetSocket);

      // Authorization matrix:
      //  - offer  : participant -> reviewer (participants publish their own media)
      //  - answer : reviewer -> participant
      //  - ice    : any participant<->reviewer pair in the room
      let allowed = false;
      if (type === 'offer' && !senderIsAdmin && targetIsAdmin) allowed = true;
      else if (type === 'answer' && senderIsAdmin && !targetIsAdmin) allowed = true;
      else if (type === 'ice' && senderIsAdmin !== targetIsAdmin) allowed = true;

      if (!allowed) {
        console.warn(`[ProctorSocket] BLOCKED webrtc_signal (${type}) from ${socket.id} to ${target}`);
        return;
      }

      targetSocket.emit('webrtc_signal', { sessionId, sender: socket.id, signal });
    });

    // Leave Room / Disconnect
    socket.on('disconnect', async () => {
      const sessionId = socket.sessionId;
      const effectiveRoomId = socket.roomId || (sessionId && sessionId.startsWith('TRV-') ? (sessionId.startsWith('TRV-TRV-') ? sessionId.split('-').slice(1, 3).join('-') : sessionId.split('-').slice(0, 2).join('-')) : null);

      if (sessionId) {
        const session = activeSessions.get(sessionId);
        if (session) {
          const leaving = session.participants.find((p) => p.socketId === socket.id);
          session.participants = session.participants.filter((p) => p.socketId !== socket.id);

          // Evidence-based event: a participant leaving mid-session is recorded
          if (leaving && leaving.role === 'participant') {
            const leftAlert = {
              eventId: makeEventId(),
              sessionId: session.sessionId,
              roomId: effectiveRoomId,
              participantId: leaving.id,
              candidateName: leaving.name || 'Participant',
              timestamp: new Date().toISOString(),
              eventType: 'PARTICIPANT_LEFT',
              type: 'PARTICIPANT_LEFT',
              severity: evaluateEventSeverity('PARTICIPANT_LEFT', session.sessionType) || 'LOW',
              confidence: 1.0,
              description: `${leaving.name || 'Participant'} disconnected from the monitored session.`,
              message: `${leaving.name || 'Participant'} disconnected from the monitored session.`,
              status: 'OPEN',
              state: 'DETECTED',
              ...buildAlertMeta(),
              priority: 'P3',
            };
            session.alerts.unshift(leftAlert);
            if (session.alerts.length > 200) session.alerts.pop();
            session.alertCount += 1;
            persistAlert(leftAlert);

            io.to(`room_${session.sessionId}`).emit('AI_EVENT', leftAlert);
            io.to(`session:${session.sessionId}`).emit('AI_EVENT', leftAlert);
            io.to(`room_${session.sessionId}`).emit('ALERT_CREATED', leftAlert);
            io.to(`session:${session.sessionId}`).emit('ALERT_CREATED', leftAlert);

            if (effectiveRoomId) {
              const leftPayload = {
                roomId: effectiveRoomId,
                sessionId: session.sessionId,
                candidateId: leaving.id,
                name: leaving.name,
                status: 'LEFT',
                reason: 'DISCONNECTED',
                timestamp: new Date().toISOString(),
              };
              io.to(`proctor:${effectiveRoomId}`).emit('proctor_alert', leftAlert);
              io.to(`room_${effectiveRoomId}`).emit('proctor_alert', leftAlert);
              io.to(`room:proctor:${effectiveRoomId}`).emit('proctor_alert', leftAlert);
              io.to(`proctor:${effectiveRoomId}`).emit('participant_left', leftPayload);
              io.to(`room_${effectiveRoomId}`).emit('participant_left', leftPayload);
              io.to(`room:proctor:${effectiveRoomId}`).emit('participant_left', leftPayload);
            }
          }

          io.to(`room_${socket.sessionId}`).emit('room_participants_updated', {
            participantsCount: session.participants.length,
            participants: session.participants,
          });

          if (effectiveRoomId) {
            io.to(`proctor:${effectiveRoomId}`).emit('room_participants_updated', {
              participantsCount: session.participants.length,
              participants: session.participants,
            });
            io.to(`room_${effectiveRoomId}`).emit('room_participants_updated', {
              participantsCount: session.participants.length,
              participants: session.participants,
            });

            // Update participant in MongoDB Room
            try {
              const updatedRoom = await Room.findOneAndUpdate(
                {
                  $or: [
                    { roomId: effectiveRoomId.toUpperCase() },
                    { joinCode: effectiveRoomId.toUpperCase() }
                  ],
                  'participants.id': leaving?.id
                },
                { $set: { 'participants.$.status': 'LEFT', 'participants.$.leftAt': new Date() } },
                { new: true }
              );
              if (updatedRoom) {
                updatedRoom.participantsCount = updatedRoom.participants.filter(p => p.status !== 'LEFT').length;
                await updatedRoom.save();
                io.to(`proctor:${effectiveRoomId}`).emit('room_participants_updated', {
                  participantsCount: updatedRoom.participantsCount,
                  participants: updatedRoom.participants,
                });
                io.to(`room_${effectiveRoomId}`).emit('room_participants_updated', {
                  participantsCount: updatedRoom.participantsCount,
                  participants: updatedRoom.participants,
                });
              }
            } catch (_) {}
          }
        }
      }
      console.log(`[ProctorSocket] Client disconnected: ${socket.id}`);
    });
  });

  // ── Server-authoritative session timer sweep ──
  // Runs on the SERVER clock (browser clocks are never trusted). Completes the
  // session automatically when the configured duration expires, generates the
  // final report, and broadcasts timer sync/warnings to connected clients.
  const TIMER_SWEEP_MS = 5000;
  const warnedMinutes = new Map(); // sessionId -> Set of minute thresholds already warned

  const sweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of activeSessions) {
      if (session.status !== 'LIVE' || !session.endTime) continue;

      const remainingMs = session.endTime - now;

      // ── Timer expiry → SESSION_COMPLETED (automatic) ──
      if (remainingMs <= 0) {
        session.status = 'COMPLETED';
        session.endedAt = new Date(now).toISOString();
        session.completedByTimer = true;
        persistSession(session);
        generateSessionReport(session, { completedByTimer: true });

        const roomName = `room_${sessionId}`;
        io.to(roomName).emit('SESSION_COMPLETED', { session, completedByTimer: true });
        io.to(roomName).emit('SESSION_STATE_CHANGED', { status: 'COMPLETED', session });
        console.log(`[ProctorSocket] Session ${sessionId} auto-completed by timer expiry.`);

        // Bound in-memory session growth: drop completed sessions after a grace period.
        setTimeout(() => {
          activeSessions.delete(sessionId);
          warnedMinutes.delete(sessionId);
        }, 10 * 60 * 1000)?.unref?.();
        continue;
      }

      // ── Timer warnings (configurable minutes: e.g. 10, 5, 1) ──
      // Sub-minute sessions get no minute warnings (they would be nonsensical).
      const remainingMinutes = remainingMs / 60000;
      if (!warnedMinutes.has(sessionId)) warnedMinutes.set(sessionId, new Set());
      const warned = warnedMinutes.get(sessionId);
      for (const threshold of TIMER_WARNINGS_MIN) {
        const warnable = session.sessionDuration >= 60 && threshold < session.sessionDuration / 60;
        if (warnable && remainingMinutes <= threshold && remainingMinutes > threshold - 1 && !warned.has(threshold)) {
          warned.add(threshold);
          io.to(`room_${sessionId}`).emit('SESSION_TIMER_WARNING', {
            minutesRemaining: threshold,
            message: `${threshold} minute${threshold === 1 ? '' : 's'} remaining in this session.`,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // ── Periodic server-time sync so clients stay authoritative ──
      io.to(`room_${sessionId}`).emit('SESSION_TIMER_UPDATE', {
        serverNow: now,
        remainingSeconds: Math.max(0, Math.ceil(remainingMs / 1000)),
        endTime: session.endTime,
      });
    }
  }, TIMER_SWEEP_MS);

  sweepInterval.unref?.();
}

module.exports = { initProctorSocket, getOrCreateSessionState };
