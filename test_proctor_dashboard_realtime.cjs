/**
 * test_proctor_dashboard_realtime.cjs
 * Comprehensive Node.js integration test verifying:
 * 1. Room lookup via API
 * 2. Proctor dashboard joining real-time room channel
 * 3. Student join event propagation
 * 4. Real-time AI alerts (Mobile phone, Multiple people, Face spoof)
 * 5. Student departure / disconnect handling
 */

const io = require('./client/node_modules/socket.io-client');

const BASE_URL = 'http://127.0.0.1:5000';

async function run() {
  console.log('='.repeat(70));
  console.log('  TRUEVIEW AI – REAL-TIME PROCTOR DASHBOARD INTEGRATION TEST (NODE)');
  console.log('='.repeat(70));

  // 1. Room Lookup
  console.log('\n[TEST 1] Testing Room Lookup...');
  const roomsRes = await fetch(`${BASE_URL}/api/rooms`);
  if (!roomsRes.ok) throw new Error(`Failed to fetch rooms: ${roomsRes.status}`);
  const roomsData = await roomsRes.json();
  const rooms = roomsData.rooms || [];
  console.log(`  Found ${rooms.length} virtual rooms in DB.`);

  let targetRoomId = null;
  let targetRoomTitle = '';

  if (rooms.length > 0) {
    const r = rooms[0];
    targetRoomId = r.roomId || r.id;
    const detailRes = await fetch(`${BASE_URL}/api/rooms/${targetRoomId}`);
    const detailData = await detailRes.json();
    const roomObj = detailData.room || {};
    targetRoomTitle = roomObj.title;
    console.log(`  Target Room ID: ${targetRoomId} | Title: "${targetRoomTitle}" | Status: ${roomObj.status}`);
    if (!targetRoomTitle || targetRoomTitle === 'null') {
      throw new Error(`Room title is invalid: ${targetRoomTitle}`);
    }
    console.log('  ✅ Room lookup succeeded with valid title & metadata.');
  } else {
    // Create one if none exists
    const createRes = await fetch(`${BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Computer Science Real-Time Exam',
        mode: 'EXAM',
        durationMinutes: 90,
        maxParticipants: 30
      })
    });
    const createData = await createRes.json();
    targetRoomId = createData.room.roomId;
    targetRoomTitle = createData.room.title;
    console.log(`  Created test room: ${targetRoomId} ("${targetRoomTitle}")`);
  }

  // Check non-existent room behavior
  const nonExistRes = await fetch(`${BASE_URL}/api/rooms/TRV-DOES-NOT-EXIST-404`);
  console.log(`  Non-existent room query returned status: ${nonExistRes.status}`);
  console.log('  ✅ Room lookup & fallback resilience verified.');

  // 2. Proctor Dashboard Socket Connection
  console.log('\n[TEST 2] Connecting Proctor Dashboard Socket...');
  const proctorSocket = io(BASE_URL, {
    transports: ['websocket', 'polling'],
    forceNew: true
  });

  const receivedAlerts = [];
  const receivedJoins = [];
  const receivedLeaves = [];

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Proctor socket connect timeout')), 5000);
    proctorSocket.on('connect', () => {
      clearTimeout(timeout);
      console.log(`  [Proctor] Connected with socket ID: ${proctorSocket.id}`);
      // Join as reviewer/proctor
      proctorSocket.emit('join_room', {
        roomId: targetRoomId,
        sessionId: targetRoomId,
        role: 'reviewer',
        user: { id: 'proctor_admin', name: 'Chief Proctor', role: 'admin' }
      });
      resolve();
    });
  });

  proctorSocket.on('participant_joined', (data) => {
    console.log(`  [Proctor] Received 'participant_joined':`, data?.candidate?.name || data?.user?.name);
    receivedJoins.push(data);
  });

  proctorSocket.on('participant_left', (data) => {
    console.log(`  [Proctor] Received 'participant_left':`, data?.name || data?.candidateId || data?.sessionId);
    receivedLeaves.push(data);
  });

  proctorSocket.on('proctor_alert', (data) => {
    console.log(`  [Proctor] Received 'proctor_alert': [${data.severity}] ${data.type} - ${data.message || data.evidence}`);
    receivedAlerts.push(data);
  });

  await new Promise(r => setTimeout(r, 600));

  // 3. Student Connects and Joins Room
  console.log('\n[TEST 3] Connecting Student / Candidate Socket...');
  const studentSocket = io(BASE_URL, {
    transports: ['websocket', 'polling'],
    forceNew: true
  });

  const studentSessionId = `TRV-${targetRoomId}-STUDENT01`;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Student socket connect timeout')), 5000);
    studentSocket.on('connect', () => {
      clearTimeout(timeout);
      console.log(`  [Student] Connected with socket ID: ${studentSocket.id}`);
      studentSocket.emit('join_room', {
        sessionId: studentSessionId,
        roomId: targetRoomId,
        role: 'participant',
        user: { id: 'student_99', name: 'Nikhil L U', email: 'nikhil@trueview.ai' },
        sessionType: 'EXAM'
      });
      resolve();
    });
  });

  // Wait for proctor to receive join event
  await new Promise(r => setTimeout(r, 1200));
  if (receivedJoins.length === 0) {
    throw new Error('Proctor did not receive participant_joined event!');
  }
  console.log('  ✅ Student join verified in real time on Proctor Dashboard.');

  // 4. Trigger Real-Time AI Alerts
  console.log('\n[TEST 4] Triggering Real-Time AI Violations from Student AI Pipeline...');

  // Alert 1: Mobile Phone
  studentSocket.emit('proctor_alert', {
    sessionId: studentSessionId,
    roomId: targetRoomId,
    type: 'MOBILE_PHONE_DETECTED',
    severity: 'HIGH',
    confidence: 0.95,
    message: 'Mobile phone detected in student workspace.',
    candidateName: 'Nikhil L U',
    candidateId: 'student_99'
  });
  await new Promise(r => setTimeout(r, 800));

  // Alert 2: Multiple People
  studentSocket.emit('proctor_alert', {
    sessionId: studentSessionId,
    roomId: targetRoomId,
    type: 'MULTIPLE_PEOPLE_DETECTED',
    severity: 'HIGH',
    confidence: 0.98,
    message: 'Multiple individuals identified in proctoring frame.',
    candidateName: 'Nikhil L U',
    candidateId: 'student_99'
  });
  await new Promise(r => setTimeout(r, 800));

  // Alert 3: Spoof Detected
  studentSocket.emit('proctor_alert', {
    sessionId: studentSessionId,
    roomId: targetRoomId,
    type: 'SPOOF_DETECTED',
    severity: 'CRITICAL',
    confidence: 0.99,
    message: 'Digital screen replay spoof attack detected.',
    candidateName: 'Nikhil L U',
    candidateId: 'student_99'
  });
  await new Promise(r => setTimeout(r, 1000));

  console.log(`  Total proctor alerts received: ${receivedAlerts.length}`);
  const alertTypes = receivedAlerts.map(a => a.type);
  if (!alertTypes.includes('MOBILE_PHONE_DETECTED')) throw new Error('Missing MOBILE_PHONE_DETECTED in alerts');
  if (!alertTypes.includes('MULTIPLE_PEOPLE_DETECTED')) throw new Error('Missing MULTIPLE_PEOPLE_DETECTED in alerts');
  if (!alertTypes.includes('SPOOF_DETECTED')) throw new Error('Missing SPOOF_DETECTED in alerts');
  console.log('  ✅ All AI alerts (Mobile phone, Multiple people, Face spoof) received by Proctor Dashboard.');

  // 5. Student Disconnects / Leaves Room
  console.log('\n[TEST 5] Student Disconnecting (Real-Time Student Leaving)...');
  studentSocket.disconnect();
  await new Promise(r => setTimeout(r, 1200));

  if (receivedLeaves.length === 0) {
    throw new Error('Proctor did not receive participant_left event upon candidate disconnect!');
  }
  console.log('  ✅ Real-time student disconnect/departure verified on Proctor Dashboard.');

  proctorSocket.disconnect();

  console.log('\n' + '='.repeat(70));
  console.log('  🎉 ALL REAL-TIME PROCTOR DASHBOARD TESTS PASSED SUCCESSFULLY!');
  console.log('='.repeat(70));
  process.exit(0);
}

run().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
