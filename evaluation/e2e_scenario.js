/**
 * TrueView AI – End-to-End Session Lifecycle Scenarios (Phase 3)
 *
 * Scenario A (violations): reviewer starts an EXAM, participant emits critical
 * events until the configured threshold is reached -> SESSION_SUSPENDED ->
 * reviewer resumes -> reviewer ends -> SESSION_COMPLETED -> report generated.
 *
 * Scenario B (clean): no violations -> timer expires -> SESSION_COMPLETED
 * (completedByTimer=true) -> report generated.
 *
 * Finally validates the generated Report documents: required fields present,
 * and no password / face / voice embeddings exposed.
 */
const { io } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const SERVER = 'http://127.0.0.1:5000';
const results = {};

function connect(auth) {
  return io(SERVER, { transports: ['websocket'], reconnectionAttempts: 0, auth });
}
function waitFor(emitter, event, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { emitter.off(event); resolve(null); }, timeoutMs);
    emitter.once(event, (data) => { clearTimeout(t); resolve(data); });
  });
}
async function withMongo(fn) {
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/trueview', { serverSelectionTimeoutMS: 30000 });
  try {
    return await fn(mongoose);
  } finally {
    await mongoose.disconnect();
  }
}
async function getAdminToken() {
  return withMongo(async (mg) => {
    const admin = await mg.connection.db.collection('users').findOne({ role: 'admin' });
    return jwt.sign({ id: String(admin._id), role: admin.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  });
}

function validateReport(doc) {
  const required = [
    'reportId', 'sessionId', 'userName', 'userEmail', 'sessionType', 'durationSeconds',
    'startTime', 'endTime', 'overallIntegrityScore', 'riskLevel', 'totalViolations',
    'phoneDetections', 'cameraInterruptions', 'microphoneInterruptions',
    'multipleSpeakerEvents', 'speechEvents', 'livenessFailures', 'gazeEvents',
    'behaviourAlerts', 'suspensionEvents', 'webRtcConnections', 'faceVerified',
    'livenessPassed', 'alerts', 'timeline', 'status',
  ];
  const missing = required.filter((k) => doc[k] === undefined);
  const json = JSON.stringify(doc);
  const biometricExposed = ['password', 'faceEmbeddings', 'voiceEmbeddings', 'faceEmbedding', 'voiceEmbedding']
    .some((k) => json.includes(k));
  return { missing, biometricExposed, hasTimeline: Array.isArray(doc.timeline) && doc.timeline.length > 0 };
}

(async () => {
  const adminToken = await getAdminToken();
  const sid = (tag) => `E2E-${tag}-${Date.now().toString().slice(-5)}`;

  // ── Scenario A: violation -> suspension -> resume -> end -> report ──
  {
    const id = sid('A');
    const rev = connect({ token: adminToken });
    await new Promise((r) => rev.on('connect', r));
    rev.emit('join_room', { sessionId: id, role: 'reviewer', user: { id: 'admin', name: 'Admin' }, sessionType: 'EXAM' });
    const part = connect({});
    await new Promise((r) => part.on('connect', r));
    part.emit('join_room', { sessionId: id, role: 'participant', user: { id: 'e2e-p', name: 'USER_01', email: 'user01@test.local' }, sessionType: 'EXAM' });
    await new Promise((r) => setTimeout(r, 400));

    rev.emit('start_session', { sessionId: id, sessionDuration: 1800 }); // 30 min
    await new Promise((r) => setTimeout(r, 400));

    // 3 CRITICAL-severity events -> criticalLimit (EXAM=3) reached -> suspension.
    // NOTE: distinct event types are used because the real-time lifecycle state
    // machine deduplicates REPEATED detections (no alert spam by design).
    const susp = waitFor(part, 'SESSION_SUSPENDED', 6000);
    const criticalEvents = [
      { eventType: 'MULTIPLE_FACES_DETECTED', confidence: 0.97, description: 'Multiple faces detected in camera view' },
      { eventType: 'LIVENESS_FAILED', confidence: 0.96, description: 'Liveness check failed' },
      { eventType: 'IDENTITY_MISMATCH', confidence: 0.95, description: 'Identity mismatch detected' },
    ];
    for (const evt of criticalEvents) {
      part.emit('ai_event', { sessionId: id, ...evt });
      await new Promise((r) => setTimeout(r, 250));
    }
    const s = await susp;
    results.scenarioA_suspended = s && s.reason === 'MONITORING_THRESHOLD_EXCEEDED' ? `OK (${s.reason})` : `FAIL (${JSON.stringify(s)?.slice(0, 80)})`;

    const resumed = waitFor(part, 'SESSION_RESUMED', 4000);
    rev.emit('reviewer_command', { sessionId: id, command: 'RESUME_SESSION', payload: {} });
    results.scenarioA_resumed = (await resumed) ? 'OK' : 'FAIL';

    // WebRTC open/close events (from the reviewer subscriber side)
    part.emit('ai_event', { sessionId: id, eventType: 'WEBRTC_CONNECTION_OPEN', confidence: 1.0, description: 'Live stream connected to reviewer' });
    await new Promise((r) => setTimeout(r, 250));
    part.emit('ai_event', { sessionId: id, eventType: 'SPEECH_DETECTED', confidence: 0.9, description: 'Speech detected in room' });
    await new Promise((r) => setTimeout(r, 250));

    const completed = waitFor(part, 'SESSION_COMPLETED', 5000);
    rev.emit('reviewer_command', { sessionId: id, command: 'END_SESSION', payload: {} });
    results.scenarioA_completed = (await completed) ? 'OK' : 'FAIL';

    await new Promise((r) => setTimeout(r, 800)); // let report persist
    const repA = await withMongo((mg) => mg.connection.db.collection('reports').findOne({ sessionId: id }));
    const vA = repA ? validateReport(repA) : null;
    results.scenarioA_report = vA
      ? `OK (missing=${vA.missing.length} biometricExposed=${vA.biometricExposed} timeline=${vA.hasTimeline})`
      : 'FAIL (no report doc)';
    results.scenarioA_reportSuspensions = repA ? repA.suspensionEvents : null;

    rev.close();
    part.close();
  }

  // ── Scenario B: clean session -> timer expiry -> completed by timer ──
  {
    const id = sid('B');
    const rev = connect({ token: adminToken });
    await new Promise((r) => rev.on('connect', r));
    rev.emit('join_room', { sessionId: id, role: 'reviewer', user: { id: 'admin', name: 'Admin' }, sessionType: 'EXAM' });
    const part = connect({});
    await new Promise((r) => part.on('connect', r));
    part.emit('join_room', { sessionId: id, role: 'participant', user: { id: 'e2e-pb', name: 'USER_02', email: 'user02@test.local' }, sessionType: 'EXAM' });
    await new Promise((r) => setTimeout(r, 400));

    rev.emit('start_session', { sessionId: id, sessionDuration: 4 });
    await new Promise((r) => setTimeout(r, 300));

    // Benign events only
    part.emit('ai_event', { sessionId: id, eventType: 'PARTICIPANT_JOINED', confidence: 1.0 });
    part.emit('ai_event', { sessionId: id, eventType: 'REGISTERED_SPEAKER', confidence: 0.95, description: 'Registered speaker activity' });
    await new Promise((r) => setTimeout(r, 200));

    const completed = waitFor(part, 'SESSION_COMPLETED', 9000);
    const c = await completed;
    results.scenarioB_timerCompleted = c && c.completedByTimer ? 'OK (completedByTimer=true)' : `FAIL (${JSON.stringify(c)?.slice(0, 80)})`;

    await new Promise((r) => setTimeout(r, 800));
    const repB = await withMongo((mg) => mg.connection.db.collection('reports').findOne({ sessionId: id }));
    const vB = repB ? validateReport(repB) : null;
    results.scenarioB_report = vB
      ? `OK (missing=${vB.missing.length} biometricExposed=${vB.biometricExposed} timeline=${vB.hasTimeline} completedByTimer=${repB.completedByTimer})`
      : 'FAIL (no report doc)';

    rev.close();
    part.close();
  }

  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error('E2E CRASH:', e.message);
  process.exit(1);
});
