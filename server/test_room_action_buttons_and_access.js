const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Room = require('./models/Room');
const Session = require('./models/Session');

const API_BASE = 'http://127.0.0.1:5000/api';

async function runTests() {
  console.log('====================================================');
  console.log('TESTING VIRTUAL ROOM ACTIONS, ROLES & ACCESS CONTROL');
  console.log('====================================================\n');

  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/trueview');

    // 1. Authenticate Host User (admin)
    console.log('[TEST 1] Authenticating Host user...');
    const hostUser = await User.findOne({ email: 'admin@trueview.ai' });
    if (!hostUser) throw new Error('Host user not found');
    const hostToken = jwt.sign({ id: hostUser._id }, process.env.JWT_SECRET || 'trueview-dev-secret-key-329487293847293847', { expiresIn: '1d' });
    const hostHeaders = { headers: { Authorization: `Bearer ${hostToken}` } };
    console.log(`✓ Host Authenticated: ${hostUser.fullName} (Role: ${hostUser.role})\n`);

    // 2. Authenticate / Create Normal Registered Participant (student)
    console.log('[TEST 2] Authenticating normal registered candidate...');
    let candidateUser = await User.findOne({ email: 'student@example.com' });
    if (!candidateUser) {
      candidateUser = await User.create({
        fullName: 'Jane Doe',
        email: 'student@example.com',
        password: 'Password123!',
        role: 'user',
        status: 'Active',
        registrationStatus: 'ACTIVE',
        faceRegistered: true,
        voiceRegistered: true,
        faceEmbeddings: [new Array(128).fill(0.1)],
      });
    } else {
      candidateUser.status = 'Active';
      candidateUser.registrationStatus = 'ACTIVE';
      candidateUser.faceRegistered = true;
      await candidateUser.save();
    }
    const candidateToken = jwt.sign({ id: candidateUser._id }, process.env.JWT_SECRET || 'trueview-dev-secret-key-329487293847293847', { expiresIn: '1d' });
    const candidateHeaders = { headers: { Authorization: `Bearer ${candidateToken}` } };
    console.log(`✓ Candidate Authenticated: ${candidateUser.fullName} (Role: ${candidateUser.role})\n`);

    // 3. Create an ACTIVE Room with capacity of 1
    console.log('[TEST 3] Host creates a proctoring room (maxParticipants: 1)...');
    const createRes = await axios.post(`${API_BASE}/rooms`, {
      title: 'Chemistry Midterm Exam',
      mode: 'EXAM',
      maxParticipants: 1,
      durationMinutes: 60,
      voiceAlerts: true
    }, hostHeaders);

    const room = createRes.data.room;
    const roomId = room.roomId || room.id;
    console.log(`✓ Room Created: ${room.title} (ID: ${roomId}, JoinCode: ${room.joinCode})\n`);

    // 4. Test GET /api/rooms list endpoint
    console.log('[TEST 4] Testing GET /api/rooms for candidate...');
    const listRes = await axios.get(`${API_BASE}/rooms`, candidateHeaders);
    console.log(`✓ Fetched ${listRes.data.count} rooms successfully.`);
    const fetchedRoom = listRes.data.rooms.find(r => (r.roomId || r.id) === roomId);
    if (!fetchedRoom) throw new Error('Created room not found in rooms list');
    console.log(`✓ Room in list: ${fetchedRoom.title} | Status: ${fetchedRoom.status} | Participants: ${fetchedRoom.participantsCount}/${fetchedRoom.maxParticipants}\n`);

    // 5. Test Public Room Endpoint
    console.log('[TEST 5] Testing GET /api/rooms/:roomId/public without authentication...');
    const publicRes = await axios.get(`${API_BASE}/rooms/${roomId}/public?token=${room.joinCode}`);
    console.log(`✓ Public Room Details: Title: "${publicRes.data.room.title}", Mode: ${publicRes.data.room.mode}, JoinUrl: ${publicRes.data.room.joinUrl}\n`);

    // 6. Test Unauthenticated Join Blocked
    console.log('[TEST 6] Testing unauthenticated join attempt...');
    try {
      await axios.post(`${API_BASE}/rooms/${roomId}/join`, { token: room.joinCode });
      throw new Error('Unauthenticated join should have been blocked!');
    } catch (err) {
      if (err.response && err.response.status === 401) {
        console.log('✓ Unauthenticated join correctly rejected with HTTP 401 Unauthorized.\n');
      } else {
        throw err;
      }
    }

    // 7. Test Registered Candidate Join
    console.log('[TEST 7] Testing registered candidate join...');
    const joinRes = await axios.post(`${API_BASE}/rooms/${roomId}/join`, {
      token: room.joinCode,
      mode: 'EXAM',
      title: room.title
    }, candidateHeaders);

    console.log(`✓ Candidate Joined Successfully!`);
    console.log(`  Session ID: ${joinRes.data.sessionId}`);
    console.log(`  Room Status: ${joinRes.data.roomStatus}`);
    console.log(`  Participants Count: ${joinRes.data.participantsCount}\n`);

    // 8. Test Room Full Rejection
    console.log('[TEST 8] Testing 2nd participant join when room is full (capacity = 1)...');
    let secondUser = await User.findOne({ email: 'second_candidate@example.com' });
    if (!secondUser) {
      secondUser = await User.create({
        fullName: 'Second Candidate',
        email: 'second_candidate@example.com',
        password: 'Password123!',
        role: 'user',
        status: 'Active',
        registrationStatus: 'ACTIVE',
        faceRegistered: true,
      });
    } else {
      secondUser.status = 'Active';
      secondUser.registrationStatus = 'ACTIVE';
      secondUser.faceRegistered = true;
      await secondUser.save();
    }
    const secondToken = jwt.sign({ id: secondUser._id }, process.env.JWT_SECRET || 'trueview-dev-secret-key-329487293847293847', { expiresIn: '1d' });
    const secondHeaders = { headers: { Authorization: `Bearer ${secondToken}` } };

    try {
      await axios.post(`${API_BASE}/rooms/${roomId}/join`, {
        token: room.joinCode,
        mode: 'EXAM'
      }, secondHeaders);
      throw new Error('Join should have been rejected for full room!');
    } catch (err) {
      if (err.response && err.response.status === 400) {
        console.log(`✓ Full room join correctly rejected: "${err.response.data.message}"\n`);
      } else {
        throw err;
      }
    }

    // 9. Test End Room & Rejection
    console.log('[TEST 9] Ending room & testing join on ENDED room...');
    await axios.post(`${API_BASE}/rooms/${roomId}/end`, {}, hostHeaders);
    console.log('✓ Room marked as ENDED by host.');

    try {
      await axios.post(`${API_BASE}/rooms/${roomId}/join`, {
        token: room.joinCode,
        mode: 'EXAM'
      }, candidateHeaders);
      throw new Error('Join should have been rejected for ended room!');
    } catch (err) {
      if (err.response && err.response.status === 400) {
        console.log(`✓ Ended room join correctly rejected: "${err.response.data.message}"\n`);
      } else {
        throw err;
      }
    }

    console.log('====================================================');
    console.log('ALL ROOM ACTION & ACCESS TESTS PASSED (9/9)!');
    console.log('====================================================');
  } catch (error) {
    console.error('Test Failed:', error.response?.data || error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runTests();
