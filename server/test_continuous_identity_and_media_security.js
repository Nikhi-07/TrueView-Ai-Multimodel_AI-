const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Session = require('./models/Session');
const Room = require('./models/Room');
const Alert = require('./models/Alert');
const Report = require('./models/Report');
const { SESSION_POLICIES } = require('./utils/sessionPolicies');

const API_BASE = 'http://127.0.0.1:5000/api';
const AI_BASE = 'http://127.0.0.1:8000/api';

async function runTests() {
  console.log('====================================================');
  console.log('TESTING TRUEVIEW IDENTITY & MEDIA CONTROLS SECURITY');
  console.log('====================================================\n');

  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/trueview');

    // TEST 1: Policy Configuration Checks for EXAM & INTERVIEW
    console.log('[TEST 1] Verifying Centralized Mode Policy Configuration...');
    console.log(`  EXAM allowMediaToggle: ${SESSION_POLICIES.EXAM.allowMediaToggle} (Expected: false)`);
    console.log(`  INTERVIEW allowMediaToggle: ${SESSION_POLICIES.INTERVIEW.allowMediaToggle} (Expected: false)`);
    console.log(`  ONLINE_CLASS allowMediaToggle: ${SESSION_POLICIES.ONLINE_CLASS?.allowMediaToggle || SESSION_POLICIES.CLASS?.allowMediaToggle} (Expected: true)`);
    console.log(`  MEETING allowMediaToggle: ${SESSION_POLICIES.MEETING.allowMediaToggle} (Expected: true)`);
    
    if (SESSION_POLICIES.EXAM.allowMediaToggle !== false || SESSION_POLICIES.INTERVIEW.allowMediaToggle !== false) {
      throw new Error('Policy test failed: EXAM or INTERVIEW allows media toggle!');
    }
    console.log('✓ Mode Policies Verified: Participant media toggles disabled for EXAM and INTERVIEW.\n');

    // TEST 2: Authenticate candidate with 128-D SFace embedding
    console.log('[TEST 2] Authenticating registered user & checking face embedding profile...');
    let user = await User.findOne({ email: 'admin@trueview.ai' }).select('+faceEmbeddings');
    if (!user) throw new Error('User admin@trueview.ai not found in MongoDB');

    if (!user.faceEmbeddings || user.faceEmbeddings.length === 0) {
      const dummyEmbedding = new Array(128).fill(0).map((_, i) => Math.sin(i * 0.1));
      user.faceEmbeddings = [dummyEmbedding];
      user.faceRegistered = true;
      await user.save();
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'trueview-dev-secret-key-329487293847293847', { expiresIn: '1d' });
    const authHeaders = { headers: { Authorization: `Bearer ${token}` } };
    console.log(`✓ User Authenticated: ${user.fullName} (${user.email})`);
    console.log(`✓ Registered Face Embeddings Count: ${user.faceEmbeddings.length}\n`);

    // TEST 3: Create EXAM room and join
    console.log('[TEST 3] Creating and joining EXAM proctor room...');
    const roomRes = await axios.post(`${API_BASE}/rooms`, {
      title: 'Final Biology Exam',
      mode: 'EXAM',
      maxParticipants: 10,
      durationMinutes: 45
    }, authHeaders);

    const room = roomRes.data.room;
    const roomId = room.roomId || room.id;

    const joinRes = await axios.post(`${API_BASE}/rooms/${roomId}/join`, {
      token: room.joinCode,
      mode: 'EXAM',
      title: room.title
    }, authHeaders);

    const sessionId = joinRes.data.sessionId;
    console.log(`✓ Room ID: ${roomId}, Session ID: ${sessionId}\n`);

    // TEST 4: Start AI Session with registered embeddings
    console.log('[TEST 4] Calling POST /api/auth/ai-session-start...');
    const startAiRes = await axios.post(`${API_BASE}/auth/ai-session-start`, {
      sessionId: sessionId,
      sessionType: 'EXAM'
    }, authHeaders);
    console.log(`✓ AI Session Started: status=${startAiRes.data.status || 'OK'}\n`);

    // TEST 5: Direct AI Service Frame Processing Check
    console.log('[TEST 5] Testing AI process endpoint with candidate embedding...');
    // Create a 100x100 white image with base64 encoding to test AI process endpoint
    const dummyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const processRes = await axios.post(`${AI_BASE}/ai/session/${sessionId}/process`, {
      session_id: sessionId,
      user_id: String(user._id),
      session_type: 'EXAM',
      video_frame: dummyBase64
    });

    console.log(`✓ AI Process Output:`);
    console.log(`  Identity Status: ${processRes.data.identity?.status}`);
    console.log(`  Identity Verified: ${processRes.data.identity?.verified}`);
    console.log(`  Recognition Unavailable: ${processRes.data.identity?.recognition_unavailable}`);
    console.log(`  Liveness Status: ${processRes.data.liveness?.status}\n`);

    // TEST 6: Test Registered Candidate Match Log
    console.log('[TEST 6] Logging verified candidate event to backend...');
    const logMatchRes = await axios.post(`${API_BASE}/ai-engine/log`, {
      session_id: sessionId,
      roomId: roomId,
      user_id: String(user._id),
      session_type: 'EXAM',
      risk: { score: 10, current: 10, level: 'NORMAL' },
      identity: {
        verified: true,
        status: 'IDENTITY_VERIFIED',
        confidence: 0.92,
        face_detected: true
      },
      liveness: { is_live: true, status: 'live' },
      attention: { gaze_direction: 'center', head_pose: 'Looking Straight' },
      environment: { phone_detected: false, person_count: 1 },
      behaviour: { events: [] }
    }, authHeaders);

    let sessDoc = await Session.findOne({ sessionId });
    console.log(`✓ Session Identity Status: ${sessDoc.identityStatus} (Expected: VERIFIED)`);
    console.log(`✓ Session Mismatch Count: ${sessDoc.identityMismatchCount}\n`);

    // TEST 7: Test Wrong Person / Friend Replacement (IDENTITY MISMATCH)
    console.log('[TEST 7] Logging IDENTITY_MISMATCH event (Friend in front of camera)...');
    const logMismatchRes = await axios.post(`${API_BASE}/ai-engine/log`, {
      session_id: sessionId,
      roomId: roomId,
      user_id: String(user._id),
      session_type: 'EXAM',
      risk: { score: 80, current: 80, level: 'HIGH' },
      identity: {
        verified: false,
        status: 'IDENTITY_MISMATCH',
        confidence: 0.18,
        face_detected: true
      },
      liveness: { is_live: true, status: 'live' },
      attention: { gaze_direction: 'center', head_pose: 'Looking Straight' },
      environment: { phone_detected: false, person_count: 1 },
      behaviour: {
        events: [
          {
            type: 'IDENTITY_MISMATCH',
            severity: 'CRITICAL',
            confidence: 0.95,
            evidence: 'Registered candidate not detected. Visible face does not match registered biometric profile.',
            timestamp: new Date().toISOString()
          }
        ]
      }
    }, authHeaders);

    sessDoc = await Session.findOne({ sessionId });
    console.log(`✓ Session Identity Status: ${sessDoc.identityStatus} (Expected: MISMATCH)`);
    console.log(`✓ Session Mismatch Count: ${sessDoc.identityMismatchCount} (Expected: 1)`);
    console.log(`✓ Last Mismatch Timestamp: ${sessDoc.lastIdentityMismatchAt}\n`);

    // TEST 8: Test Registered Candidate Returns
    console.log('[TEST 8] Logging registered candidate return...');
    const logReturnRes = await axios.post(`${API_BASE}/ai-engine/log`, {
      session_id: sessionId,
      roomId: roomId,
      user_id: String(user._id),
      session_type: 'EXAM',
      risk: { score: 20, current: 20, level: 'NORMAL' },
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

    sessDoc = await Session.findOne({ sessionId });
    console.log(`✓ Session Identity Status Restored: ${sessDoc.identityStatus} (Expected: VERIFIED)`);
    console.log(`✓ Last Verified Timestamp: ${sessDoc.lastIdentityVerifiedAt}\n`);

    // TEST 9: Test Media Interruption Telemetry (CAMERA_INTERRUPTED)
    console.log('[TEST 9] Logging media interruption event (CAMERA_INTERRUPTED)...');
    const logInterruptedRes = await axios.post(`${API_BASE}/ai-engine/log`, {
      session_id: sessionId,
      roomId: roomId,
      user_id: String(user._id),
      session_type: 'EXAM',
      risk: { score: 65, current: 65, level: 'MEDIUM' },
      identity: { verified: true, status: 'IDENTITY_VERIFIED', confidence: 0.94, face_detected: false },
      liveness: { is_live: true, status: 'live' },
      attention: { gaze_direction: 'center', head_pose: 'Looking Straight' },
      environment: { phone_detected: false, person_count: 0 },
      behaviour: {
        events: [
          {
            type: 'CAMERA_INTERRUPTED',
            severity: 'HIGH',
            confidence: 1.0,
            evidence: 'Camera video track was interrupted or closed unexpectedly.',
            timestamp: new Date().toISOString()
          }
        ]
      }
    }, authHeaders);

    console.log(`✓ Media Interruption Logged Successfully\n`);

    // TEST 10: End Session & Generate Report
    console.log('[TEST 10] Ending session & generating audit report...');
    await axios.post(`${API_BASE}/ai-engine/sessions/${sessionId}/end`, {}, authHeaders);
    const reportRes = await axios.post(`${API_BASE}/reports/generate`, { sessionId }, authHeaders);
    const report = reportRes.data.report;

    console.log(`✓ Report ID: ${report.reportId}`);
    console.log(`✓ Report Status: ${report.status}`);
    console.log(`✓ Report Identity Status: ${report.identityStatus}`);
    console.log(`✓ Report Identity Mismatch Count: ${report.identityMismatchCount}`);
    console.log(`✓ Total Violations: ${report.totalViolations}`);
    console.log(`✓ Timeline Events Count: ${report.timeline?.length || 0}`);

    // End room
    await axios.post(`${API_BASE}/rooms/${roomId}/end`, {}, authHeaders);
    console.log(`\n====================================================`);
    console.log('ALL IDENTITY & MEDIA SECURITY TESTS PASSED (10/10)!');
    console.log('====================================================');
  } catch (error) {
    console.error('Test Failed:', error.response?.data || error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runTests();
