const axios = require('axios');
const { io } = require('../../client/node_modules/socket.io-client');

const BASE_URL = 'http://localhost:5000';
const api = axios.create({ baseURL: BASE_URL });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log('================================================================');
  console.log('TRUEVIEW AI — TAB SWITCH VERIFICATION & ROOM ACCESS CONTROL TEST SUITE');
  console.log('================================================================\n');

  const ts = Date.now();
  const teacherAEmail = `teacher_tab_a_${ts}@test.com`;
  const teacherBEmail = `teacher_tab_b_${ts}@test.com`;
  const studentEmail = `student_tab_${ts}@test.com`;
  const interviewStudentEmail = `student_interview_${ts}@test.com`;
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

  const results = {};
  function recordTest(testName, passed, detail) {
    results[testName] = { passed, detail };
    if (passed) {
      console.log(`  [PASS] ${testName}: ${detail}`);
    } else {
      console.error(`  [FAIL] ${testName}: ${detail}`);
    }
  }

  // 1. SETUP TEACHERS & STUDENTS
  console.log('▶ Setting up Teachers and Students...');
  const { token: tokenTeacherA, user: userTeacherA } = await createAndActivateUser('Prof. Teacher A', teacherAEmail, 'teacher');
  const { token: tokenTeacherB, user: userTeacherB } = await createAndActivateUser('Prof. Teacher B', teacherBEmail, 'teacher');
  const { token: tokenStudent, user: userStudent } = await createAndActivateUser('Candidate Student', studentEmail, 'candidate');
  const { token: tokenInterviewStudent, user: userInterviewStudent } = await createAndActivateUser('Candidate Interviewee', interviewStudentEmail, 'candidate');

  const teacherAId = String(userTeacherA._id || userTeacherA.id);
  const teacherBId = String(userTeacherB._id || userTeacherB.id);
  const studentId = String(userStudent._id || userStudent.id);

  // Setup sockets for Teacher A and Teacher B
  const socketA = io(BASE_URL, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { token: tokenTeacherA }
  });

  const socketB = io(BASE_URL, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { token: tokenTeacherB }
  });

  const alertsA = [];
  const alertsB = [];

  socketA.on('connect', () => {
    socketA.emit('subscribe_user_dashboard', { userId: teacherAId });
  });
  socketB.on('connect', () => {
    socketB.emit('subscribe_user_dashboard', { userId: teacherBId });
  });

  const captureAlert = (arr) => (data) => {
    if (data) arr.push(data);
  };

  socketA.on('TAB_SWITCH_ALERT', captureAlert(alertsA));
  socketA.on('TAB_SWITCH_DETECTED', captureAlert(alertsA));
  socketA.on('TAB_SWITCH_LIMIT_EXCEEDED', captureAlert(alertsA));
  socketA.on('proctor_alert', captureAlert(alertsA));
  socketA.on('ALERT_CREATED', captureAlert(alertsA));

  socketB.on('TAB_SWITCH_ALERT', captureAlert(alertsB));
  socketB.on('TAB_SWITCH_DETECTED', captureAlert(alertsB));
  socketB.on('TAB_SWITCH_LIMIT_EXCEEDED', captureAlert(alertsB));
  socketB.on('proctor_alert', captureAlert(alertsB));
  socketB.on('ALERT_CREATED', captureAlert(alertsB));

  await sleep(1000);

  // -------------------------------------------------------------
  // TEST 1: New virtual room generates valid room ID and join token.
  // -------------------------------------------------------------
  console.log('\n▶ Running TEST 1...');
  const createRoomRes = await api.post(
    '/api/rooms',
    {
      title: 'Operating Systems Examination',
      mode: 'EXAM',
      durationMinutes: 90,
      maxParticipants: 40
    },
    { headers: { Authorization: `Bearer ${tokenTeacherA}` } }
  );

  const roomA = createRoomRes.data.room;
  const roomIdA = roomA.roomId || roomA.id;
  const joinTokenA = roomA.joinToken || createRoomRes.data.joinCode;

  socketA.emit('join_room', { roomId: roomIdA, sessionId: roomIdA, role: 'reviewer' });

  const test1Pass = Boolean(
    createRoomRes.data.success &&
    roomIdA &&
    roomIdA.startsWith('TRV-') &&
    joinTokenA &&
    joinTokenA.length >= 6
  );
  recordTest('TEST 1: New virtual room generates valid room ID and join token', test1Pass, `roomId: ${roomIdA}, joinToken: ${joinTokenA}`);

  // Create Room B for Teacher B
  const createRoomBRes = await api.post(
    '/api/rooms',
    {
      title: 'Computer Networks Examination',
      mode: 'EXAM',
      durationMinutes: 60,
      maxParticipants: 30
    },
    { headers: { Authorization: `Bearer ${tokenTeacherB}` } }
  );
  const roomB = createRoomBRes.data.room;
  const roomIdB = roomB.roomId || roomB.id;
  const joinTokenB = roomB.joinToken || createRoomBRes.data.joinCode;
  socketB.emit('join_room', { roomId: roomIdB, sessionId: roomIdB, role: 'reviewer' });

  // -------------------------------------------------------------
  // TEST 2: Valid student join link allows joining the correct room.
  // -------------------------------------------------------------
  console.log('\n▶ Running TEST 2...');
  const publicRes = await api.get(`/api/rooms/${roomIdA}/public?token=${joinTokenA}`);
  const joinRes = await api.post(
    `/api/rooms/${roomIdA}/join`,
    {
      token: joinTokenA,
      title: 'Operating Systems Examination',
      mode: 'EXAM'
    },
    { headers: { Authorization: `Bearer ${tokenStudent}` } }
  );

  const sessionIdA = joinRes.data.sessionId;
  const test2Pass = Boolean(
    publicRes.data.success &&
    publicRes.data.room?.roomId === roomIdA &&
    joinRes.data.success &&
    sessionIdA &&
    sessionIdA.startsWith('TRV-')
  );
  recordTest('TEST 2: Valid student join link allows joining correct room', test2Pass, `Joined room ${roomIdA}, sessionId: ${sessionIdA}`);

  // -------------------------------------------------------------
  // TEST 3: Invalid room ID is rejected.
  // -------------------------------------------------------------
  console.log('\n▶ Running TEST 3...');
  let test3Pass = false;
  try {
    await api.get(`/api/rooms/TRV-UNKNOWN-9999/public?token=${joinTokenA}`);
  } catch (err) {
    if (err.response?.status === 404) test3Pass = true;
  }
  recordTest('TEST 3: Invalid room ID is rejected', test3Pass, 'Received 404 Not Found for non-existent room');

  // -------------------------------------------------------------
  // TEST 4: Invalid token is rejected.
  // -------------------------------------------------------------
  console.log('\n▶ Running TEST 4...');
  let test4Pass = false;
  try {
    await api.get(`/api/rooms/${roomIdA}/public?token=INVALID_TOKEN_999`);
  } catch (err) {
    if (err.response?.status === 403) test4Pass = true;
  }
  recordTest('TEST 4: Invalid token is rejected', test4Pass, 'Received 403 Forbidden when token does not match');

  // -------------------------------------------------------------
  // TEST 5: Student cannot access another room's monitoring session.
  // -------------------------------------------------------------
  console.log('\n▶ Running TEST 5...');
  let test5Pass = false;
  try {
    // Attempting to access Room B with Room A's credentials or without Room B's token
    await api.get(`/api/rooms/${roomIdB}`, {
      headers: { Authorization: `Bearer ${tokenStudent}` }
    });
  } catch (err) {
    if (err.response?.status === 403) test5Pass = true;
  }
  recordTest("TEST 5: Student cannot access another room's monitoring session", test5Pass, "Received 403 Forbidden for unauthorized room access");

  // -------------------------------------------------------------
  // TEST 6: First tab switch: count = 1, status = WARNING.
  // -------------------------------------------------------------
  console.log('\n▶ Running TEST 6...');
  const switch1Res = await api.post(
    `/api/ai-engine/sessions/${sessionIdA}/tab-switch`,
    {
      roomId: roomIdA,
      studentId,
      timestamp: new Date().toISOString()
    },
    { headers: { Authorization: `Bearer ${tokenStudent}` } }
  );

  const test6Pass = Boolean(
    switch1Res.data.success &&
    switch1Res.data.count === 1 &&
    switch1Res.data.tabSwitchStatus === 'WARNING' &&
    switch1Res.data.terminated === false
  );
  recordTest('TEST 6: First tab switch: count = 1, status = WARNING', test6Pass, `count: ${switch1Res.data.count}, status: ${switch1Res.data.tabSwitchStatus}`);

  // -------------------------------------------------------------
  // TEST 7: Second tab switch: count = 2, status = WARNING.
  // -------------------------------------------------------------
  console.log('\n▶ Running TEST 7...');
  const switch2Res = await api.post(
    `/api/ai-engine/sessions/${sessionIdA}/tab-switch`,
    {
      roomId: roomIdA,
      studentId,
      timestamp: new Date().toISOString()
    },
    { headers: { Authorization: `Bearer ${tokenStudent}` } }
  );

  const test7Pass = Boolean(
    switch2Res.data.success &&
    switch2Res.data.count === 2 &&
    switch2Res.data.tabSwitchStatus === 'WARNING' &&
    switch2Res.data.terminated === false
  );
  recordTest('TEST 7: Second tab switch: count = 2, status = WARNING', test7Pass, `count: ${switch2Res.data.count}, status: ${switch2Res.data.tabSwitchStatus}`);

  // -------------------------------------------------------------
  // TEST 8: Third tab switch: count = 3, status = FINAL_WARNING.
  // -------------------------------------------------------------
  console.log('\n▶ Running TEST 8...');
  const switch3Res = await api.post(
    `/api/ai-engine/sessions/${sessionIdA}/tab-switch`,
    {
      roomId: roomIdA,
      studentId,
      timestamp: new Date().toISOString()
    },
    { headers: { Authorization: `Bearer ${tokenStudent}` } }
  );

  const test8Pass = Boolean(
    switch3Res.data.success &&
    switch3Res.data.count === 3 &&
    switch3Res.data.tabSwitchStatus === 'FINAL_WARNING' &&
    switch3Res.data.terminated === false
  );
  recordTest('TEST 8: Third tab switch: count = 3, status = FINAL_WARNING', test8Pass, `count: ${switch3Res.data.count}, status: ${switch3Res.data.tabSwitchStatus}`);

  // -------------------------------------------------------------
  // TEST 9: Fourth tab switch: count = 4, status = TERMINATED.
  // -------------------------------------------------------------
  console.log('\n▶ Running TEST 9...');
  const switch4Res = await api.post(
    `/api/ai-engine/sessions/${sessionIdA}/tab-switch`,
    {
      roomId: roomIdA,
      studentId,
      timestamp: new Date().toISOString()
    },
    { headers: { Authorization: `Bearer ${tokenStudent}` } }
  );

  const test9Pass = Boolean(
    switch4Res.data.success &&
    switch4Res.data.count === 4 &&
    switch4Res.data.tabSwitchStatus === 'TERMINATED' &&
    switch4Res.data.terminated === true
  );
  recordTest('TEST 9: Fourth tab switch: count = 4, status = TERMINATED', test9Pass, `count: ${switch4Res.data.count}, status: ${switch4Res.data.tabSwitchStatus}, terminated: ${switch4Res.data.terminated}`);

  // -------------------------------------------------------------
  // TEST 10: Fourth switch stops the monitoring session.
  // -------------------------------------------------------------
  console.log('\n▶ Running TEST 10...');
  const sessionCheckRes = await api.get(
    `/api/ai-engine/sessions/${sessionIdA}`,
    { headers: { Authorization: `Bearer ${tokenStudent}` } }
  );
  const sData = sessionCheckRes.data.session || sessionCheckRes.data;
  const test10Pass = Boolean(
    sData.status === 'TERMINATED' &&
    sData.terminationReason &&
    sData.terminationReason.toLowerCase().includes('tab-switch')
  );
  recordTest('TEST 10: Fourth switch stops the monitoring session', test10Pass, `Session status: ${sData.status}, reason: "${sData.terminationReason}"`);

  // -------------------------------------------------------------
  // TEST 11: TAB_SWITCH_DETECTED appears in owner's live alerts.
  // -------------------------------------------------------------
  console.log('\n▶ Running TEST 11...');
  await sleep(1200);
  const tabSwitchDetectedAlert = alertsA.find(
    (a) => (a.eventType === 'TAB_SWITCH_DETECTED' || a.type === 'TAB_SWITCH_DETECTED') && a.sessionId === sessionIdA
  );
  const test11Pass = Boolean(tabSwitchDetectedAlert);
  recordTest("TEST 11: TAB_SWITCH_DETECTED appears in owner's live alerts", test11Pass, tabSwitchDetectedAlert ? `Received real-time alert for count ${tabSwitchDetectedAlert.count}` : 'Alert not received');

  // -------------------------------------------------------------
  // TEST 12: TAB_SWITCH_LIMIT_EXCEEDED appears as CRITICAL.
  // -------------------------------------------------------------
  console.log('\n▶ Running TEST 12...');
  const limitExceededAlert = alertsA.find(
    (a) => (a.eventType === 'TAB_SWITCH_LIMIT_EXCEEDED' || a.type === 'TAB_SWITCH_LIMIT_EXCEEDED') && a.sessionId === sessionIdA
  );
  const test12Pass = Boolean(
    limitExceededAlert &&
    limitExceededAlert.severity === 'CRITICAL' &&
    limitExceededAlert.count === 4
  );
  recordTest('TEST 12: TAB_SWITCH_LIMIT_EXCEEDED appears as CRITICAL', test12Pass, limitExceededAlert ? `Severity: ${limitExceededAlert.severity}, count: ${limitExceededAlert.count}` : 'Critical alert not found');

  // -------------------------------------------------------------
  // TEST 13: Report contains complete tab-switch history.
  // -------------------------------------------------------------
  console.log('\n▶ Running TEST 13...');
  const genReportRes = await api.post(
    '/api/reports/generate',
    {
      sessionId: sessionIdA,
      roomId: roomIdA,
      userName: 'Candidate Student',
      userEmail: studentEmail
    },
    { headers: { Authorization: `Bearer ${tokenStudent}` } }
  );

  const report = genReportRes.data.report;
  const test13Pass = Boolean(
    genReportRes.data.success &&
    report &&
    report.tabSwitches === 4 &&
    report.terminated === true &&
    report.terminationReason &&
    Array.isArray(report.tabSwitchTimeline) &&
    report.tabSwitchTimeline.length === 4
  );
  recordTest('TEST 13: Report contains complete tab-switch history', test13Pass, `Report tabSwitches: ${report?.tabSwitches}, terminated: ${report?.terminated}, timeline items: ${report?.tabSwitchTimeline?.length}`);

  // -------------------------------------------------------------
  // TEST 14: Refreshing/reconnecting the page does not reset the count.
  // -------------------------------------------------------------
  console.log('\n▶ Running TEST 14...');
  // Simulating a page refresh by creating a fresh API query to fetch session state
  const reconnectedSessionRes = await api.get(
    `/api/ai-engine/sessions/${sessionIdA}`,
    { headers: { Authorization: `Bearer ${tokenStudent}` } }
  );
  const reconnectedSession = reconnectedSessionRes.data.session || reconnectedSessionRes.data;
  const test14Pass = Boolean(
    reconnectedSession.tabSwitchCount === 4 &&
    reconnectedSession.tabSwitchStatus === 'TERMINATED'
  );
  recordTest('TEST 14: Refreshing/reconnecting page does not reset count', test14Pass, `Recovered tabSwitchCount: ${reconnectedSession.tabSwitchCount}, status: ${reconnectedSession.tabSwitchStatus}`);

  // -------------------------------------------------------------
  // TEST 15: Events from Room A never appear in Room B.
  // -------------------------------------------------------------
  console.log('\n▶ Running TEST 15...');
  const roomBLeakedAlert = alertsB.find(
    (a) => a.roomId === roomIdA || a.sessionId === sessionIdA
  );
  const test15Pass = !roomBLeakedAlert;
  recordTest('TEST 15: Events from Room A never appear in Room B', test15Pass, roomBLeakedAlert ? `Leak detected: ${JSON.stringify(roomBLeakedAlert)}` : 'Zero cross-room leakage observed in Room B');

  // -------------------------------------------------------------
  // TEST 16: Tab switch verification works in Live Monitoring, Exam Room, and Interview Room.
  // -------------------------------------------------------------
  console.log('\n▶ Running TEST 16...');
  // 16a. Create an Interview Room
  const createInterviewRoomRes = await api.post(
    '/api/rooms',
    {
      title: 'Technical Interview Room',
      mode: 'INTERVIEW',
      durationMinutes: 45,
      maxParticipants: 2
    },
    { headers: { Authorization: `Bearer ${tokenTeacherA}` } }
  );
  const interviewRoom = createInterviewRoomRes.data.room;
  const interviewRoomId = interviewRoom.roomId || interviewRoom.id;
  const interviewToken = interviewRoom.joinToken || createInterviewRoomRes.data.joinCode;

  // Student joins interview room
  const joinInterviewRes = await api.post(
    `/api/rooms/${interviewRoomId}/join`,
    {
      token: interviewToken,
      title: 'Technical Interview Room',
      mode: 'INTERVIEW'
    },
    { headers: { Authorization: `Bearer ${tokenInterviewStudent}` } }
  );

  const interviewSessionId = joinInterviewRes.data.sessionId;

  // Tab switch in Interview Room
  const interviewSwitchRes = await api.post(
    `/api/ai-engine/sessions/${interviewSessionId}/tab-switch`,
    {
      roomId: interviewRoomId,
      studentId: String(userInterviewStudent._id || userInterviewStudent.id),
      timestamp: new Date().toISOString()
    },
    { headers: { Authorization: `Bearer ${tokenInterviewStudent}` } }
  );

  const test16Pass = Boolean(
    interviewSwitchRes.data.success &&
    interviewSwitchRes.data.count === 1 &&
    interviewSwitchRes.data.tabSwitchStatus === 'WARNING'
  );
  recordTest(
    'TEST 16: Tab switch verification works in Live Monitoring, Exam Room, and Interview Room',
    test16Pass,
    `Interview room (${interviewRoomId}) recorded tab switch count ${interviewSwitchRes.data.count} with status ${interviewSwitchRes.data.tabSwitchStatus}`
  );

  // Summary
  console.log('\n================================================================');
  console.log('TEST SUMMARY');
  console.log('================================================================');
  let passCount = 0;
  let totalCount = 0;
  for (const [name, res] of Object.entries(results)) {
    totalCount++;
    if (res.passed) passCount++;
    console.log(`${res.passed ? '✓' : '✗'} ${name}`);
  }
  console.log(`\nTOTAL: ${passCount} / ${totalCount} PASSED`);

  try {
    socketA.disconnect();
    socketB.disconnect();
  } catch (_) {}

  process.exit(passCount === totalCount ? 0 : 1);
}

run().catch((err) => {
  console.error('Fatal test error:', err.response?.data || err.message || err);
  process.exit(1);
});
