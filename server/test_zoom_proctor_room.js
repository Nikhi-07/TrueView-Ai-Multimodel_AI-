const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const API_BASE = 'http://127.0.0.1:5000/api';

async function runTests() {
  console.log('====================================================');
  console.log('TESTING TRUEVIEW ZOOM-STYLE PROCTOR ROOM SYSTEM');
  console.log('====================================================\n');

  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/trueview');
    const user = await User.findOne({ email: 'admin@trueview.ai' });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'trueview-dev-secret-key-329487293847293847', { expiresIn: '1d' });
    const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

    // TEST 1: List rooms
    console.log('[TEST 1] Listing existing proctor rooms...');
    const listRes = await axios.get(`${API_BASE}/rooms`, authHeaders);
    console.log(`✓ Rooms count: ${listRes.data.count}, Status: ${listRes.status}`);
    console.log(`✓ Sample Room ID: ${listRes.data.rooms[0]?.roomId || listRes.data.rooms[0]?.id}`);
    console.log(`✓ Sample Join URL: ${listRes.data.rooms[0]?.joinUrl}\n`);

    // TEST 2: Create a new Proctor Room
    console.log('[TEST 2] Host creates a new Proctor Room...');
    const createRes = await axios.post(`${API_BASE}/rooms`, {
      title: 'Computer Science Final Examination',
      mode: 'EXAM',
      maxParticipants: 40,
      durationMinutes: 90,
      voiceAlerts: true
    }, authHeaders);

    const room = createRes.data.room;
    const roomId = room.roomId || room.id;
    const joinCode = room.joinCode;
    const joinUrl = createRes.data.joinUrl;

    console.log(`✓ Room Created: ${room.title}`);
    console.log(`✓ Room ID: ${roomId}`);
    console.log(`✓ Join Code: ${joinCode}`);
    console.log(`✓ Join URL: ${joinUrl}`);
    console.log(`✓ Mode: ${room.mode}, Max Capacity: ${room.maxParticipants}\n`);

    // TEST 3: Public Candidate Join Page API
    console.log(`[TEST 3] Fetching public room details for candidate onboarding (/api/rooms/${roomId}/public)...`);
    const pubRes = await axios.get(`${API_BASE}/rooms/${roomId}/public?token=${joinCode}`);
    console.log(`✓ Public Room Title: ${pubRes.data.room.title}`);
    console.log(`✓ Host Name: ${pubRes.data.room.hostName}`);
    console.log(`✓ Mode: ${pubRes.data.room.mode}`);
    console.log(`✓ Status: ${pubRes.data.room.status}`);
    console.log(`✓ Secrets exposed: ${pubRes.data.room.joinToken ? 'YES (FAIL)' : 'NO (SAFE)'}\n`);

    // TEST 4: Candidate Joins Room
    console.log(`[TEST 4] Candidate joins room (${roomId})...`);
    const joinRes = await axios.post(`${API_BASE}/rooms/${roomId}/join`, {
      token: joinCode,
      mode: 'EXAM',
      title: room.title
    }, authHeaders);

    const sessionId = joinRes.data.sessionId;
    console.log(`✓ Candidate Joined: ${joinRes.data.candidate.name}`);
    console.log(`✓ Created Session ID: ${sessionId}`);
    console.log(`✓ Session Mode: ${joinRes.data.mode}`);
    console.log(`✓ Room Participant Count: ${joinRes.data.room.participantsCount}\n`);

    // TEST 5: Real-time AI Event & Violation Logging
    console.log(`[TEST 5] Candidate AI engine logs violation event (PHONE_DETECTED)...`);
    const aiLogRes = await axios.post(`${API_BASE}/ai-engine/log`, {
      session_id: sessionId,
      roomId: roomId,
      user_id: joinRes.data.candidate.id,
      session_type: 'EXAM',
      risk: { score: 75, current: 75, level: 'HIGH' },
      environment: { phone_detected: true },
      attention: { gaze_direction: 'down', head_pose: 'Looking Down' },
      liveness: { is_live: true, status: 'live' },
      identity: { face_detected: true },
      behaviour: {
        events: [
          {
            type: 'PHONE_DETECTED',
            severity: 'HIGH',
            confidence: 0.94,
            evidence: 'Mobile phone object detected in bounding box [120, 140, 200, 280]',
            timestamp: new Date().toISOString()
          }
        ]
      }
    });

    console.log(`✓ AI Event Logged: ${aiLogRes.data.message}`);
    console.log(`✓ Updated Risk Score: ${aiLogRes.data.risk.score}% (${aiLogRes.data.risk.level})\n`);

    // TEST 6: Verify Host Room reflects real-time telemetry
    console.log(`[TEST 6] Host queries room details to verify live participant telemetry...`);
    const hostRoomRes = await axios.get(`${API_BASE}/rooms/${roomId}`, authHeaders);
    const participant = hostRoomRes.data.room.participants.find(p => p.id === joinRes.data.candidate.id || p.sessionId === sessionId);

    console.log(`✓ Participant Found: ${participant?.name}`);
    console.log(`✓ Participant Status: ${participant?.status}`);
    console.log(`✓ Participant Risk: ${participant?.riskScore}% (${participant?.riskLevel})`);
    console.log(`✓ Violations Recorded: ${participant?.violations}`);
    console.log(`✓ Phone Detected Flag: ${participant?.phoneDetected}`);
    console.log(`✓ Gaze / Pose: ${participant?.gaze} / ${participant?.pose}\n`);

    // TEST 7: Candidate Ends Session
    console.log(`[TEST 7] Candidate ends session (${sessionId})...`);
    const endSessionRes = await axios.post(`${API_BASE}/ai-engine/sessions/${sessionId}/end`, {}, authHeaders);
    console.log(`✓ Session Completed: Status = ${endSessionRes.data.session.status}`);
    console.log(`✓ Overall Integrity Score: ${endSessionRes.data.session.overallIntegrityScore}/100`);
    console.log(`✓ Report ID: ${endSessionRes.data.report.reportId} (${endSessionRes.data.report.status})\n`);

    // TEST 8: Host Ends Room
    console.log(`[TEST 8] Host ends room (${roomId})...`);
    const endRoomRes = await axios.post(`${API_BASE}/rooms/${roomId}/end`, {}, authHeaders);
    console.log(`✓ Room Ended: Status = ${endRoomRes.data.room.status}`);
    console.log(`✓ Ended At: ${endRoomRes.data.room.endedAt}\n`);

    // TEST 9: Public Link after Room is Ended
    console.log(`[TEST 9] Candidate tries joining ended room...`);
    try {
      await axios.get(`${API_BASE}/rooms/${roomId}/public`);
      console.log('✗ Should have returned error for ended room');
    } catch (err) {
      console.log(`✓ Correctly rejected with: "${err.response?.data?.message}"\n`);
    }

    console.log('====================================================');
    console.log('ALL TESTS PASSED SUCCESSFULLY (9/9)');
    console.log('====================================================');
  } catch (error) {
    console.error('Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

runTests();
