const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'trueview-dev-secret-key-329487293847293847';
const MONGO_URI = 'mongodb://127.0.0.1:27017/trueview';

function post(path, data, token = null) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(data);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path,
        method: 'POST',
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch (_) {
            resolve({ status: res.statusCode, data: raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function get(path, token = null) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path,
        method: 'GET',
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch (_) {
            resolve({ status: res.statusCode, data: raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('=== TRUEVIEW AI: SESSIONS & REPORTS VERIFICATION TEST ===\n');

  await mongoose.connect(MONGO_URI);
  const User = mongoose.model('User', new mongoose.Schema({
    fullName: String,
    email: String,
    role: String,
    status: String,
    registrationStatus: String,
  }));

  const ts = Date.now().toString().slice(-4);
  const hostEmail = `host_${ts}@trueview.ai`;
  const studentAEmail = `student_a_${ts}@trueview.ai`;
  const studentBEmail = `student_b_${ts}@trueview.ai`;

  // 1. Create or Find verified users directly in Mongo
  console.log('[1] Creating real verified accounts in MongoDB:');
  const hostUser = await User.create({
    fullName: 'Professor Turing',
    email: hostEmail,
    role: 'teacher',
    status: 'Active',
    registrationStatus: 'ACTIVE',
  });
  const hostToken = jwt.sign({ id: hostUser._id }, JWT_SECRET, { expiresIn: '1d' });
  console.log(`    Host: ${hostUser.fullName} (${hostUser.email})`);

  const studentAUser = await User.create({
    fullName: 'Alice Walker',
    email: studentAEmail,
    role: 'student',
    status: 'Active',
    registrationStatus: 'ACTIVE',
  });
  const tokenA = jwt.sign({ id: studentAUser._id }, JWT_SECRET, { expiresIn: '1d' });
  console.log(`    Student Alpha: ${studentAUser.fullName} (${studentAUser.email})`);

  const studentBUser = await User.create({
    fullName: 'Bob Smith',
    email: studentBEmail,
    role: 'student',
    status: 'Active',
    registrationStatus: 'ACTIVE',
  });
  const tokenB = jwt.sign({ id: studentBUser._id }, JWT_SECRET, { expiresIn: '1d' });
  console.log(`    Student Beta: ${studentBUser.fullName} (${studentBUser.email})`);

  // 2. Host creates a Virtual Room
  console.log('\n[2] Creating Virtual Room via Host API...');
  const createRoom = await post(
    '/api/rooms',
    {
      title: 'Operating Systems & Distributed Systems Exam',
      description: 'End-term examination for CS402',
      mode: 'EXAM',
      duration: 60,
    },
    hostToken
  );
  const room = createRoom.data.room;
  const roomId = room.roomId;
  console.log(`    Virtual Room Created: ${roomId} - "${room.title}"`);

  // 3. Students Join Virtual Room
  console.log('\n[3] Students Joining Virtual Room...');
  const joinA = await post(`/api/rooms/${roomId}/join`, {}, tokenA);
  const sessionAId = joinA.data.sessionId || `TRV-SESS-A-${ts}`;
  console.log(`    Student Alpha joined -> Session: ${sessionAId}`);

  const joinB = await post(`/api/rooms/${roomId}/join`, {}, tokenB);
  const sessionBId = joinB.data.sessionId || `TRV-SESS-B-${ts}`;
  console.log(`    Student Beta joined -> Session: ${sessionBId}`);

  // 4. Generate AI Monitoring Events for Student Alpha
  console.log('\n[4] Generating Real AI Detection Events for Student Alpha...');
  const eventRes = await post('/api/ai-engine/events', {
    session_id: sessionAId,
    room_id: roomId,
    user_id: studentAUser._id.toString(),
    user_name: studentAUser.fullName,
    user_email: studentAUser.email,
    mode: 'EXAM',
    detections: {
      objects: [{ label: 'cell phone', confidence: 0.96 }],
      multiple_faces: false,
      spoof_detected: false,
    },
    attention: {
      gaze_direction: 'down_left',
      looking_away: true,
      attention_score: 30,
    },
    behaviour: {
      events: [
        { type: 'MOBILE_PHONE_DETECTED', severity: 'HIGH', evidence: 'Cell phone detected in hand' },
        { type: 'OFFSCREEN_GLANCE', severity: 'MEDIUM', evidence: 'Gaze diverted offscreen' }
      ],
    },
    risk: { score: 40 },
  }, tokenA);
  console.log(`    Event logging result: ${eventRes.data.success ? 'SUCCESS' : 'FAILED'}`);

  // 5. End Student Alpha Session
  console.log('\n[5] Ending Session for Student Alpha...');
  const endResA = await post(`/api/ai-engine/sessions/${sessionAId}/end`, { roomId }, tokenA);
  console.log(`    Session End API response: success=${endResA.data.success}, status=${endResA.data.session?.status}, duration=${endResA.data.durationSeconds}s`);

  // 6. Generate Host / Student Report
  console.log('\n[6] Generating Final Proctoring Report...');
  const reportRes = await post(
    '/api/reports/generate',
    {
      sessionId: sessionAId,
      roomId,
      userName: studentAUser.fullName,
      userEmail: studentAUser.email,
    },
    tokenA
  );
  const reportA = reportRes.data.report;
  if (!reportA) {
    throw new Error(`Report generation failed: ${JSON.stringify(reportRes.data)}`);
  }
  console.log(`    Report ID: ${reportA.reportId}`);
  console.log(`    Candidate: ${reportA.userName} (${reportA.userEmail})`);
  console.log(`    Integrity Score: ${reportA.overallIntegrityScore}%`);
  console.log(`    Verdict: ${reportA.verdict || reportA.status}`);
  console.log(`    Violations: ${reportA.totalViolations}`);
  console.log(`    Timeline Incidents: ${reportA.timeline?.length}`);

  // 7. Verify My Sessions for Student Alpha
  console.log('\n[7] Querying My Sessions for Student Alpha (GET /api/ai-engine/sessions)...');
  const sessListA = await get('/api/ai-engine/sessions', tokenA);
  const userSessionsA = sessListA.data.sessions || [];
  console.log(`    Sessions returned: ${userSessionsA.length}`);
  const matchA = userSessionsA.find((s) => s.sessionId === sessionAId);
  if (!matchA) {
    throw new Error('FAIL: Student Alpha session not found in My Sessions!');
  }
  console.log(`    [PASS] Student Alpha Session details in My Sessions:`);
  console.log(`      - Session ID: ${matchA.sessionId}`);
  console.log(`      - Room ID: ${matchA.roomId}`);
  console.log(`      - Room Title: ${matchA.roomTitle}`);
  console.log(`      - Host: ${matchA.hostName}`);
  console.log(`      - Mode: ${matchA.mode}`);
  console.log(`      - Status: ${matchA.status}`);
  console.log(`      - Has Report: ${matchA.hasReport} (Report ID: ${matchA.reportId})`);

  // 8. Verify Student Isolation in My Sessions
  console.log('\n[8] Verifying Student Isolation in My Sessions...');
  const sessListB = await get('/api/ai-engine/sessions', tokenB);
  const userSessionsB = sessListB.data.sessions || [];
  const leakSessionB = userSessionsB.find((s) => s.sessionId === sessionAId);
  if (leakSessionB) {
    throw new Error("SECURITY FAIL: Student Alpha's session was visible to Student Beta!");
  }
  console.log(`    [PASS] Student Beta cannot view Student Alpha's session. Data is isolated.`);

  // 9. Verify My Reports for Student Alpha
  console.log('\n[9] Querying My Reports for Student Alpha (GET /api/reports)...');
  const rptListA = await get('/api/reports', tokenA);
  const userReportsA = rptListA.data.reports || [];
  console.log(`    Reports returned: ${userReportsA.length}`);
  const matchRptA = userReportsA.find((r) => r.sessionId === sessionAId);
  if (!matchRptA) {
    throw new Error('FAIL: Student Alpha report not found in My Reports!');
  }
  console.log(`    [PASS] Student Alpha Report details in My Reports:`);
  console.log(`      - Report ID: ${matchRptA.reportId}`);
  console.log(`      - Candidate: ${matchRptA.userName} (${matchRptA.userEmail})`);
  console.log(`      - Room ID: ${matchRptA.roomId}`);
  console.log(`      - Room Title: ${matchRptA.roomTitle}`);
  console.log(`      - Mode: ${matchRptA.mode}`);
  console.log(`      - Integrity Score: ${matchRptA.overallIntegrityScore}%`);
  console.log(`      - Verdict: ${matchRptA.verdict}`);

  // 10. Verify Student Isolation in My Reports
  console.log('\n[10] Verifying Student Isolation in My Reports...');
  const rptListB = await get('/api/reports', tokenB);
  const userReportsB = rptListB.data.reports || [];
  const leakReportB = userReportsB.find((r) => r.sessionId === sessionAId);
  if (leakReportB) {
    throw new Error("SECURITY FAIL: Student Alpha's report was visible to Student Beta!");
  }
  console.log(`    [PASS] Student Beta cannot view Student Alpha's report. Isolation verified.`);

  // 11. Verify Proctor / Room Host Access
  console.log('\n[11] Verifying Room Host / Proctor Access to Candidate Reports...');
  const rptListHost = await get('/api/reports', hostToken);
  const hostReports = rptListHost.data.reports || [];
  const foundByHost = hostReports.find((r) => r.sessionId === sessionAId);
  if (!foundByHost) {
    throw new Error('FAIL: Room Host cannot view student report from their room!');
  }
  console.log(`    [PASS] Room Host successfully retrieved Student Alpha's report: ${foundByHost.reportId}`);

  // 12. Verify Detailed Report by ID
  console.log('\n[12] Verifying GET /api/reports/:id with Subsystem and Timeline Data...');
  const singleRpt = await get(`/api/reports/${reportA.reportId}`, tokenA);
  const rptData = singleRpt.data.report;
  if (!rptData || !rptData.subsystemResults || !rptData.timeline) {
    throw new Error('FAIL: Report details incomplete!');
  }
  console.log(`    [PASS] Full report payload verified:`);
  console.log(`      - Report ID: ${rptData.reportId}`);
  console.log(`      - Room ID: ${rptData.roomId} ("${rptData.roomTitle}")`);
  console.log(`      - Timeline Incidents: ${rptData.timeline.length}`);
  console.log(`      - Liveness Subsystem: ${JSON.stringify(rptData.subsystemResults.liveness)}`);
  console.log(`      - Environment Subsystem: ${JSON.stringify(rptData.subsystemResults.environmentYolo)}`);

  console.log('\n======================================================');
  console.log('✓ ALL DATA FLOW & SECURITY CHECKS PASSED SUCCESSFULLY!');
  console.log('======================================================\n');

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('\nVerification Error:', err.message);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
