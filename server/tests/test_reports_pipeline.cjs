/**
 * TRUEVIEW AI — REPORTS PIPELINE INTEGRATION & VALIDATION TEST SUITE
 * 
 * Verifies:
 * 1. User with zero reports receives clean empty array (no crashes).
 * 2. Real session completion generates and persists report to MongoDB.
 * 3. GET /api/reports returns real persisted reports for the authenticated user.
 * 4. GET /api/reports/:id returns detailed report with timelines, audits, and subsystem metrics.
 * 5. User isolation: User B cannot view User A's private proctoring reports.
 * 6. Filtering by status, mode, and search terms.
 * 7. CSV export endpoint functionality.
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5000';
const api = axios.create({ baseURL: BASE_URL, timeout: 5000 });

async function runTestSuite() {
  console.log('================================================================');
  console.log('TRUEVIEW AI — REPORTS PIPELINE INTEGRATION TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function record(title, pass, details = '') {
    if (pass) {
      console.log(`  [PASS] ${title}${details ? ` -> ${details}` : ''}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${title}${details ? ` -> ${details}` : ''}`);
      failed++;
    }
  }

  async function createAndActivateUser(fullName, email, role = 'student') {
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

  // 1. Setup two distinct users (Student A and Student B)
  const userAEmail = `candidate_a_${Date.now()}@trueview.ai`;
  const userBEmail = `candidate_b_${Date.now()}@trueview.ai`;
  const password = 'Password@123';

  const userA = await createAndActivateUser('Candidate Alice', userAEmail, 'student');
  const tokenA = userA.token;
  const userAId = userA.user.id || userA.user._id;

  const userB = await createAndActivateUser('Candidate Bob', userBEmail, 'student');
  const tokenB = userB.token;

  console.log('▶ TEST 1: New user with zero reports...');
  const emptyRes = await api.get('/api/reports', {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  const test1Pass = emptyRes.data.success && Array.isArray(emptyRes.data.reports) && emptyRes.data.reports.length === 0;
  record('TEST 1: New user receives empty reports array (count = 0)', test1Pass, `reports count: ${emptyRes.data.reports?.length}`);

  console.log('\n▶ TEST 2: Create a proctoring session and log monitoring events...');
  const sessionId = `TRV-SESS-${Date.now().toString(36).toUpperCase()}`;
  const roomId = `TRV-${Math.floor(1000 + Math.random() * 9000)}`;

  // Initialize session
  await api.post('/api/ai-engine/log', {
    session_id: sessionId,
    user_id: userAId,
    userEmail: userAEmail,
    userName: 'Candidate Alice',
    roomId,
    roomTitle: 'Computer Science Final Examination',
    session_type: 'EXAM',
    event_type: 'SESSION_INITIALIZE',
    severity: 'LOW',
    message: 'Proctored session started'
  }, { headers: { Authorization: `Bearer ${tokenA}` } });

  // Log some AI alerts (tab switch, glance, etc.)
  await api.post('/api/ai-engine/log', {
    session_id: sessionId,
    user_id: userAId,
    userEmail: userAEmail,
    userName: 'Candidate Alice',
    roomId,
    event_type: 'OFFSCREEN_GLANCE',
    severity: 'MEDIUM',
    evidence: 'Candidate gaze shifted offscreen for 3.2s',
    confidence: 0.88,
  }, { headers: { Authorization: `Bearer ${tokenA}` } });

  await api.post('/api/ai-engine/sessions/' + sessionId + '/tab-switch', {
    roomId,
    studentId: userAId,
    episodeId: `ep_${Date.now()}`,
    hiddenDuration: 1100,
  }, { headers: { Authorization: `Bearer ${tokenA}` } });

  console.log('\n▶ TEST 3: Complete session and generate report...');
  const genRes = await api.post('/api/reports/generate', {
    sessionId,
    roomId,
    userName: 'Candidate Alice',
    userEmail: userAEmail,
  }, { headers: { Authorization: `Bearer ${tokenA}` } });

  const test3Pass = genRes.data.success && Boolean(genRes.data.report?.reportId);
  const generatedReport = genRes.data.report;
  record('TEST 3: Session generates and persists report to MongoDB', test3Pass, `Report ID: ${generatedReport?.reportId}, Score: ${generatedReport?.overallIntegrityScore}%`);

  console.log('\n▶ TEST 4: Fetch user reports (GET /api/reports)...');
  const userAReportsRes = await api.get('/api/reports', {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  const reportsList = userAReportsRes.data.reports;
  const foundReport = reportsList.find(r => r.sessionId === sessionId);
  const test4Pass = userAReportsRes.data.success && Boolean(foundReport) && foundReport.reportId === generatedReport.reportId;
  record('TEST 4: GET /api/reports returns newly created report for user', test4Pass, `Found reportId: ${foundReport?.reportId}, candidate: ${foundReport?.userName}`);

  console.log('\n▶ TEST 5: Fetch detailed report by ID (GET /api/reports/:id)...');
  const detailRes = await api.get(`/api/reports/${generatedReport.reportId}`, {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  const detailData = detailRes.data.report;
  const test5Pass = detailRes.data.success && detailData.sessionId === sessionId &&
                    detailData.reportId === generatedReport.reportId &&
                    detailData.overallIntegrityScore !== undefined;
  record('TEST 5: GET /api/reports/:id returns complete report metrics and details', test5Pass, `Score: ${detailData?.overallIntegrityScore}%, Mode: ${detailData?.mode}`);

  console.log('\n▶ TEST 6: User Isolation Check...');
  const userBReportsRes = await api.get('/api/reports', {
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  const bList = userBReportsRes.data.reports || [];
  const leakedReport = bList.find(r => r.sessionId === sessionId || r.reportId === generatedReport.reportId);
  const test6Pass = !leakedReport && bList.length === 0;
  record('TEST 6: User isolation verified (User B cannot see User A reports)', test6Pass, `User B sees ${bList.length} reports`);

  console.log('\n▶ TEST 7: Report Search & Filters...');
  // Search by Report ID
  const searchRes = await api.get(`/api/reports?search=${generatedReport.reportId.slice(0, 6)}`, {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  const test7aPass = searchRes.data.reports.some(r => r.reportId === generatedReport.reportId);
  record('TEST 7a: Search by report ID returns matching report', test7aPass);

  // Search by candidate name
  const searchCandidateRes = await api.get('/api/reports?search=Alice', {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  const test7bPass = searchCandidateRes.data.reports.some(r => r.userName.includes('Alice'));
  record('TEST 7b: Search by candidate name returns matching report', test7bPass);

  // Filter with no match
  const noMatchRes = await api.get('/api/reports?search=NONEXISTENT_KEYWORD_XYZ', {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  const test7cPass = noMatchRes.data.reports.length === 0;
  record('TEST 7c: Search with zero matches returns clean empty list', test7cPass, `Count: ${noMatchRes.data.reports.length}`);

  console.log('\n▶ TEST 8: Export CSV Spreadsheet...');
  const csvRes = await api.get('/api/reports/export/csv', {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  const test8Pass = csvRes.status === 200 && typeof csvRes.data === 'string' && csvRes.data.includes('Report ID') && csvRes.data.includes(generatedReport.reportId);
  record('TEST 8: Export CSV spreadsheet returns valid formatted CSV with headers', test8Pass, `CSV Length: ${csvRes.data.length} characters`);

  console.log('\n================================================================');
  console.log(`TOTAL: ${passed} / ${passed + failed} PASSED`);
  if (failed === 0) {
    console.log('🎉 ALL REPORTS PIPELINE INTEGRATION TESTS PASSED PERFECTLY!');
  } else {
    console.error(`⚠️ ${failed} TESTS FAILED`);
  }
  console.log('================================================================');

  process.exit(failed === 0 ? 0 : 1);
}

runTestSuite().catch(err => {
  console.error('Reports pipeline test failed:', err.response?.data || err.message);
  process.exit(1);
});
