const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const os = require('os');
const Room = require('../models/Room');
const Session = require('../models/Session');
const { protect, optionalProtect } = require('../middleware/authMiddleware');

// Helper to determine the local LAN IP for WhatsApp/mobile shareable links
function getLanIp() {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254')) {
          return iface.address;
        }
      }
    }
  } catch (_) {}
  return 'localhost';
}

function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// @route   GET /api/rooms
// @desc    List virtual rooms owned by the currently authenticated user
// @access  Private (Authenticated Users Only)
router.get('/', protect, async (req, res, next) => {
  try {
    const userId = String(req.user._id || req.user.id);
    const userEmail = req.user.email;
    const userRole = req.user.role;

    // Filter strictly to rooms owned/created by the current user
    // Admins can see all rooms only if explicitly requested via ?all=true
    let filter;
    if (userRole === 'admin' && req.query.all === 'true') {
      filter = {
        roomId: { $ne: 'TRV-DOES-NOT-EXIST-404' }
      };
    } else {
      filter = {
        $and: [
          { roomId: { $ne: 'TRV-DOES-NOT-EXIST-404' } },
          {
            $or: [
              { ownerId: userId },
              { createdBy: userId },
              { hostUserId: userId },
              { 'host.id': userId },
              { 'host.email': userEmail },
            ]
          }
        ]
      };
    }

    const rooms = await Room.find(filter).sort({ createdAt: -1 }).lean();
    const lanIp = getLanIp();
    const hostPort = process.env.CLIENT_PORT || '5173';

    const enrichedRooms = rooms.map(r => {
      const activeParticipants = (r.participants || []).filter(p => p.status !== 'LEFT');
      const activeMonitoring = (r.participants || []).filter(p => p.status === 'MONITORING');
      const roomAlerts = r.alerts || (r.participants || []).reduce((acc, p) => acc + (p.violations || 0), 0);
      const critAlerts = r.criticalAlerts || (r.participants || []).filter(p => p.riskLevel === 'CRITICAL' || p.status === 'TERMINATED').length;
      return {
        ...r,
        id: r.roomId,
        ownerId: r.ownerId || r.host?.id || userId,
        ownerName: r.ownerName || r.host?.name || 'Session Host',
        ownerEmail: r.ownerEmail || r.host?.email || '',
        title: (!r.title || r.title === 'null' || r.title === 'undefined') ? 'Computer Science Examination' : r.title,
        joinUrl: `http://${lanIp}:${hostPort}/join/${r.roomId}?token=${r.joinCode}`,
        hostName: r.ownerName || r.host?.name || 'Session Host',
        participantsCount: activeParticipants.length,
        students: activeParticipants.length,
        activeStudents: activeMonitoring.length,
        alerts: roomAlerts,
        criticalAlerts: critAlerts,
      };
    });

    res.json({
      success: true,
      count: enrichedRooms.length,
      rooms: enrichedRooms,
      lanIp,
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/rooms/:roomId/public
// @desc    Public endpoint to view safe room information for joining candidates
// @access  Public
router.get('/:roomId/public', async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const cleanRoomId = (roomId || '').trim().toUpperCase();

    if (cleanRoomId === 'TRV-DOES-NOT-EXIST-404' || !cleanRoomId) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    const room = await Room.findOne({
      $or: [
        { roomId: cleanRoomId },
        { joinCode: cleanRoomId }
      ]
    }).lean();

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    const token = (req.query.token || req.headers['x-join-token'] || '').trim();
    if (!token) {
      return res.status(403).json({
        success: false,
        message: 'Invalid or missing join token. A valid invitation link is required.'
      });
    }

    if (token !== room.joinToken && token !== room.joinCode) {
      return res.status(403).json({
        success: false,
        message: 'Invalid join token. You cannot enter without a valid room invitation link.'
      });
    }

    if (room.status === 'ENDED') {
      return res.status(400).json({
        success: false,
        message: `This proctoring session (${room.title}) has already ended.`
      });
    }

    // Expiry check if room had a scheduled time & duration
    if (room.scheduledAt && room.durationMinutes) {
      const scheduledTime = new Date(room.scheduledAt).getTime();
      const expirationTime = scheduledTime + (room.durationMinutes * 60 * 1000) + (60 * 60 * 1000); // 1hr buffer
      if (Date.now() > expirationTime && room.status === 'ENDED') {
        return res.status(400).json({
          success: false,
          message: 'This proctoring session schedule has expired.'
        });
      }
    }

    const lanIp = getLanIp();
    const hostPort = process.env.CLIENT_PORT || '5173';
    const activeParticipants = (room.participants || []).filter(p => p.status !== 'LEFT');
    const activeMonitoring = (room.participants || []).filter(p => p.status === 'MONITORING');
    const roomAlerts = room.alerts || (room.participants || []).reduce((acc, p) => acc + (p.violations || 0), 0);
    const critAlerts = room.criticalAlerts || (room.participants || []).filter(p => p.riskLevel === 'CRITICAL' || p.status === 'TERMINATED').length;

    res.json({
      success: true,
      room: {
        roomId: room.roomId,
        joinCode: room.joinCode,
        title: room.title,
        hostName: room.ownerName || room.host?.name || 'Session Host',
        ownerId: room.ownerId || room.host?.id,
        mode: room.mode,
        sessionType: room.sessionType,
        status: room.status,
        maxParticipants: room.maxParticipants,
        participantsCount: activeParticipants.length,
        students: activeParticipants.length,
        activeStudents: activeMonitoring.length,
        alerts: roomAlerts,
        criticalAlerts: critAlerts,
        durationMinutes: room.durationMinutes || 60,
        voiceAlerts: room.voiceAlerts,
        requireIdentity: room.requireIdentity,
        createdAt: room.createdAt,
        joinUrl: `http://${lanIp}:${hostPort}/join/${room.roomId}?token=${room.joinCode}`,
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/rooms
// @desc    Create a new Virtual Proctor Room attached to the authenticated user
// @access  Private (Authenticated User Only)
router.post('/', protect, async (req, res, next) => {
  try {
    const {
      title,
      mode,
      sessionType,
      maxParticipants,
      voiceAlerts,
      requireIdentity,
      warningLimit,
      criticalLimit,
      suspensionLimit,
      durationMinutes,
      scheduledAt
    } = req.body;

    const selectedMode = (mode || sessionType || 'EXAM').toUpperCase();
    
    // Generate unique roomId (e.g. TRV-1045)
    let generatedRoomId;
    let exists = true;
    while (exists) {
      const num = Math.floor(1000 + Math.random() * 9000);
      generatedRoomId = `TRV-${num}`;
      const existing = await Room.findOne({ roomId: generatedRoomId });
      if (!existing) exists = false;
    }

    // Generate unique 6-character join code (e.g. A7K9P2)
    let joinCode;
    let codeExists = true;
    while (codeExists) {
      joinCode = generateJoinCode();
      const existingCode = await Room.findOne({ joinCode });
      if (!existingCode) codeExists = false;
    }

    const joinToken = crypto.randomBytes(16).toString('hex');
    const ownerId = String(req.user._id || req.user.id);
    const ownerName = req.user.fullName || req.user.name || 'Session Host';
    const ownerEmail = req.user.email || '';

    const hostInfo = {
      id: ownerId,
      name: ownerName,
      email: ownerEmail,
    };

    const lanIp = getLanIp();
    const hostPort = process.env.CLIENT_PORT || '5173';
    const joinUrl = `http://${lanIp}:${hostPort}/join/${generatedRoomId}?token=${joinCode}`;

    const newRoom = await Room.create({
      roomId: generatedRoomId,
      joinCode,
      joinToken,
      title: title?.trim() || 'New Monitored Session',
      ownerId,
      ownerName,
      ownerEmail,
      createdBy: ownerId,
      hostUserId: ownerId,
      host: hostInfo,
      mode: selectedMode,
      sessionType: selectedMode,
      status: 'CREATED',
      maxParticipants: Number(maxParticipants) > 0 ? Number(maxParticipants) : 30,
      participantsCount: 0,
      students: 0,
      activeStudents: 0,
      alerts: 0,
      criticalAlerts: 0,
      participants: [],
      voiceAlerts: voiceAlerts !== undefined ? Boolean(voiceAlerts) : true,
      requireIdentity: requireIdentity !== undefined ? Boolean(requireIdentity) : true,
      warningLimit: warningLimit || (selectedMode === 'EXAM' ? 5 : selectedMode === 'INTERVIEW' ? 8 : 15),
      criticalLimit: criticalLimit || (selectedMode === 'EXAM' ? 3 : selectedMode === 'INTERVIEW' ? 5 : 10),
      suspensionLimit: suspensionLimit || (selectedMode === 'EXAM' ? 1 : selectedMode === 'INTERVIEW' ? 3 : 5),
      durationMinutes: Number(durationMinutes) > 0 ? Number(durationMinutes) : (selectedMode === 'INTERVIEW' ? 30 : 60),
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    });

    const responseRoom = {
      ...newRoom.toObject(),
      id: newRoom.roomId,
      ownerId,
      ownerName,
      ownerEmail,
      joinUrl,
      hostName: hostInfo.name,
      participantsCount: 0,
      students: 0,
      activeStudents: 0,
      alerts: 0,
      criticalAlerts: 0,
      status: 'CREATED',
      participants: [],
    };

    // Broadcast room creation to the owner's personal channel and general channel
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${ownerId}`).emit('ROOM_CREATED', { room: responseRoom });
      io.emit('ROOM_CREATED', { room: responseRoom });
    }

    res.status(201).json({
      success: true,
      room: responseRoom,
      joinUrl,
      joinCode,
      roomId: generatedRoomId,
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/rooms/:roomId
// @desc    Get complete room details (with authorization check)
// @access  Public / Private (Enforces Ownership for Management)
router.get('/:roomId', optionalProtect, async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const cleanRoomId = (roomId || '').trim().toUpperCase();

    if (cleanRoomId === 'TRV-DOES-NOT-EXIST-404' || !cleanRoomId) {
      return res.status(404).json({ success: false, message: 'Room not found' });
    }

    const room = await Room.findOne({
      $or: [
        { roomId: cleanRoomId },
        { joinCode: cleanRoomId }
      ]
    });

    if (!room) {
      return res.status(404).json({ success: false, message: 'Room not found' });
    }

    // Authorization verification:
    // If the requester is authenticated, ensure they are either the room owner/creator,
    // a participant registered in the room, an administrator, or have provided a valid join token.
    const reqToken = (req.query?.token || req.headers['x-join-token'] || '').trim();
    const hasValidToken = reqToken && (reqToken === room.joinToken || reqToken === room.joinCode);

    if (req.user) {
      const uId = String(req.user._id || req.user.id);
      const uEmail = req.user.email;
      const isOwner = (room.ownerId && room.ownerId === uId) ||
                      (room.createdBy && room.createdBy === uId) ||
                      (room.hostUserId && room.hostUserId === uId) ||
                      (room.host?.id && room.host.id === uId) ||
                      (room.host?.email && room.host.email === uEmail);
      const isParticipant = (room.participants || []).some(p => p.id === uId || p.email === uEmail);
      const isAdmin = req.user.role === 'admin';

      if (!isOwner && !isParticipant && !isAdmin && !hasValidToken) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to view this room.'
        });
      }
    } else if (!hasValidToken) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this room.'
      });
    }

    const lanIp = getLanIp();
    const hostPort = process.env.CLIENT_PORT || '5173';
    const roomObj = room.toObject();
    roomObj.id = roomObj.roomId;

    if (!roomObj.title || roomObj.title === 'null' || roomObj.title === 'undefined') {
      roomObj.title = 'Computer Science Examination';
    }
    roomObj.joinUrl = `http://${lanIp}:${hostPort}/join/${roomObj.roomId}?token=${roomObj.joinCode}`;
    roomObj.hostName = roomObj.ownerName || roomObj.host?.name || 'Session Host';
    roomObj.ownerId = roomObj.ownerId || roomObj.host?.id;

    // Authoritative active count
    const activeParticipants = (roomObj.participants || []).filter(p => p.status !== 'LEFT');
    const activeMonitoring = (roomObj.participants || []).filter(p => p.status === 'MONITORING');
    roomObj.participantsCount = activeParticipants.length;
    roomObj.students = activeParticipants.length;
    roomObj.activeStudents = activeMonitoring.length;
    roomObj.alerts = roomObj.alerts || (roomObj.participants || []).reduce((acc, p) => acc + (p.violations || 0), 0);
    roomObj.criticalAlerts = roomObj.criticalAlerts || (roomObj.participants || []).filter(p => p.riskLevel === 'CRITICAL' || p.status === 'TERMINATED').length;

    res.json({
      success: true,
      room: roomObj,
      joinUrl: roomObj.joinUrl,
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/rooms/:roomId/join
// @desc    Candidate enters room: validate capacity, create MongoDB session, increment count
// @access  Private (Authenticated & Registered Candidate Only)
router.post('/:roomId/join', protect, async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const cleanRoomId = (roomId || '').trim().toUpperCase();

    if (cleanRoomId === 'TRV-DOES-NOT-EXIST-404' || !cleanRoomId) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Verify user is authenticated and active
    if (!req.user || req.user.status !== 'Active') {
      return res.status(403).json({
        success: false,
        message: 'Your account is not active. Please login or complete registration before joining.'
      });
    }

    const room = await Room.findOne({
      $or: [
        { roomId: cleanRoomId },
        { joinCode: cleanRoomId }
      ]
    });

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Enforce token validation
    const token = (req.body?.token || req.query?.token || req.headers['x-join-token'] || '').trim();
    if (!token) {
      return res.status(403).json({
        success: false,
        message: 'Invalid or missing join token. A valid invitation link is required.'
      });
    }

    if (token !== room.joinToken && token !== room.joinCode) {
      return res.status(403).json({
        success: false,
        message: 'Invalid join token. You cannot enter without a valid room invitation link.'
      });
    }

    if (room.status === 'ENDED') {
      return res.status(400).json({
        success: false,
        message: `Room ${room.roomId} has ended and is no longer accepting candidates.`
      });
    }

    const activeParticipants = (room.participants || []).filter(p => p.status !== 'LEFT');
    if (activeParticipants.length >= room.maxParticipants) {
      return res.status(400).json({
        success: false,
        message: `Room ${room.roomId} has reached its maximum capacity of ${room.maxParticipants} candidates.`
      });
    }

    // Authoritative Candidate Identity from req.user
    const effectiveName = req.user.fullName || req.user.name || 'Registered Candidate';
    const effectiveEmail = req.user.email;
    const effectiveId = String(req.user._id || req.user.id);
    const sessionMode = (room.mode || room.sessionType || 'EXAM').toUpperCase();

    // Unique authoritative Session ID (reuse existing active session if one exists)
    let session = await Session.findOne({
      roomId: room.roomId,
      userId: effectiveId,
      status: { $in: ['ACTIVE', 'LIVE', 'READY'] }
    });

    let sessionId;
    if (session) {
      sessionId = session.sessionId;
    } else {
      sessionId = `TRV-${room.roomId}-${Date.now().toString(36).toUpperCase()}`;
      session = await Session.create({
        sessionId,
        roomId: room.roomId,
        roomTitle: room.title,
        mode: sessionMode,
        sessionType: sessionMode,
        userId: effectiveId,
        userName: effectiveName,
        userEmail: effectiveEmail,
        status: 'ACTIVE',
        startTime: new Date(),
        trustScore: 100,
        tabSwitchCount: 0,
        maxTabSwitches: 3,
        tabSwitchStatus: 'NORMAL',
        tabSwitchEvents: [],
        warningLimit: room.warningLimit || 5,
        criticalLimit: room.criticalLimit || 3,
        suspensionLimit: room.suspensionLimit || 1,
      });
    }

    // Update Room Participants in MongoDB
    if (!room.participants) room.participants = [];
    const existingIndex = room.participants.findIndex(p => p.id === effectiveId || p.email === effectiveEmail);
    const participantData = {
      id: effectiveId,
      sessionId,
      name: effectiveName,
      email: effectiveEmail,
      status: 'VERIFYING',
      connectionState: 'CONNECTED',
      monitoringStatus: 'INACTIVE',
      riskScore: 0,
      riskLevel: 'LOW',
      attention: 90,
      attentionScore: 90,
      violations: 0,
      tabSwitchCount: 0,
      maxTabSwitches: 3,
      tabSwitchStatus: 'NORMAL',
      liveness: 'LIVE',
      faceDetected: true,
      gaze: 'center',
      pose: 'Looking Straight',
      phoneDetected: false,
      identityStatus: 'VERIFIED',
      joinedAt: new Date(),
    };

    if (existingIndex >= 0) {
      room.participants[existingIndex] = { ...room.participants[existingIndex].toObject?.() || room.participants[existingIndex], ...participantData, status: 'VERIFYING', connectionState: 'CONNECTED' };
    } else {
      room.participants.push(participantData);
    }

    const currentActiveParticipants = room.participants.filter(p => p.status !== 'LEFT');
    const activeMonitoring = room.participants.filter(p => p.status === 'MONITORING');
    room.participantsCount = currentActiveParticipants.length;
    room.students = currentActiveParticipants.length;
    room.activeStudents = activeMonitoring.length;
    if (room.status === 'CREATED' || room.status === 'WAITING') {
      room.status = 'LIVE';
    }
    await room.save();

    // Emit Socket.IO updates to room channels and owner channel
    const io = req.app.get('io');
    const ownerId = room.ownerId || room.createdBy || room.hostUserId || room.host?.id;

    if (io) {
      const payload = {
        roomId: room.roomId,
        sessionId,
        studentId: effectiveId,
        studentName: effectiveName,
        candidate: participantData,
        participantsCount: room.participantsCount,
        students: room.students,
        activeStudents: room.activeStudents,
        participants: room.participants,
      };

      const updatePayload = {
        roomId: room.roomId,
        participantsCount: room.participantsCount,
        students: room.students,
        activeStudents: room.activeStudents,
        participants: room.participants,
      };

      // Emit to standardized room channels
      io.to(`room:${room.roomId}`).emit('ROOM_PARTICIPANT_JOINED', payload);
      io.to(`room:${room.roomId}`).emit('ROOM_PARTICIPANTS_UPDATED', updatePayload);
      io.to(`proctor:${room.roomId}`).emit('ROOM_PARTICIPANT_JOINED', payload);
      io.to(`proctor:${room.roomId}`).emit('ROOM_PARTICIPANTS_UPDATED', updatePayload);

      // Legacy aliases
      io.to(`proctor:${room.roomId}`).emit('STUDENT_JOINED', payload);
      io.to(`proctor:${room.roomId}`).emit('participant_joined', payload);
      io.to(`room_${room.roomId}`).emit('STUDENT_JOINED', payload);
      io.to(`room_${room.roomId}`).emit('participant_joined', payload);
      io.to(`proctor:${room.roomId}`).emit('room_participants_updated', updatePayload);
      io.to(`room_${room.roomId}`).emit('room_participants_updated', updatePayload);

      // Direct notification to the room owner's personal channel
      if (ownerId) {
        io.to(`user:${ownerId}`).emit('ROOM_PARTICIPANT_JOINED', payload);
        io.to(`user:${ownerId}`).emit('ROOM_PARTICIPANTS_UPDATED', updatePayload);
        io.to(`user:${ownerId}`).emit('STUDENT_JOINED', payload);
        io.to(`user:${ownerId}`).emit('participant_joined', payload);
        io.to(`user:${ownerId}`).emit('room_participants_updated', updatePayload);
      }
    }

    res.json({
      success: true,
      message: 'Joined room successfully',
      sessionId,
      roomId: room.roomId,
      room: {
        ...room.toObject(),
        id: room.roomId,
        participantsCount: room.participantsCount,
        students: room.students,
        activeStudents: room.activeStudents,
      },
      mode: sessionMode,
      candidate: participantData,
      session,
      status: room.status,
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/rooms/:roomId/leave
// @desc    Candidate leaves room: update status and decrement active count
// @access  Public / Private
router.post('/:roomId/leave', optionalProtect, async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const { candidateId, sessionId } = req.body;
    const userId = candidateId || (req.user ? String(req.user._id || req.user.id) : null);
    const cleanRoomId = (roomId || '').trim().toUpperCase();

    const room = await Room.findOne({
      $or: [
        { roomId: cleanRoomId },
        { joinCode: cleanRoomId }
      ]
    });

    if (room) {
      if (room.participants && room.participants.length > 0) {
        room.participants.forEach(p => {
          if ((userId && p.id === userId) || (sessionId && p.sessionId === sessionId)) {
            p.status = 'LEFT';
            p.connectionState = 'DISCONNECTED';
            p.monitoringStatus = 'STOPPED';
            p.leftAt = new Date();
          }
        });
      }

      const activeParticipants = room.participants.filter(p => p.status !== 'LEFT');
      const activeMonitoring = room.participants.filter(p => p.status === 'MONITORING');
      room.participantsCount = activeParticipants.length;
      room.students = activeParticipants.length;
      room.activeStudents = activeMonitoring.length;
      await room.save();

      const io = req.app.get('io');
      const ownerId = room.ownerId || room.createdBy || room.hostUserId || room.host?.id;

      if (io) {
        const payload = {
          roomId: room.roomId,
          candidateId: userId,
          studentId: userId,
          sessionId,
          participantsCount: room.participantsCount,
          students: room.students,
          activeStudents: room.activeStudents,
          participants: room.participants,
        };

        const updatePayload = {
          roomId: room.roomId,
          participantsCount: room.participantsCount,
          students: room.students,
          activeStudents: room.activeStudents,
          participants: room.participants,
        };

        // Standardized events
        io.to(`room:${room.roomId}`).emit('ROOM_PARTICIPANT_LEFT', payload);
        io.to(`room:${room.roomId}`).emit('ROOM_PARTICIPANTS_UPDATED', updatePayload);
        io.to(`proctor:${room.roomId}`).emit('ROOM_PARTICIPANT_LEFT', payload);
        io.to(`proctor:${room.roomId}`).emit('ROOM_PARTICIPANTS_UPDATED', updatePayload);

        // Legacy aliases
        io.to(`proctor:${room.roomId}`).emit('STUDENT_LEFT', payload);
        io.to(`proctor:${room.roomId}`).emit('participant_left', payload);
        io.to(`room_${room.roomId}`).emit('STUDENT_LEFT', payload);
        io.to(`room_${room.roomId}`).emit('participant_left', payload);
        io.to(`proctor:${room.roomId}`).emit('room_participants_updated', updatePayload);
        io.to(`room_${room.roomId}`).emit('room_participants_updated', updatePayload);

        if (ownerId) {
          io.to(`user:${ownerId}`).emit('ROOM_PARTICIPANT_LEFT', payload);
          io.to(`user:${ownerId}`).emit('ROOM_PARTICIPANTS_UPDATED', updatePayload);
          io.to(`user:${ownerId}`).emit('STUDENT_LEFT', payload);
          io.to(`user:${ownerId}`).emit('participant_left', payload);
          io.to(`user:${ownerId}`).emit('room_participants_updated', updatePayload);
        }
      }
    }

    res.json({
      success: true,
      message: 'Left room successfully',
      participantsCount: room ? room.participantsCount : 0,
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/rooms/:roomId/end
// @desc    Host ends room: mark room as ENDED, safely complete active sessions, notify participants
// @access  Private / Public
router.post('/:roomId/end', optionalProtect, async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const cleanRoomId = (roomId || '').trim().toUpperCase();

    const room = await Room.findOne({
      $or: [
        { roomId: cleanRoomId },
        { joinCode: cleanRoomId }
      ]
    });

    if (!room) {
      return res.status(404).json({ success: false, message: 'Room not found' });
    }

    // If authenticated, ensure user is owner or admin
    if (req.user) {
      const uId = String(req.user._id || req.user.id);
      const isOwner = (room.ownerId && room.ownerId === uId) ||
                      (room.createdBy && room.createdBy === uId) ||
                      (room.hostUserId && room.hostUserId === uId) ||
                      (room.host?.id && room.host.id === uId) ||
                      (room.host?.email && room.host.email === req.user.email);
      const isAdmin = req.user.role === 'admin';

      if (!isOwner && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to end this room.'
        });
      }
    }

    room.status = 'ENDED';
    room.endedAt = new Date();
    if (room.participants) {
      room.participants.forEach(p => {
        if (p.status === 'MONITORING' || p.status === 'VERIFYING') {
          p.status = 'COMPLETED';
        }
      });
    }
    await room.save();

    // Mark active sessions for this room as COMPLETED
    await Session.updateMany(
      { roomId: room.roomId, status: { $in: ['ACTIVE', 'LIVE', 'WARNING', 'READY', 'MONITORING'] } },
      { $set: { status: 'COMPLETED', endTime: new Date() } }
    );

    // Auto-generate/finalize student reports for room participant sessions
    try {
      const Report = require('../models/Report');
      const Alert = require('../models/Alert');
      if (room.participants && room.participants.length > 0) {
        for (const p of room.participants) {
          if (p.sessionId) {
            const existingReport = await Report.findOne({ sessionId: p.sessionId });
            if (!existingReport) {
              const session = await Session.findOne({ sessionId: p.sessionId });
              const alerts = await Alert.find({ sessionId: p.sessionId });
              const phoneDetections = alerts.filter(a => a.type === 'PHONE_DETECTED' || a.type === 'MOBILE_PHONE_DETECTED').length;
              const violationAlerts = alerts.filter(a => ['CRITICAL', 'HIGH', 'MEDIUM'].includes(String(a.severity).toUpperCase()));
              let score = Math.max(0, Math.min(100, 100 - (phoneDetections * 25) - (violationAlerts.length * 5)));
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
              await Report.create({
                reportId: `RPT-${Date.now().toString().slice(-6)}`,
                sessionId: p.sessionId,
                roomId: room.roomId,
                roomTitle: room.title,
                candidateId: p.id,
                userName: p.name || session?.userName || 'Candidate',
                userEmail: p.email || session?.userEmail || '',
                sessionType: room.mode || 'EXAM',
                mode: room.mode || 'EXAM',
                startTime: session?.startTime || p.joinedAt || new Date(),
                endTime: room.endedAt,
                durationSeconds: session?.startTime ? Math.max(0, Math.round((room.endedAt - new Date(session.startTime)) / 1000)) : 0,
                overallIntegrityScore: score,
                riskLevel,
                totalViolations: violationAlerts.length,
                phoneDetections,
                identityMismatchCount: alerts.filter(a => a.type === 'IDENTITY_MISMATCH').length,
                identityStatus: p.identityStatus || 'VERIFIED',
                faceVerified: p.identityStatus === 'VERIFIED',
                livenessPassed: p.liveness !== 'SPOOF',
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
            }
          }
        }
      }
    } catch (err) {
      console.warn('[RoomEnd] Auto report generation notice:', err.message);
    }

    const io = req.app.get('io');
    const ownerId = room.ownerId || room.createdBy || room.hostUserId || room.host?.id;

    if (io) {
      const endPayload = {
        roomId: room.roomId,
        status: 'ENDED',
        message: 'The proctoring host has concluded this session.',
        endedAt: room.endedAt,
      };
      io.to(`room:${room.roomId}`).emit('ROOM_ENDED', endPayload);
      io.to(`room:${room.roomId}`).emit('SESSION_COMPLETED', endPayload);
      io.to(`proctor:${room.roomId}`).emit('ROOM_ENDED', endPayload);
      io.to(`proctor:${room.roomId}`).emit('room_ended', endPayload);
      io.to(`room_${room.roomId}`).emit('ROOM_ENDED', endPayload);
      io.to(`room_${room.roomId}`).emit('room_ended', endPayload);
      io.to(`proctor:${room.roomId}`).emit('SESSION_COMPLETED', endPayload);
      io.to(`room_${room.roomId}`).emit('SESSION_COMPLETED', endPayload);

      if (ownerId) {
        io.to(`user:${ownerId}`).emit('ROOM_ENDED', endPayload);
        io.to(`user:${ownerId}`).emit('room_ended', endPayload);
        io.to(`user:${ownerId}`).emit('SESSION_COMPLETED', endPayload);
      }
    }

    res.json({
      success: true,
      message: `Proctor room ${room.roomId} ended successfully.`,
      room: {
        ...room.toObject(),
        id: room.roomId,
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
