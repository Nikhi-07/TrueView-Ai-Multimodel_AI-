/**
 * TrueView AI – Security Test Matrix (Phase 3)
 *
 * Validates server-side enforcement of: REST auth, JWT validity/expiry, role
 * separation, cross-session isolation, client-supplied severity/status/ID
 * spoofing, WebRTC authorization, replay protection, and rate limiting.
 *
 * Requires: Node server (5000), MongoDB (for admin JWT + rate-limit state).
 */
const { io } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const path = require('path');
const http = require('http');
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const SERVER = 'http://127.0.0.1:5000';
const results = {};

function connect(auth) {
  return io(SERVER, { transports: ['websocket'], reconnectionAttempts: 0, auth });
}

function waitFor(emitter, event, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { emitter.off(event); resolve(null); }, timeoutMs);
    emitter.once(event, (data) => { clearTimeout(t); resolve(data); });
  });
}

function rest(method, p, body, headers = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(`${SERVER}${p}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    }, (res) => {
      let raw = '';
      const headers = res.headers || {};
      res.on('data', (c) => (raw += c));
      res.on('end', () => resolve({ status: res.statusCode, body: raw, headers }));
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    if (data) req.write(data);
    req.end();
  });
}

async function connectWithRetry() {
  const mongoose = require('mongoose');
  const User = require(path.join(__dirname, '..', 'server', 'models', 'User'));
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/trueview', { serverSelectionTimeoutMS: 30000 });
  let admin = await mongoose.connection.db.collection('users').findOne({ role: 'admin' });
  await mongoose.disconnect();
  if (!admin) throw new Error('no admin user in DB');
  return {
    adminToken: jwt.sign({ id: String(admin._id), role: admin.role }, process.env.JWT_SECRET, { expiresIn: '1h' }),
    adminId: String(admin._id),
  };
}

async function getUserToken() {
  const mongoose = require('mongoose');
  const User = require(path.join(__dirname, '..', 'server', 'models', 'User'));
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/trueview', { serverSelectionTimeoutMS: 30000 });
  let user = await mongoose.connection.db.collection('users').findOne({ role: { $ne: 'admin' }, registrationStatus: 'ACTIVE' });
  await mongoose.disconnect();
  if (!user) throw new Error('no non-admin ACTIVE user in DB');
  return { token: jwt.sign({ id: String(user._id), role: user.role || 'user' }, process.env.JWT_SECRET, { expiresIn: '1h' }), id: String(user._id) };
}

(async () => {
  const { adminToken } = await connectWithRetry();

  // ── 1. REST: protected route without token → 401 ──
  const r1 = await rest('GET', '/api/auth/biometric-status');
  results.restUnauthenticated = r1.status === 401 ? 'OK (401)' : `FAIL (${r1.status})`;

  // ── 2. REST: wrong password → 401 ──
  const r2 = await rest('POST', '/api/auth/verify-credentials', { email: 'admin@trueview.ai', password: 'wrongpass' });
  results.restWrongPassword = r2.status === 401 ? 'OK (401)' : `FAIL (${r2.status})`;

  // ── 3. Expired JWT → cannot control session ──
  const expiredToken = jwt.sign({ id: 'ffffffffffffffffffffffff', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '-10s' });
  const exp = connect({ token: expiredToken });
  await new Promise((r) => exp.on('connect', r));
  exp.emit('join_room', { sessionId: 'SEC-EXP', role: 'reviewer', user: { id: 'x', name: 'x' }, sessionType: 'EXAM' });
  await new Promise((r) => setTimeout(r, 300));
  const expBlocked = await (async () => {
    const s = connect({ token: expiredToken });
    await new Promise((r) => s.on('connect', r));
    s.emit('join_room', { sessionId: 'SEC-EXP2', role: 'reviewer', user: { id: 'x', name: 'x' }, sessionType: 'EXAM' });
    await new Promise((r) => setTimeout(r, 300));
    const changed = await waitFor(s, 'SESSION_STATE_CHANGED', 1200);
    s.emit('reviewer_command', { sessionId: 'SEC-EXP2', command: 'PAUSE_SESSION', payload: {} });
    const changed2 = await waitFor(s, 'SESSION_STATE_CHANGED', 1200);
    s.close();
    exp.close();
    return changed === null && changed2 === null ? 'OK (expired JWT rejected)' : `FAIL (${JSON.stringify(changed2)?.slice(0, 60)})`;
  })();
  results.expiredJwtBlocked = expBlocked;

  // ── 4. Invalid JWT (garbage) → reviewer command blocked ──
  const bad = connect({ token: 'garbage.token.value' });
  await new Promise((r) => bad.on('connect', r));
  bad.emit('join_room', { sessionId: 'SEC-BAD', role: 'reviewer', user: { id: 'x', name: 'x' }, sessionType: 'EXAM' });
  await new Promise((r) => setTimeout(r, 300));
  const badChanged = await waitFor(bad, 'SESSION_STATE_CHANGED', 1200);
  bad.emit('reviewer_command', { sessionId: 'SEC-BAD', command: 'SUSPEND_SESSION', payload: {} });
  const badChanged2 = await waitFor(bad, 'SESSION_STATE_CHANGED', 1200);
  results.invalidJwtBlocked = badChanged === null && badChanged2 === null ? 'OK (invalid JWT rejected)' : `FAIL`;
  bad.close();

  // ── 5. Participant (non-admin) attempting reviewer commands → blocked ──
  const p1 = connect({});
  await new Promise((r) => p1.on('connect', r));
  p1.emit('join_room', { sessionId: 'SEC-ROLE', role: 'participant', user: { id: 'p1', name: 'P1' }, sessionType: 'EXAM' });
  await new Promise((r) => setTimeout(r, 300));
  const roleChanged = await waitFor(p1, 'SESSION_STATE_CHANGED', 1200);
  p1.emit('reviewer_command', { sessionId: 'SEC-ROLE', command: 'SUSPEND_SESSION', payload: {} });
  const roleChanged2 = await waitFor(p1, 'SESSION_STATE_CHANGED', 1200);
  results.participantReviewerBlocked = roleChanged === null && roleChanged2 === null ? 'OK (blocked)' : 'FAIL';
  p1.close();

  // ── 6. Cross-session injection: socket in room A → ai_event for room B → blocked ──
  const aSock = connect({});
  await new Promise((r) => aSock.on('connect', r));
  aSock.emit('join_room', { sessionId: 'SEC-A', role: 'participant', user: { id: 'a', name: 'A' }, sessionType: 'EXAM' });
  const bSock = connect({});
  await new Promise((r) => bSock.on('connect', r));
  bSock.emit('join_room', { sessionId: 'SEC-B', role: 'participant', user: { id: 'b', name: 'B' }, sessionType: 'EXAM' });
  await new Promise((r) => setTimeout(r, 300));
  const bAlertPromise = waitFor(bSock, 'AI_EVENT', 1500);
  aSock.emit('ai_event', { sessionId: 'SEC-B', eventType: 'PHONE_DETECTED', confidence: 1.0, description: 'pollution attempt' });
  const bGotAlert = await bAlertPromise;
  results.crossSessionInjectionBlocked = bGotAlert === null ? 'OK (blocked)' : `FAIL (${bGotAlert.eventType})`;
  aSock.close();
  bSock.close();

  // ── 7. Client-supplied severity ignored (server recomputes policy severity) ──
  const cSock = connect({});
  await new Promise((r) => cSock.on('connect', r));
  cSock.emit('join_room', { sessionId: 'SEC-SEV', role: 'participant', user: { id: 'c', name: 'C' }, sessionType: 'CLASS' });
  await new Promise((r) => setTimeout(r, 300));
  const sevEvent = new Promise((resolve) => cSock.once('AI_EVENT', resolve));
  cSock.emit('ai_event', { sessionId: 'SEC-SEV', eventType: 'GAZE_DEVIATION', severity: 'CRITICAL', confidence: 0.9, description: 'severity spoof' });
  const sev = await sevEvent;
  results.severitySpoofBlocked = sev && sev.severity === 'INFO' ? `OK (server enforced INFO, client sent CRITICAL)` : `FAIL (severity=${sev?.severity})`;
  cSock.close();

  // ── 8. Participant-ID spoof ignored (server derives from join record) ──
  const dSock = connect({});
  await new Promise((r) => dSock.on('connect', r));
  dSock.emit('join_room', { sessionId: 'SEC-PID', role: 'participant', user: { id: 'real-d', name: 'D' }, sessionType: 'EXAM' });
  await new Promise((r) => setTimeout(r, 300));
  const pidEvent = new Promise((resolve) => dSock.once('AI_EVENT', resolve));
  dSock.emit('ai_event', { sessionId: 'SEC-PID', eventType: 'GAZE_DEVIATION', participantId: 'attacker-spoofed-id', confidence: 0.9 });
  const pid = await pidEvent;
  results.participantIdSpoofBlocked = pid && pid.participantId === 'real-d' ? 'OK (server derived real-d)' : `FAIL (${pid?.participantId})`;
  dSock.close();

  // ── 9. Status manipulation: client emits fake SESSION_STATE_CHANGED → ignored ──
  const eSock = connect({});
  await new Promise((r) => eSock.on('connect', r));
  eSock.emit('join_room', { sessionId: 'SEC-ST', role: 'participant', user: { id: 'e', name: 'E' }, sessionType: 'EXAM' });
  await new Promise((r) => setTimeout(r, 300));
  const stEvent = new Promise((resolve) => { const t = setTimeout(() => resolve(null), 1500); eSock.once('SESSION_STATE_CHANGED', (d) => { clearTimeout(t); resolve(d); }); });
  eSock.emit('SESSION_STATE_CHANGED', { status: 'COMPLETED' }); // no server handler for this
  const st = await stEvent;
  results.statusSpoofIgnored = st === null ? 'OK (no state change)' : `FAIL (${JSON.stringify(st)?.slice(0, 60)})`;
  eSock.close();

  // ── 10. WebRTC: reviewer in room A offering to participant in room B → blocked ──
  const revA = connect({ token: adminToken });
  await new Promise((r) => revA.on('connect', r));
  revA.emit('join_room', { sessionId: 'SEC-WA', role: 'reviewer', user: { id: 'admin', name: 'Admin' }, sessionType: 'EXAM' });
  const parB = connect({});
  await new Promise((r) => parB.on('connect', r));
  parB.emit('join_room', { sessionId: 'SEC-WB', role: 'participant', user: { id: 'pb', name: 'PB' }, sessionType: 'EXAM' });
  await new Promise((r) => setTimeout(r, 300));
  const wbSignal = waitFor(parB, 'webrtc_signal', 1500);
  revA.emit('webrtc_signal', { sessionId: 'SEC-WA', target: parB.id, signal: { type: 'offer', sdp: 'x' } });
  const wbGot = await wbSignal;
  results.webrtcCrossSessionBlocked = wbGot === null ? 'OK (blocked)' : 'FAIL';
  revA.close();
  parB.close();

  // ── 11. Replay into completed session blocked ──
  const revR = connect({ token: adminToken });
  await new Promise((r) => revR.on('connect', r));
  revR.emit('join_room', { sessionId: 'SEC-RP', role: 'reviewer', user: { id: 'admin', name: 'Admin' }, sessionType: 'EXAM' });
  await new Promise((r) => setTimeout(r, 300));
  revR.emit('start_session', { sessionId: 'SEC-RP', sessionDuration: 60 });
  await new Promise((r) => setTimeout(r, 300));
  revR.emit('reviewer_command', { sessionId: 'SEC-RP', command: 'END_SESSION', payload: {} });
  await new Promise((r) => setTimeout(r, 500));
  const replayEvent = new Promise((resolve) => { const t = setTimeout(() => resolve(null), 1200); revR.once('AI_EVENT', (d) => { clearTimeout(t); resolve(d); }); });
  revR.emit('ai_event', { sessionId: 'SEC-RP', eventType: 'PHONE_DETECTED', confidence: 1.0 });
  const replay = await replayEvent;
  results.replayToCompletedBlocked = replay === null ? 'OK (blocked)' : `FAIL (${replay.eventType})`;
  revR.close();

  // ── 12. Rate limiting: auth limiter header present; reset limiter (max 10) → 429 ──
  const hdr = await rest('POST', '/api/auth/login', { email: 'admin@trueview.ai', password: 'wrong' });
  const hasRateHeader = Boolean(hdr.headers && hdr.headers['ratelimit-remaining'] !== undefined);
  let reset429 = false;
  for (let i = 0; i < 12; i++) {
    const rr = await rest('POST', '/api/auth/forgot-password', { email: 'nobody@trueview.ai' });
    if (rr.status === 429) { reset429 = true; break; }
    await new Promise((r) => setTimeout(r, 40));
  }
  results.rateLimit = reset429 && hasRateHeader ? 'OK (auth header present + reset limiter 429)' : `FAIL (reset429=${reset429} hdr=${hasRateHeader})`;

  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error('SECURITY TEST CRASH:', e.message);
  process.exit(1);
});
