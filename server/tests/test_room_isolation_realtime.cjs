const axios = require('axios');
const { io } = require('../../client/node_modules/socket.io-client');

const BASE_URL = 'http://localhost:5000';
const api = axios.create({ baseURL: BASE_URL });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log('================================================================');
  console.log('TRUEVIEW AI — REAL-TIME VIRTUAL ROOM & DATA ISOLATION TEST SUITE');
  console.log('================================================================\n');

  const ts = Date.now();
  const userAEmail = `teacher_a_${ts}@test.com`;
  const userBEmail = `teacher_b_${ts}@test.com`;
  const studentCEmail = `student_c_${ts}@test.com`;
  const password = 'Password@123';

  async function createAndActivateUser(fullName, email, role) {
    const regRes = await api.post('/api/auth/register', {
      fullName,
      email,
      password,
      phone: '9876543210'
    });
    const pendingToken = regRes.data.pendingToken;

    // Register Face
    const dummyFace = new Array(512).fill(0.01);
    const faceRes = await api.post(
      '/api/auth/register-face',
      { embeddings: [dummyFace] },
      { headers: { Authorization: `Bearer ${pendingToken}` } }
    );
    const pendingVoiceToken = faceRes.data.pendingVoiceToken || faceRes.data.pendingToken;

    // Register Voice
    const dummyVoice = new Array(192).fill(0.02);
    const voiceRes = await api.post(
      '/api/auth/register-voice',
      { embeddings: [dummyVoice] },
      { headers: { Authorization: `Bearer ${pendingVoiceToken}` } }
    );

    const token = voiceRes.data.token;
    const user = voiceRes.data.user || {
      id: String(voiceRes.data._id),
      _id: String(voiceRes.data._id),
      fullName: voiceRes.data.fullName,
      email: voiceRes.data.email,
      role
    };
    return { token, user };
  }

  // 1. REGISTER USER A
  console.log('▶ STEP 1: Registering User A (Teacher)...');
  const { token: tokenA, user: userA } = await createAndActivateUser('Professor Alice', userAEmail, 'teacher');
  const userAId = String(userA._id || userA.id);
  console.log(`  ✓ User A registered & activated. ID: ${userAId}, Email: ${userAEmail}`);

  // Connect Socket for User A to listen to real-time events
  const socketA = io(BASE_URL, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { token: tokenA },
  });

  const eventsA = [];
  socketA.on('connect', () => {
    socketA.emit('subscribe_user_dashboard', { userId: userAId });
  });
  socketA.on('STUDENT_JOINED', (d) => eventsA.push({ event: 'STUDENT_JOINED', data: d }));
  socketA.on('AI_ALERT_CREATED', (d) => eventsA.push({ event: 'AI_ALERT_CREATED', data: d }));
  socketA.on('proctor_alert', (d) => eventsA.push({ event: 'proctor_alert', data: d }));
  socketA.on('STUDENT_LEFT', (d) => eventsA.push({ event: 'STUDENT_LEFT', data: d }));

  // Check User A starts with 0 rooms
  const roomsARes0 = await api.get('/api/rooms', { headers: { Authorization: `Bearer ${tokenA}` } });
  console.log(`  ✓ User A initial room count: ${roomsARes0.data.rooms.length}`);
  if (roomsARes0.data.rooms.length !== 0) {
    throw new Error(`Expected 0 rooms for new User A, got ${roomsARes0.data.rooms.length}`);
  }

  // 2. USER A CREATES ROOM A
  console.log('\n▶ STEP 2: User A creates Room A ("Computer Science Examination")...');
  const createARes = await api.post(
    '/api/rooms',
    {
      title: 'Computer Science Examination',
      mode: 'EXAM',
      maxParticipants: 30,
      durationMinutes: 60,
    },
    { headers: { Authorization: `Bearer ${tokenA}` } }
  );
  const roomA = createARes.data.room;
  const roomAId = roomA.roomId || roomA.id;
  console.log(`  ✓ Room A created. Room ID: ${roomAId}, Title: "${roomA.title}"`);
  console.log(`  ✓ Room A ownerId: ${roomA.ownerId}, createdBy: ${roomA.createdBy}`);
  if (String(roomA.ownerId) !== userAId) {
    throw new Error(`Expected roomA.ownerId (${roomA.ownerId}) to match User A ID (${userAId})`);
  }

  const roomsARes1 = await api.get('/api/rooms', { headers: { Authorization: `Bearer ${tokenA}` } });
  console.log(`  ✓ User A now sees ${roomsARes1.data.rooms.length} room(s)`);
  if (roomsARes1.data.rooms.length !== 1) {
    throw new Error(`Expected User A to see exactly 1 room, got ${roomsARes1.data.rooms.length}`);
  }

  // 3. REGISTER USER B (NEW ACCOUNT)
  console.log('\n▶ STEP 3: Registering User B (Teacher)...');
  const { token: tokenB, user: userB } = await createAndActivateUser('Professor Bob', userBEmail, 'teacher');
  const userBId = String(userB._id || userB.id);
  console.log(`  ✓ User B registered & activated. ID: ${userBId}, Email: ${userBEmail}`);

  // Connect Socket for User B
  const socketB = io(BASE_URL, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { token: tokenB },
  });
  const eventsB = [];
  socketB.on('connect', () => {
    socketB.emit('subscribe_user_dashboard', { userId: userBId });
  });
  socketB.on('STUDENT_JOINED', (d) => eventsB.push({ event: 'STUDENT_JOINED', data: d }));
  socketB.on('AI_ALERT_CREATED', (d) => eventsB.push({ event: 'AI_ALERT_CREATED', data: d }));
  socketB.on('proctor_alert', (d) => eventsB.push({ event: 'proctor_alert', data: d }));

  // USER B MUST SEE ZERO ROOMS
  const roomsBRes0 = await api.get('/api/rooms', { headers: { Authorization: `Bearer ${tokenB}` } });
  console.log(`  ✓ User B initial room count: ${roomsBRes0.data.rooms.length} (MUST BE ZERO)`);
  if (roomsBRes0.data.rooms.length !== 0) {
    throw new Error(`DATA LEAK! User B sees ${roomsBRes0.data.rooms.length} rooms belonging to other users!`);
  }

  // 4. USER B CREATES ROOM B
  console.log('\n▶ STEP 4: User B creates Room B ("Data Structures Midterm")...');
  const createBRes = await api.post(
    '/api/rooms',
    {
      title: 'Data Structures Midterm',
      mode: 'EXAM',
      maxParticipants: 25,
      durationMinutes: 90,
    },
    { headers: { Authorization: `Bearer ${tokenB}` } }
  );
  const roomB = createBRes.data.room;
  const roomBId = roomB.roomId || roomB.id;
  console.log(`  ✓ Room B created. Room ID: ${roomBId}, Title: "${roomB.title}"`);

  // Verify User B sees ONLY Room B
  const roomsBRes1 = await api.get('/api/rooms', { headers: { Authorization: `Bearer ${tokenB}` } });
  console.log(`  ✓ User B room list contains: ${roomsBRes1.data.rooms.map((r) => r.roomId).join(', ')}`);
  if (roomsBRes1.data.rooms.length !== 1 || roomsBRes1.data.rooms[0].roomId !== roomBId) {
    throw new Error(`User B should see ONLY Room B! Found: ${JSON.stringify(roomsBRes1.data.rooms)}`);
  }

  // Verify User A still sees ONLY Room A
  const roomsARes2 = await api.get('/api/rooms', { headers: { Authorization: `Bearer ${tokenA}` } });
  console.log(`  ✓ User A room list contains: ${roomsARes2.data.rooms.map((r) => r.roomId).join(', ')}`);
  if (roomsARes2.data.rooms.length !== 1 || roomsARes2.data.rooms[0].roomId !== roomAId) {
    throw new Error(`User A should see ONLY Room A! Found: ${JSON.stringify(roomsARes2.data.rooms)}`);
  }

  // 5. REGISTER STUDENT C
  console.log('\n▶ STEP 5: Registering Student C...');
  const { token: tokenC, user: userC } = await createAndActivateUser('Student Charlie', studentCEmail, 'student');
  const userCId = String(userC._id || userC.id);
  console.log(`  ✓ Student C registered & activated. ID: ${userCId}, Email: ${studentCEmail}`);

  // Student C joins Room A
  console.log(`\n▶ STEP 6: Student C joins Room A (${roomAId}) via shared link...`);
  const joinRes = await api.post(
    `/api/rooms/${roomAId}/join`,
    { token: roomA.joinToken || createARes.data.joinCode },
    { headers: { Authorization: `Bearer ${tokenC}` } }
  );
  const sessionC = joinRes.data.session;
  const sessionIdC = joinRes.data.sessionId;
  console.log(`  ✓ Student C joined Room A. Session ID: ${sessionIdC}`);

  // Wait 500ms for real-time socket events
  await sleep(500);

  // Check Room A in DB has participantsCount = 1
  const roomADetails = await api.get(`/api/rooms/${roomAId}`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  console.log(`  ✓ Room A active student count: ${roomADetails.data.room.participantsCount}`);
  if (roomADetails.data.room.participantsCount !== 1) {
    throw new Error(`Expected Room A participantsCount = 1, got ${roomADetails.data.room.participantsCount}`);
  }

  // Check User A received real-time STUDENT_JOINED event
  const joinEventA = eventsA.find((e) => e.event === 'STUDENT_JOINED');
  console.log(`  ✓ Real-time event received by User A: ${joinEventA ? 'YES (' + joinEventA.data.studentName + ' joined)' : 'NO'}`);
  if (!joinEventA) {
    throw new Error('User A did NOT receive real-time STUDENT_JOINED event!');
  }

  // Verify User B did NOT receive User A's student join event!
  const joinEventB = eventsB.find((e) => e.event === 'STUDENT_JOINED');
  console.log(`  ✓ Real-time event received by User B: ${joinEventB ? 'LEAK!' : 'NONE (ISOLATED)'}`);
  if (joinEventB) {
    throw new Error('DATA LEAK! User B received Student C joining Room A!');
  }

  // 6. AI DETECTS MOBILE PHONE IN STUDENT C'S SESSION
  console.log('\n▶ STEP 7: AI Engine detects MOBILE_PHONE_DETECTED in Student C session...');
  const alertRes = await api.post(
    '/api/ai-engine/log',
    {
      session_id: sessionIdC,
      user_id: userCId,
      roomId: roomAId,
      session_type: 'EXAM',
      risk: { score: 75, level: 'HIGH' },
      behaviour: {
        events: [
          {
            type: 'MOBILE_PHONE_DETECTED',
            category: 'PROHIBITED_DEVICE',
            severity: 'HIGH',
            evidence: 'YOLO detected smartphone in active testing area',
            confidence: 0.94,
          },
        ],
      },
      environment: { phone_detected: true },
    },
    { headers: { Authorization: `Bearer ${tokenC}` } }
  );
  console.log(`  ✓ AI Engine logged event: ${alertRes.data.success ? 'SUCCESS' : 'FAILED'}`);

  await sleep(500);

  // Check User A received AI_ALERT_CREATED
  const alertEventA = eventsA.find(
    (e) => e.data?.type === 'MOBILE_PHONE_DETECTED' || e.data?.eventType === 'MOBILE_PHONE_DETECTED'
  );
  console.log(`  ✓ Real-time alert received by User A: ${alertEventA ? 'YES (' + alertEventA.data.type + ')' : 'NO'}`);
  if (!alertEventA) {
    throw new Error('User A did NOT receive real-time AI alert!');
  }

  // Check User B received 0 alerts
  const alertEventB = eventsB.find(
    (e) => e.data?.type === 'MOBILE_PHONE_DETECTED' || e.data?.eventType === 'MOBILE_PHONE_DETECTED'
  );
  console.log(`  ✓ Real-time alert received by User B: ${alertEventB ? 'LEAK!' : 'NONE (ISOLATED)'}`);
  if (alertEventB) {
    throw new Error('DATA LEAK! User B received alert belonging to Room A!');
  }

  // 7. STUDENT C FINISHES SESSION & REPORT GENERATION
  console.log('\n▶ STEP 8: Student C completes session and generates report...');
  const repGenRes = await api.post(
    '/api/reports/generate',
    { sessionId: sessionIdC, roomId: roomAId },
    { headers: { Authorization: `Bearer ${tokenC}` } }
  );
  console.log(`  ✓ Report generated. Report ID: ${repGenRes.data.report?.reportId}`);

  // Check Report Visibility
  // User A (Room Owner):
  const repARes = await api.get('/api/reports', { headers: { Authorization: `Bearer ${tokenA}` } });
  const userAHasReport = repARes.data.reports.some((r) => r.sessionId === sessionIdC);
  console.log(`  ✓ User A (Room Owner) can see Student C report: ${userAHasReport ? 'YES' : 'NO'}`);
  if (!userAHasReport) {
    throw new Error("User A (Room Owner) cannot see Student C's report!");
  }

  // Student C:
  const repCRes = await api.get('/api/reports', { headers: { Authorization: `Bearer ${tokenC}` } });
  const studentCHasReport = repCRes.data.reports.some((r) => r.sessionId === sessionIdC);
  console.log(`  ✓ Student C can see own report: ${studentCHasReport ? 'YES' : 'NO'}`);
  if (!studentCHasReport) {
    throw new Error("Student C cannot see their own report!");
  }

  // User B:
  const repBRes = await api.get('/api/reports', { headers: { Authorization: `Bearer ${tokenB}` } });
  const userBHasReport = repBRes.data.reports.some((r) => r.sessionId === sessionIdC);
  console.log(`  ✓ User B can see Student C report: ${userBHasReport ? 'LEAK!' : 'NO (ISOLATED)'}`);
  if (userBHasReport) {
    throw new Error("DATA LEAK! User B can see Student C's report from Room A!");
  }

  // 8. ERROR HANDLING & FORBIDDEN CHECKS (Section 24)
  console.log('\n▶ STEP 9: Testing Error Handling & Security Authorization...');
  // Non-existent room 404 test
  try {
    await api.get('/api/rooms/TRV-DOES-NOT-EXIST-404', { headers: { Authorization: `Bearer ${tokenA}` } });
    throw new Error('TRV-DOES-NOT-EXIST-404 should have returned 404!');
  } catch (err) {
    console.log(`  ✓ GET TRV-DOES-NOT-EXIST-404 returned HTTP ${err.response?.status}: "${err.response?.data?.message}"`);
    if (err.response?.status !== 404) {
      throw new Error(`Expected status 404, got ${err.response?.status}`);
    }
  }

  // User B accessing User A's room dashboard test
  try {
    await api.get(`/api/rooms/${roomAId}`, { headers: { Authorization: `Bearer ${tokenB}` } });
    throw new Error('User B accessing Room A should have returned 403 Forbidden!');
  } catch (err) {
    console.log(`  ✓ User B accessing Room A returned HTTP ${err.response?.status}: "${err.response?.data?.message}"`);
    if (err.response?.status !== 403) {
      throw new Error(`Expected status 403, got ${err.response?.status}`);
    }
  }

  // Clean up sockets
  socketA.disconnect();
  socketB.disconnect();

  console.log('\n================================================================');
  console.log('🎉 ALL INTEGRATION & ISOLATION TESTS PASSED PERFECTLY!');
  console.log('================================================================\n');
}

run().catch((err) => {
  console.error('\n❌ TEST FAILED:', err.message);
  if (err.response?.data) {
    console.error('Response data:', err.response.data);
  }
  process.exit(1);
});
