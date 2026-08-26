const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const os = require('os');
const Room = require('../models/Room');
const Session = require('../models/Session');
const { protect } = require('../middleware/authMiddleware');

// Helper to determine the local LAN IP for WhatsApp/mobile shareable links
function getLanIp() {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // Skip over internal (i.e. 127.0.0.1) and non-IPv4 addresses
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

// Ensure default demo rooms exist in MongoDB on startup/first load
async function ensureSeedRooms() {
  try {
    const count = await Room.countDocuments();
    if (count === 0) {
      const demoRooms = [
        {
          roomId: 'TRV-1001',
          joinCode: 'A7K9P2',
          joinToken: 'token_demo_1001',
          title: 'Computer Science CS101 Final Exam',
          mode: 'EXAM',
          sessionType: 'EXAM',
          host: { id: 'host_01', name: 'Dr. Sarah Jenkins', email: 'admin@trueview.ai' },
          status: 'ACTIVE',
          maxParticipants: 50,
          participantsCount: 2,
          voiceAlerts: true,
          warningLimit: 5,
          criticalLimit: 3,
          suspensionLimit: 1,
          durationMinutes: 60,
          participants: [
            { id: 'cand_01', sessionId: 'TRV-1001-DEMO1', name: 'Rahul Sharma', email: 'rahul@example.com', status: 'MONITORING', riskScore: 12, riskLevel: 'NORMAL', violations: 1, liveness: 'LIVE', faceDetected: true, phoneDetected: false },
            { id: 'cand_02', sessionId: 'TRV-1001-DEMO2', name: 'Priya Patel', email: 'priya@example.com', status: 'MONITORING', riskScore: 68, riskLevel: 'HIGH', violations: 7, liveness: 'LIVE', faceDetected: true, phoneDetected: true }
          ]
        },
        {
          roomId: 'TRV-1002',
          joinCode: 'B4M8Q1',
          joinToken: 'token_demo_1002',
          title: 'Senior Full-Stack Architect Technical Interview',
          mode: 'INTERVIEW',
          sessionType: 'INTERVIEW',
          host: { id: 'host_02', name: 'Tech Hiring Team', email: 'hiring@trueview.ai' },
          status: 'ACTIVE',
          maxParticipants: 5,
          participantsCount: 1,
          voiceAlerts: false,
          warningLimit: 8,
          criticalLimit: 5,
          suspensionLimit: 3,
          durationMinutes: 45,
          participants: [
            { id: 'cand_03', sessionId: 'TRV-1002-DEMO3', name: 'Alex Mercer', email: 'alex@example.com', status: 'MONITORING', riskScore: 8, riskLevel: 'NORMAL', violations: 0, liveness: 'LIVE', faceDetected: true, phoneDetected: false }
          ]
        },
        {
          roomId: 'TRV-1003',
          joinCode: 'C9N2X5',
          joinToken: 'token_demo_1003',
          title: 'Advanced Machine Learning Lecture & Q&A',
          mode: 'ONLINE_CLASS',
          sessionType: 'ONLINE_CLASS',
          host: { id: 'host_03', name: 'Prof. Alan Turing', email: 'alan@trueview.ai' },
          status: 'ACTIVE',
          maxParticipants: 100,
          participantsCount: 0,
          voiceAlerts: false,
          warningLimit: 15,
          criticalLimit: 10,
          suspensionLimit: 5,
          durationMinutes: 90,
          participants: []
        }
      ];
      await Room.insertMany(demoRooms);
    }
  } catch (err) {
    console.warn('[RoomService] Seed check warning:', err.message);
  }
}
ensureSeedRooms();

// @route   GET /api/rooms
// @desc    List all proctor rooms from MongoDB
// @access  Public / Private
router.get('/', async (req, res, next) => {
  try {
    const rooms = await Room.find().sort({ createdAt: -1 }).lean();
    const lanIp = getLanIp();
    const hostPort = process.env.CLIENT_PORT || '5173';

    const enrichedRooms = rooms.map(r => ({
      ...r,
      id: r.roomId,
      joinUrl: `http://${lanIp}:${hostPort}/join/${r.roomId}?token=${r.joinCode}`,
      hostName: r.host?.name || 'Session Host',
    }));

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
    const token = req.query.token;

    let room = await Room.findOne({
      $or: [
        { roomId: roomId.toUpperCase() },
        { joinCode: roomId.toUpperCase() }
      ]
    }).lean();

    if (!room) {
      return res.status(404).json({
        success: false,
        message: `Proctoring room "${roomId}" was not found. Please check your join link or code.`
      });
    }

    if (room.status === 'ENDED') {
      return res.status(400).json({
        success: false,
        message: `This proctoring session (${room.title}) has already ended.`
      });
    }

    const lanIp = getLanIp();
    const hostPort = process.env.CLIENT_PORT || '5173';

    res.json({
      success: true,
      room: {
        roomId: room.roomId,
        joinCode: room.joinCode,
        title: room.title,
        hostName: room.host?.name || 'Session Host',
        mode: room.mode,
        sessionType: room.sessionType,
        status: room.status,
        maxParticipants: room.maxParticipants,
        participantsCount: room.participantsCount || room.participants?.length || 0,
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
// @desc    Create a new Virtual Proctor Room in MongoDB
// @access  Private (or authenticated fallback)
router.post('/', async (req, res, next) => {
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
    const hostUser = req.user || {};
    const hostInfo = {
      id: hostUser._id ? String(hostUser._id) : (hostUser.id || 'host_admin'),
      name: hostUser.fullName || hostUser.name || 'Dr. Sarah Jenkins',
      email: hostUser.email || 'admin@trueview.ai',
    };

    const lanIp = getLanIp();
    const hostPort = process.env.CLIENT_PORT || '5173';
    const joinUrl = `http://${lanIp}:${hostPort}/join/${generatedRoomId}?token=${joinCode}`;

    const newRoom = await Room.create({
      roomId: generatedRoomId,
      joinCode,
      joinToken,
      title: title?.trim() || 'New Monitored Session',
      host: hostInfo,
      mode: selectedMode,
      sessionType: selectedMode,
      status: 'ACTIVE',
      maxParticipants: Number(maxParticipants) > 0 ? Number(maxParticipants) : 30,
      participantsCount: 0,
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
      joinUrl,
      hostName: hostInfo.name,
    };

    // Broadcast room creation if sockets active
    req.app.get('io')?.emit('ROOM_CREATED', { room: responseRoom });

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
// @desc    Get complete room details including active participants and sessions
// @access  Public / Private
router.get('/:roomId', async (req, res, next) => {
  try {
    const { roomId } = req.params;
    let room = await Room.findOne({
      $or: [
        { roomId: roomId.toUpperCase() },
        { joinCode: roomId.toUpperCase() }
      ]
    });

    const lanIp = getLanIp();
    const hostPort = process.env.CLIENT_PORT || '5173';

    if (!room) {
      // Create a fallback room record so links never crash
      const selectedMode = 'EXAM';
      room = await Room.create({
        roomId: roomId.toUpperCase(),
        joinCode: generateJoinCode(),
        joinToken: crypto.randomBytes(16).toString('hex'),
        title: `Monitored Session ${roomId}`,
        host: { id: 'host_01', name: 'Session Host', email: 'admin@trueview.ai' },
        mode: selectedMode,
        sessionType: selectedMode,
        status: 'ACTIVE',
        maxParticipants: 30,
        participantsCount: 0,
        participants: []
      });
    }

    const roomObj = room.toObject();
    roomObj.id = roomObj.roomId;
    roomObj.joinUrl = `http://${lanIp}:${hostPort}/join/${roomObj.roomId}?token=${roomObj.joinCode}`;
    roomObj.hostName = roomObj.host?.name || 'Session Host';

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
    const { token, mode, title } = req.body;

    // Verify user is authenticated and registered
    if (!req.user || req.user.status !== 'Active' || req.user.registrationStatus === 'PENDING_FACE_REGISTRATION' || req.user.registrationStatus === 'PENDING_VOICE_REGISTRATION') {
      return res.status(403).json({
        success: false,
        message: 'Your account is not active or registered. Please login or complete registration before joining.'
      });
    }

    let room = await Room.findOne({
      $or: [
        { roomId: roomId.toUpperCase() },
        { joinCode: roomId.toUpperCase() }
      ]
    });

    if (!room) {
      const selectedMode = (mode || 'EXAM').toUpperCase();
      room = await Room.create({
        roomId: roomId.toUpperCase(),
        joinCode: generateJoinCode(),
        joinToken: crypto.randomBytes(16).toString('hex'),
        title: title || `Monitored Session ${roomId}`,
        host: { id: 'host_01', name: 'TrueView Host', email: 'admin@trueview.ai' },
        mode: selectedMode,
        sessionType: selectedMode,
        status: 'ACTIVE',
        maxParticipants: 30,
        participantsCount: 0,
        participants: []
      });
    }

    if (room.status === 'ENDED') {
      return res.status(400).json({
        success: false,
        message: `Room ${room.roomId} has ended and is no longer accepting candidates.`
      });
    }

    const currentCount = room.participants ? room.participants.filter(p => p.status !== 'LEFT').length : (room.participantsCount || 0);
    if (currentCount >= room.maxParticipants) {
      return res.status(400).json({
        success: false,
        message: `Room ${room.roomId} has reached its maximum capacity of ${room.maxParticipants} candidates.`
      });
    }

    // Authoritative Candidate Identity from req.user (Never trust client-submitted names/emails)
    const effectiveName = req.user.fullName || req.user.name || 'Registered Candidate';
    const effectiveEmail = req.user.email;
    const effectiveId = String(req.user._id);
    const sessionMode = (room.mode || room.sessionType || 'EXAM').toUpperCase();

    // Unique authoritative Session ID
    const sessionId = `TRV-${room.roomId}-${Date.now().toString(36).toUpperCase()}`;

    // Create MongoDB Session
    const session = await Session.create({
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
      warningLimit: room.warningLimit || 5,
      criticalLimit: room.criticalLimit || 3,
      suspensionLimit: room.suspensionLimit || 1,
    });

    // Update Room Participants in MongoDB
    const existingIndex = room.participants.findIndex(p => p.id === effectiveId || p.email === effectiveEmail);
    const participantData = {
      id: effectiveId,
      sessionId,
      name: effectiveName,
      email: effectiveEmail,
      status: 'MONITORING',
      riskScore: 0,
      riskLevel: 'NORMAL',
      violations: 0,
      liveness: 'LIVE',
      faceDetected: true,
      gaze: 'center',
      pose: 'Looking Straight',
      phoneDetected: false,
      joinedAt: new Date(),
    };

    if (existingIndex >= 0) {
      room.participants[existingIndex] = participantData;
    } else {
      room.participants.push(participantData);
    }

    room.participantsCount = room.participants.filter(p => p.status !== 'LEFT').length;
    await room.save();

    // Emit Socket.IO updates to proctor host room
    const io = req.app.get('io');
    if (io) {
      const payload = {
        roomId: room.roomId,
        sessionId,
        candidate: participantData,
        participantsCount: room.participantsCount,
        participants: room.participants,
      };
      io.to(`proctor:${room.roomId}`).emit('participant_joined', payload);
      io.to(`room_${room.roomId}`).emit('participant_joined', payload);
      io.to(`proctor:${room.roomId}`).emit('room_participants_updated', {
        participantsCount: room.participantsCount,
        participants: room.participants,
      });
      io.to(`room_${room.roomId}`).emit('room_participants_updated', {
        participantsCount: room.participantsCount,
        participants: room.participants,
      });
    }

    res.json({
      success: true,
      message: 'Joined room successfully',
      sessionId,
      roomId: room.roomId,
      room: {
        ...room.toObject(),
        id: room.roomId,
      },
      mode: sessionMode,
      candidate: participantData,
      session,
      status: 'ACTIVE',
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/rooms/:roomId/leave
// @desc    Candidate leaves room: update status and decrement active count
// @access  Public / Private
router.post('/:roomId/leave', async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const { candidateId, sessionId } = req.body;
    const userId = candidateId || (req.user ? String(req.user._id || req.user.id) : null);

    const room = await Room.findOne({
      $or: [
        { roomId: roomId.toUpperCase() },
        { joinCode: roomId.toUpperCase() }
      ]
    });

    if (room) {
      if (room.participants && room.participants.length > 0) {
        room.participants.forEach(p => {
          if ((userId && p.id === userId) || (sessionId && p.sessionId === sessionId)) {
            p.status = 'LEFT';
            p.leftAt = new Date();
          }
        });
      }

      room.participantsCount = room.participants.filter(p => p.status !== 'LEFT').length;
      await room.save();

      const io = req.app.get('io');
      if (io) {
        const payload = {
          roomId: room.roomId,
          candidateId: userId,
          sessionId,
          participantsCount: room.participantsCount,
          participants: room.participants,
        };
        io.to(`proctor:${room.roomId}`).emit('participant_left', payload);
        io.to(`room_${room.roomId}`).emit('participant_left', payload);
        io.to(`proctor:${room.roomId}`).emit('room_participants_updated', {
          participantsCount: room.participantsCount,
          participants: room.participants,
        });
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
router.post('/:roomId/end', async (req, res, next) => {
  try {
    const { roomId } = req.params;

    const room = await Room.findOne({
      $or: [
        { roomId: roomId.toUpperCase() },
        { joinCode: roomId.toUpperCase() }
      ]
    });

    if (!room) {
      return res.status(404).json({ success: false, message: 'Room not found' });
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
      { roomId: room.roomId, status: { $in: ['ACTIVE', 'LIVE', 'WARNING', 'READY'] } },
      { $set: { status: 'COMPLETED', endTime: new Date() } }
    );

    const io = req.app.get('io');
    if (io) {
      const endPayload = {
        roomId: room.roomId,
        status: 'ENDED',
        message: 'The proctoring host has concluded this session.',
        endedAt: room.endedAt,
      };
      io.to(`proctor:${room.roomId}`).emit('room_ended', endPayload);
      io.to(`room_${room.roomId}`).emit('room_ended', endPayload);
      io.to(`proctor:${room.roomId}`).emit('SESSION_COMPLETED', endPayload);
      io.to(`room_${room.roomId}`).emit('SESSION_COMPLETED', endPayload);
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
