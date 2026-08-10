/**
 * TrueView AI – Failure Injection Tests (Phase 3)
 *
 * Verifies deterministic behaviour under controlled failures:
 *   1. Socket disconnect -> PARTICIPANT_LEFT alert (policy severity)
 *   2. Refresh/reconnect -> rejoin works, room participants restored
 *   3. AI_ENGINE_OFFLINE in EXAM -> automatic suspension
 *   4. Camera INTERRUPTED in EXAM -> immediate suspension
 *   5. Camera INTERRUPTED in CLASS -> NO suspension (policy)
 *   6. Orphaned LIVE session (all sockets gone) -> still auto-completes via timer
 *   7. Reviewer leaves -> session continues for the participant
 *
 * Requires Node server (5000) + MongoDB (admin JWT).
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
function waitFor(emitter, event, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { emitter.off(event); resolve(null); }, timeoutMs);
    emitter.once(event, (data) => { clearTimeout(t); resolve(data); });
  });
}
async function getAdminToken() {
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/trueview', { serverSelectionTimeoutMS: 30000 });
  const admin = await mongoose.connection.db.collection('users').findOne({ role: 'admin' });
  await mongoose.disconnect();
  return jwt.sign({ id: String(admin._id), role: admin.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

(async () => {
  const adminToken = await getAdminToken();
  const SID = (tag) => `FI-${tag}-${Date.now().toString().slice(-5)}`;

  // ── 1. Disconnect -> PARTICIPANT_LEFT ──
  {
    const id = SID('LEFT');
    const rev = connect({ token: adminToken });
    await new Promise((r) => rev.on('connect', r));
    rev.emit('join_room', { sessionId: id, role: 'reviewer', user: { id: 'admin', name: 'Admin' }, sessionType: 'EXAM' });
    const part = connect({});
    await new Promise((r) => part.on('connect', r));
    part.emit('join_room', { sessionId: id, role: 'participant', user: { id: 'p1', name: 'P1' }, sessionType: 'EXAM' });
    await new Promise((r) => setTimeout(r, 400));
    rev.emit('start_session', { sessionId: id, sessionDuration: 600 });
    await new Promise((r) => setTimeout(r, 300));
    const leftPromise = waitFor(rev, 'AI_EVENT', 3000);
    part.close();
    const leftEvt = await leftPromise;
    results.participantLeft = leftEvt && leftEvt.eventType === 'PARTICIPANT_LEFT' ? `OK (${leftEvt.severity})` : `FAIL (${JSON.stringify(leftEvt)?.slice(0, 80)})`;
    rev.close();
  }

  // ── 2. Refresh/reconnect: participant rejoins same session ──
  {
    const id = SID('REJOIN');
    const part1 = connect({});
    await new Promise((r) => part1.on('connect', r));
    part1.emit('join_room', { sessionId: id, role: 'participant', user: { id: 'p2', name: 'P2' }, sessionType: 'EXAM' });
    await new Promise((r) => setTimeout(r, 300));
    part1.close(); // simulated refresh
    const part2 = connect({});
    await new Promise((r) => part2.on('connect', r));
    part2.emit('join_room', { sessionId: id, role: 'participant', user: { id: 'p2', name: 'P2' }, sessionType: 'EXAM' });
    const state = await waitFor(part2, 'session_state', 3000);
    results.rejoinWorks = state && state.sessionId === id ? 'OK (rejoined, state restored)' : `FAIL (${JSON.stringify(state)?.slice(0, 80)})`;
    part2.close();
  }

  // ── 3. AI_ENGINE_OFFLINE in EXAM -> suspension ──
  {
    const id = SID('AIDOWN');
    const part = connect({});
    await new Promise((r) => part.on('connect', r));
    part.emit('join_room', { sessionId: id, role: 'participant', user: { id: 'p3', name: 'P3' }, sessionType: 'EXAM' });
    await new Promise((r) => setTimeout(r, 300));
    const susp = waitFor(part, 'SESSION_SUSPENDED', 3000);
    part.emit('ai_event', { sessionId: id, eventType: 'AI_ENGINE_OFFLINE', confidence: 1.0, description: 'AI service unreachable' });
    const s = await susp;
    results.aiOfflineSuspends = s && (s.reason === 'AI_ENGINE_OFFLINE' || s.reason === 'MONITORING_THRESHOLD_EXCEEDED') ? `OK (${s.reason})` : 'FAIL';
    part.close();
  }

  // ── 4. Camera INTERRUPTED in EXAM -> immediate suspension ──
  {
    const id = SID('CAM');
    const part = connect({});
    await new Promise((r) => part.on('connect', r));
    part.emit('join_room', { sessionId: id, role: 'participant', user: { id: 'p4', name: 'P4' }, sessionType: 'EXAM' });
    await new Promise((r) => setTimeout(r, 300));
    const susp = waitFor(part, 'SESSION_SUSPENDED', 3000);
    part.emit('update_media_status', { sessionId: id, deviceType: 'camera', status: 'INTERRUPTED' });
    const s = await susp;
    results.cameraInterruptSuspends = s && s.reason === 'CAMERA_INTERRUPTED' ? 'OK' : `FAIL (${JSON.stringify(s)?.slice(0, 60)})`;
    part.close();
  }

  // ── 5. Camera INTERRUPTED in CLASS -> no suspension ──
  {
    const id = SID('CAMCLASS');
    const part = connect({});
    await new Promise((r) => part.on('connect', r));
    part.emit('join_room', { sessionId: id, role: 'participant', user: { id: 'p5', name: 'P5' }, sessionType: 'CLASS' });
    await new Promise((r) => setTimeout(r, 300));
    const susp = waitFor(part, 'SESSION_SUSPENDED', 2000);
    part.emit('update_media_status', { sessionId: id, deviceType: 'camera', status: 'INTERRUPTED' });
    const s = await susp;
    results.cameraInterruptClassNoSuspend = s === null ? 'OK (no suspension in CLASS)' : 'FAIL (suspended in CLASS)';
    part.close();
  }

  // ── 6. Orphaned LIVE session -> still auto-completes via timer sweep ──
  {
    const id = SID('ORPHAN');
    const rev = connect({ token: adminToken });
    await new Promise((r) => rev.on('connect', r));
    rev.emit('join_room', { sessionId: id, role: 'reviewer', user: { id: 'admin', name: 'Admin' }, sessionType: 'EXAM' });
    await new Promise((r) => setTimeout(r, 300));
    rev.emit('start_session', { sessionId: id, sessionDuration: 4 });
    const part = connect({});
    await new Promise((r) => part.on('connect', r));
    part.emit('join_room', { sessionId: id, role: 'participant', user: { id: 'p6', name: 'P6' }, sessionType: 'EXAM' });
    await new Promise((r) => setTimeout(r, 300));
    part.close();
    rev.close(); // ALL sockets gone
    // Reconnect an observer to catch SESSION_COMPLETED (a fresh socket rejoins; the
    // session state persists in-memory and the sweep still completes it).
    const obs = connect({});
    await new Promise((r) => obs.on('connect', r));
    obs.emit('join_room', { sessionId: id, role: 'participant', user: { id: 'obs', name: 'Obs' }, sessionType: 'EXAM' });
    const done = waitFor(obs, 'SESSION_COMPLETED', 9000);
    const d = await done;
    results.orphanedAutoCompletes = d && d.completedByTimer ? 'OK (no stale LIVE; timer completed it)' : `FAIL (${JSON.stringify(d)?.slice(0, 80)})`;
    obs.close();
  }

  // ── 7. Reviewer leaves -> participant session continues ──
  {
    const id = SID('REVLEFT');
    const rev = connect({ token: adminToken });
    await new Promise((r) => rev.on('connect', r));
    rev.emit('join_room', { sessionId: id, role: 'reviewer', user: { id: 'admin', name: 'Admin' }, sessionType: 'EXAM' });
    const part = connect({});
    await new Promise((r) => part.on('connect', r));
    part.emit('join_room', { sessionId: id, role: 'participant', user: { id: 'p7', name: 'P7' }, sessionType: 'EXAM' });
    await new Promise((r) => setTimeout(r, 300));
    rev.emit('start_session', { sessionId: id, sessionDuration: 600 });
    await new Promise((r) => setTimeout(r, 300));
    rev.close();
    await new Promise((r) => setTimeout(r, 500));
    const evt = new Promise((resolve) => { const t = setTimeout(() => resolve(null), 2000); part.once('AI_EVENT', (d) => { clearTimeout(t); resolve(d); }); });
    part.emit('ai_event', { sessionId: id, eventType: 'GAZE_DEVIATION', confidence: 0.8 });
    const e = await evt;
    results.reviewerLeftSessionContinues = e && e.eventType === 'GAZE_DEVIATION' ? 'OK (participant events still accepted)' : `FAIL (${JSON.stringify(e)?.slice(0, 60)})`;
    part.close();
  }

  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error('FAILURE TEST CRASH:', e.message);
  process.exit(1);
});
