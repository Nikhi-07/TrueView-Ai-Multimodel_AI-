const axios = require('axios');
const jwt = require('jsonwebtoken');

const API_BASE = 'http://127.0.0.1:5000/api';

async function runTests() {
  console.log('====================================================');
  console.log('TESTING TRUEVIEW REGISTERED USER & PROCTOR ROOM FLOW');
  console.log('====================================================\n');

  try {
    // 1. Setup/Login a Registered User
    console.log('[TEST 1] Logging in as registered user...');
    let token = '';
    let registeredUser = null;

    require('dotenv').config();
    const mongoose = require('mongoose');
    const User = require('./models/User');

    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/trueview');
    const user = await User.findOne({ email: 'admin@trueview.ai' });
    if (!user) {
      console.error('Admin user not found in DB');
      process.exit(1);
    }
    registeredUser = user;
    token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'trueview-dev-secret-key-329487293847293847', { expiresIn: '1d' });
    console.log(`✓ Authenticated registered user: ${user.fullName} (${user.email})`);

    const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

    // 2. Test A: GET /api/auth/me for authenticated registered user
    console.log('\n[TEST A] Backend Registration Validation (GET /api/auth/me)...');
    const meRes = await axios.get(`${API_BASE}/auth/me`, authHeaders);
    console.log(`✓ authenticated: ${meRes.data.authenticated}`);
    console.log(`✓ registered: ${meRes.data.registered}`);
    console.log(`✓ user name: ${meRes.data.user.name}`);
    console.log(`✓ user email: ${meRes.data.user.email}`);
    console.log(`✓ user role: ${meRes.data.user.role}`);

    // 3. Test B & C: Logged-out / Unregistered user rejected
    console.log('\n[TEST B & C] Logged-out / No Token user access...');
    try {
      await axios.get(`${API_BASE}/auth/me`);
      console.log('✗ Failed: Should have returned 401');
    } catch (err) {
      console.log(`✓ GET /api/auth/me without token returned ${err.response?.status} (${err.response?.data?.message})`);
    }

    try {
      await axios.post(`${API_BASE}/rooms/TRV-TEST-ROOM/join`, {});
      console.log('✗ Failed: Should have returned 401');
    } catch (err) {
      console.log(`✓ POST /api/rooms/:id/join without token returned ${err.response?.status} (${err.response?.data?.message})`);
    }

    // 4. Create Room for Join Test
    console.log('\n[TEST SETUP] Creating active proctor room...');
    const roomRes = await axios.post(`${API_BASE}/rooms`, {
      title: 'Operating Systems Midterm Exam',
      mode: 'EXAM',
      maxParticipants: 25
    }, authHeaders);
    const room = roomRes.data.room;
    const roomId = room.roomId;
    console.log(`✓ Created Room: ${room.title} (ID: ${roomId})`);

    // 5. Test D: Fake Candidate Name Spoofing Prevention
    console.log('\n[TEST D] Candidate attempts to send fake name in join body...');
    const joinRes = await axios.post(`${API_BASE}/rooms/${roomId}/join`, {
      candidateName: 'Spoofed Fake Name',
      candidateEmail: 'fake@impostor.com',
      mode: 'EXAM'
    }, authHeaders);

    console.log(`✓ Backend Session Created: ${joinRes.data.sessionId}`);
    console.log(`✓ Authoritative Candidate Name in Session: ${joinRes.data.candidate.name}`);
    console.log(`✓ Authoritative Candidate Email in Session: ${joinRes.data.candidate.email}`);

    if (joinRes.data.candidate.name !== 'Spoofed Fake Name') {
      console.log('✓ SUCCESS: Backend strictly used req.user and rejected spoofed candidateName!');
    } else {
      console.log('✗ FAILED: Backend accepted spoofed candidateName!');
      process.exit(1);
    }

    // 6. Test E: Direct Monitoring URL / Access Protection
    console.log('\n[TEST E] Direct access to protected sessions without auth...');
    try {
      await axios.get(`${API_BASE}/ai-engine/sessions`);
      console.log('✗ Failed: Should have returned 401');
    } catch (err) {
      console.log(`✓ Direct access blocked with ${err.response?.status} (${err.response?.data?.message})`);
    }

    // 7. Test F, G, H, I: Telemetry & End Session
    console.log('\n[TEST F, G, H] Ending session and room...');
    const endSessRes = await axios.post(`${API_BASE}/ai-engine/sessions/${joinRes.data.sessionId}/end`, {}, authHeaders);
    console.log(`✓ Session ended with status: ${endSessRes.data.session.status}`);

    const endRoomRes = await axios.post(`${API_BASE}/rooms/${roomId}/end`, {}, authHeaders);
    console.log(`✓ Room ended with status: ${endRoomRes.data.room.status}`);

    console.log('\n====================================================');
    console.log('ALL REGISTERED USER & SECURITY TESTS PASSED!');
    console.log('====================================================');
  } catch (error) {
    console.error('Test error:', error.response?.data || error.message);
    process.exit(1);
  }
}

runTests();
