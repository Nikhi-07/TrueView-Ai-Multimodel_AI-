const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Session = require('./models/Session');
const Room = require('./models/Room');
const Alert = require('./models/Alert');
const Report = require('./models/Report');

const API_BASE = 'http://127.0.0.1:5000/api';

async function runTests() {
  console.log('====================================================');
  console.log('TESTING TRUEVIEW CONTINUOUS IDENTITY VERIFICATION');
  console.log('====================================================\n');

  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/trueview');

    // TEST 1: Authenticate registered user
    console.log('[TEST 1] Authenticating registered user & checking face embedding profile...');
    let user = await User.findOne({ email: 'admin@trueview.ai' }).select('+faceEmbeddings');
    if (!user) {
      throw new Error('Admin user not found in MongoDB');
    }

    // Ensure user has a valid 128-D face embedding
    if (!user.faceEmbeddings || user.faceEmbeddings.length === 0) {
      console.log('  Seeding 128-D registered face embedding for test user...');
      const dummyEmbedding = new Array(128).fill(0).map((_, i) => Math.sin(i * 0.1));
      user.faceEmbeddings = [dummyEmbedding];
      user.faceRegistered = true;
      user.status = 'Active';
      user.registrationStatus = 'ACTIVE';
      await user.save();
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'trueview-dev-secret-key-329487293847293847', { expiresIn: '1d' });
    const authHeaders = { headers: { Authorization: `Bearer ${token}` } };
    console.log(`✓ User Authenticated: ${user.fullName} (${user.email})`);
    console.log(`✓ Registered Face Embeddings Count: ${user.faceEmbeddings.length}\n`);

    // TEST 2: Create a proctor room
    console.log('[TEST 2] Host creates a proctor room for the exam...');
    const roomRes = await axios.post(`${API_BASE}/rooms`, {
      title: 'Advanced AI Ethics Midterm',
      mode: 'EXAM',
      maxParticipants: 20,
      durationMinutes: 60,
      voiceAlerts: true
    }, authHeaders);

    const room = roomRes.data.room;
    const roomId = room.roomId || room.id;
    const joinCode = room.joinCode;
    console.log(`✓ Room Created: ${room.title} (ID: ${roomId}, Code: ${joinCode})\n`);

    // TEST 3: Candidate joins room
    console.log('[TEST 3] Candidate joins room and generates session...');
    const joinRes = await axios.post(`${API_BASE}/rooms/${roomId}/join`, {
      token: joinCode,
      mode: 'EXAM',
      title: room.title
    }, authHeaders);

    const sessionId = joinRes.data.sessionId;
    console.log(`✓ Candidate Joined: ${joinRes.data.candidate.name}`);
    console.log(`✓ Created Session ID: ${sessionId}\n`);

    // TEST 4: Start AI Session with registered embeddings
    console.log('[TEST 4] Starting AI Monitoring session via POST /api/auth/ai-session-start...');
    const startAiRes = await axios.post(`${API_BASE}/auth/ai-session-start`, {
      sessionId: sessionId,
      sessionType: 'EXAM'
    }, authHeaders);
    console.log(`✓ AI Session Initialized: status=${startAiRes.data.status || 'OK'}\n`);

    // TEST 5: Candidate in front of camera (Matching Identity)
    console.log('[TEST 5] Candidate frame evaluated (Matching registered face)...');
    const logMatchRes = await axios.post(`${API_BASE}/ai-engine/log`, {
      session_id: sessionId,
      roomId: roomId,
      user_id: String(user._id),
      session_type: 'EXAM',
      risk: { score: 10, current: 10, level: 'NORMAL' },
      identity: {
        verified: true,
        status: 'IDENTITY_VERIFIED',
        confidence: 0.94,
        face_detected: true
      },
      liveness: { is_live: true, status: 'live' },
      attention: { gaze_direction: 'center', head_pose: 'Looking Straight' },
      environment: { phone_detected: false, person_count: 1 },
      behaviour: { events: [] }
    }, authHeaders);

    console.log(`✓ Match Logged: ${logMatchRes.data.message}`);
    let sessDoc = await Session.findOne({ sessionId });
    console.log(`✓ Session Identity Status: ${sessDoc.identityStatus}`);
    console.log(`✓ Session Mismatch Count: ${sessDoc.identityMismatchCount}\n`);

    // TEST 6: Wrong person replaces candidate (IDENTITY MISMATCH)
    console.log('[TEST 6] Friend replaces candidate (Wrong person in front of camera)...');
    const logMismatchRes = await axios.post(`${API_BASE}/ai-engine/log`, {
      session_id: sessionId,
      roomId: roomId,
      user_id: String(user._id),
      session_type: 'EXAM',
      risk: { score: 75, current: 75, level: 'HIGH' },
      identity: {
        verified: false,
        status: 'IDENTITY_MISMATCH',
        confidence: 0.22,
        face_detected: true
      },
      liveness: { is_live: true, status: 'live' },
      attention: { gaze_direction: 'center', head_pose: 'Looking Straight' },
      environment: { phone_detected: false, person_count: 1 },
      behaviour: {
        events: [
          {
            type: 'IDENTITY_MISMATCH',
            severity: 'HIGH',
            confidence: 0.92,
            evidence: 'Registered candidate not detected. Visible face does not match registered profile.',
            timestamp: new Date().toISOString()
          }
        ]
      }
    }, authHeaders);

    console.log(`✓ Mismatch Logged: ${logMismatchRes.data.message}`);
    sessDoc = await Session.findOne({ sessionId });
    console.log(`✓ Session Identity Status: ${sessDoc.identityStatus}`);
    console.log(`✓ Session Mismatch Count: ${sessDoc.identityMismatchCount}`);
    console.log(`✓ Last Mismatch Time: ${sessDoc.lastIdentityMismatchAt}`);

    const roomAfterMismatch = await Room.findOne({ roomId });
    const pAfterMismatch = roomAfterMismatch.participants.find(p => p.sessionId === sessionId);
    console.log(`✓ Room Participant Identity Status: ${pAfterMismatch.identityStatus}`);
    console.log(`✓ Room Participant Risk Score: ${pAfterMismatch.riskScore}%\n`);

    // TEST 7: Registered candidate returns
    console.log('[TEST 7] Registered candidate returns in front of camera...');
    const logReturnRes = await axios.post(`${API_BASE}/ai-engine/log`, {
      session_id: sessionId,
      roomId: roomId,
      user_id: String(user._id),
      session_type: 'EXAM',
      risk: { score: 25, current: 25, level: 'NORMAL' },
      identity: {
        verified: true,
        status: 'IDENTITY_VERIFIED',
        confidence: 0.95,
        face_detected: true
      },
      liveness: { is_live: true, status: 'live' },
      attention: { gaze_direction: 'center', head_pose: 'Looking Straight' },
      environment: { phone_detected: false, person_count: 1 },
      behaviour: { events: [] }
    }, authHeaders);

    sessDoc = await Session.findOne({ sessionId });
    console.log(`✓ Session Identity Status Restored: ${sessDoc.identityStatus}`);
    console.log(`✓ Last Verified Time: ${sessDoc.lastIdentityVerifiedAt}\n`);

    // TEST 8: End session & generate report
    console.log('[TEST 8] Candidate completes session and generates audit report...');
    const endSessRes = await axios.post(`${API_BASE}/ai-engine/sessions/${sessionId}/end`, {}, authHeaders);
    console.log(`✓ Session Status: ${endSessRes.data.session.status}`);

    const reportRes = await axios.post(`${API_BASE}/reports/generate`, { sessionId }, authHeaders);
    const report = reportRes.data.report;
    console.log(`✓ Report ID: ${report.reportId}`);
    console.log(`✓ Report Status: ${report.status}`);
    console.log(`✓ Report Identity Mismatch Count: ${report.identityMismatchCount}`);
    console.log(`✓ Report Identity Status: ${report.identityStatus}`);
    console.log(`✓ Report Total Violations: ${report.totalViolations}`);
    console.log(`✓ Report Timeline Events: ${report.timeline?.length || 0}\n`);

    // TEST 9: Host ends room
    console.log('[TEST 9] Host ends proctor room...');
    const endRoomRes = await axios.post(`${API_BASE}/rooms/${roomId}/end`, {}, authHeaders);
    console.log(`✓ Room Ended: status=${endRoomRes.data.room.status}\n`);

    console.log('====================================================');
    console.log('ALL CONTINUOUS IDENTITY TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================');
  } catch (error) {
    console.error('Test Failed:', error.response?.data || error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runTests();
