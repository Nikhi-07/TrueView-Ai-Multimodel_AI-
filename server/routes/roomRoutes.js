const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');

// In-memory store for proctoring rooms (persisted during server session)
const rooms = [
  {
    id: 'TRV-1001',
    title: 'Computer Science CS101 Final Exam',
    mode: 'EXAM',
    host: 'Dr. Sarah Jenkins',
    status: 'ACTIVE',
    participantsCount: 4,
    maxParticipants: 50,
    voiceAlerts: true,
    createdAt: new Date().toISOString(),
    participants: [
      { id: 'cand_1', name: 'Candidate #01 (Alex M.)', riskScore: 12, riskLevel: 'NORMAL', gaze: 'center', pose: 'Looking Straight', phoneDetected: false },
      { id: 'cand_2', name: 'Candidate #02 (David K.)', riskScore: 78, riskLevel: 'HIGH-RISK EVENT', gaze: 'right', pose: 'Looking Right', phoneDetected: true },
      { id: 'cand_3', name: 'Candidate #03 (Sophia L.)', riskScore: 5, riskLevel: 'NORMAL', gaze: 'center', pose: 'Looking Straight', phoneDetected: false },
      { id: 'cand_4', name: 'Candidate #04 (Marcus R.)', riskScore: 28, riskLevel: 'REVIEW RECOMMENDED', gaze: 'down', pose: 'Looking Down', phoneDetected: false },
    ]
  },
  {
    id: 'TRV-1002',
    title: 'Senior Full-Stack Architect Technical Interview',
    mode: 'INTERVIEW',
    host: 'Tech Hiring Team',
    status: 'ACTIVE',
    participantsCount: 2,
    maxParticipants: 5,
    voiceAlerts: false,
    createdAt: new Date().toISOString(),
    participants: [
      { id: 'cand_5', name: 'Candidate (John Doe)', riskScore: 8, riskLevel: 'NORMAL', gaze: 'center', pose: 'Looking Straight', phoneDetected: false },
      { id: 'cand_6', name: 'Lead Interviewer (Rachel P.)', riskScore: 0, riskLevel: 'NORMAL', gaze: 'center', pose: 'Looking Straight', phoneDetected: false },
    ]
  }
];

// @route   GET /api/rooms
// @desc    List all active proctor rooms
router.get('/', (req, res) => {
  res.json({ success: true, count: rooms.length, rooms });
});

// @route   POST /api/rooms
// @desc    Create a new Virtual Proctor Room
router.post('/', (req, res) => {
  const { title, mode, maxParticipants, voiceAlerts, requireIdentity } = req.body;
  const newRoom = {
    id: `TRV-${Math.floor(1000 + Math.random() * 9000)}`,
    title: title || 'New Proctoring Session',
    mode: mode || 'EXAM',
    host: req.user ? req.user.name : 'Proctor Host',
    status: 'ACTIVE',
    participantsCount: 1,
    maxParticipants: maxParticipants || 30,
    voiceAlerts: voiceAlerts !== undefined ? voiceAlerts : true,
    requireIdentity: requireIdentity !== undefined ? requireIdentity : true,
    createdAt: new Date().toISOString(),
    participants: [
      { id: 'host_01', name: 'Host (You)', riskScore: 0, riskLevel: 'NORMAL', gaze: 'center', pose: 'Looking Straight', phoneDetected: false }
    ]
  };
  rooms.unshift(newRoom);
  res.status(201).json({ success: true, room: newRoom });
});

// @route   GET /api/rooms/:roomId
// @desc    Get room details
router.get('/:roomId', (req, res) => {
  const room = rooms.find(r => r.id === req.params.roomId);
  if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
  res.json({ success: true, room });
});

module.exports = router;
