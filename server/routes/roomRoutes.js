const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');

// In-memory store for proctoring rooms (persisted during server session)
const rooms = [
  {
    id: 'TRV-1001',
    title: 'Computer Science CS101 Final Exam',
    mode: 'EXAM',
    sessionType: 'EXAM',
    host: 'Dr. Sarah Jenkins',
    status: 'ACTIVE',
    participantsCount: 4,
    maxParticipants: 50,
    voiceAlerts: true,
    warningLimit: 5,
    criticalLimit: 3,
    suspensionLimit: 1,
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
    sessionType: 'INTERVIEW',
    host: 'Tech Hiring Team',
    status: 'ACTIVE',
    participantsCount: 2,
    maxParticipants: 5,
    voiceAlerts: false,
    warningLimit: 8,
    criticalLimit: 5,
    suspensionLimit: 3,
    createdAt: new Date().toISOString(),
    participants: [
      { id: 'cand_5', name: 'Candidate (John Doe)', riskScore: 8, riskLevel: 'NORMAL', gaze: 'center', pose: 'Looking Straight', phoneDetected: false },
      { id: 'cand_6', name: 'Lead Interviewer (Rachel P.)', riskScore: 0, riskLevel: 'NORMAL', gaze: 'center', pose: 'Looking Straight', phoneDetected: false },
    ]
  },
  {
    id: 'TRV-1003',
    title: 'Advanced Machine Learning Lecture & Q&A',
    mode: 'CLASS',
    sessionType: 'CLASS',
    host: 'Prof. Alan Turing',
    status: 'ACTIVE',
    participantsCount: 18,
    maxParticipants: 100,
    voiceAlerts: false,
    warningLimit: 15,
    criticalLimit: 10,
    suspensionLimit: 5,
    createdAt: new Date().toISOString(),
    participants: [
      { id: 'cand_7', name: 'Student (Elena R.)', riskScore: 2, riskLevel: 'NORMAL', gaze: 'center', pose: 'Looking Straight', phoneDetected: false }
    ]
  },
  {
    id: 'TRV-1004',
    title: 'Q3 Product Architecture & Engineering Strategy Sync',
    mode: 'MEETING',
    sessionType: 'MEETING',
    host: 'VP Engineering',
    status: 'ACTIVE',
    participantsCount: 8,
    maxParticipants: 20,
    voiceAlerts: false,
    warningLimit: 20,
    criticalLimit: 15,
    suspensionLimit: 10,
    createdAt: new Date().toISOString(),
    participants: [
      { id: 'cand_8', name: 'Participant (Sam K.)', riskScore: 0, riskLevel: 'NORMAL', gaze: 'center', pose: 'Looking Straight', phoneDetected: false }
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
  const { title, mode, sessionType, maxParticipants, voiceAlerts, requireIdentity, warningLimit, criticalLimit, suspensionLimit, durationMinutes } = req.body;
  const selectedMode = (sessionType || mode || 'EXAM').toUpperCase();
  const newRoom = {
    id: `TRV-${Math.floor(1000 + Math.random() * 9000)}`,
    title: title || 'New Monitored Session',
    mode: selectedMode,
    sessionType: selectedMode,
    host: req.user ? req.user.name : 'Session Host',
    status: 'ACTIVE',
    participantsCount: 1,
    maxParticipants: maxParticipants || 30,
    voiceAlerts: voiceAlerts !== undefined ? voiceAlerts : true,
    requireIdentity: requireIdentity !== undefined ? requireIdentity : true,
    warningLimit: warningLimit || (selectedMode === 'EXAM' ? 5 : selectedMode === 'INTERVIEW' ? 8 : 15),
    criticalLimit: criticalLimit || (selectedMode === 'EXAM' ? 3 : selectedMode === 'INTERVIEW' ? 5 : 10),
    suspensionLimit: suspensionLimit || (selectedMode === 'EXAM' ? 1 : selectedMode === 'INTERVIEW' ? 3 : 5),
    durationMinutes: Number(durationMinutes) > 0 ? Number(durationMinutes) : (selectedMode === 'INTERVIEW' ? 30 : 60),
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
  if (!room) {
    // Dynamically create room object if non-existent so links always work
    const dynamicRoom = {
      id: req.params.roomId,
      title: `Monitored Session ${req.params.roomId}`,
      mode: 'EXAM',
      sessionType: 'EXAM',
      host: 'TrueView Host',
      status: 'ACTIVE',
      participantsCount: 1,
      maxParticipants: 30,
      voiceAlerts: true,
      warningLimit: 5,
      criticalLimit: 3,
      suspensionLimit: 1,
      durationMinutes: 60,
      createdAt: new Date().toISOString(),
      participants: []
    };
    return res.json({ success: true, room: dynamicRoom });
  }
  res.json({ success: true, room });
});

module.exports = router;
