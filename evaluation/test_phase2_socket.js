/**
 * Phase 2 socket smoke test:
 *  1. Timer: start_session with a 3-second duration → SESSION_TIMER_SYNC arrives
 *     with a server endTime, and the session auto-completes on expiry.
 *  2. WebRTC auth: an offer from a participant to a NON-admin socket must be
 *     blocked; an offer to an authenticated admin reviewer must be relayed.
 *
 * Requires the Node server (port 5000) to be running.
 */
const { io } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const path = require('path');

// Load the server's env so we sign with the same JWT secret.
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const SERVER = 'http://127.0.0.1:5000';
const SESSION = `PH2-TIMER-${Date.now().toString().slice(-5)}`;

function connect(auth) {
  return io(SERVER, { transports: ['websocket'], auth });
}

const TEST_ADMIN_EMAIL = 'ph2.test.admin@trueview.ai';

async function connectWithRetry() {
  const mongoose = require('mongoose');
  for (let i = 1; i <= 5; i++) {
    try {
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/trueview', {
        serverSelectionTimeoutMS: 30000,
        connectTimeoutMS: 30000,
      });
      if (mongoose.connection.readyState === 1) return mongoose;
    } catch (e) {
      console.log(`[db attempt ${i}] connect failed: ${e.message}`);
    }
    await mongoose.disconnect().catch(() => {});
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error('Could not establish a stable Mongo connection');
}

// Use the NATIVE driver for lookups: mongoose model buffering is unreliable when the
// Atlas cluster is slow to accept the first operation, while the native driver simply
// waits on the connection pool.
async function findAdminToken() {
  const mongoose = await connectWithRetry();
  const db = mongoose.connection.db;
  const bcrypt = require(path.join(__dirname, '..', 'server', 'node_modules', 'bcryptjs'));
  const users = db.collection('users');

  let admin = await users.findOne({ role: 'admin' }, { projection: { fullName: 1, role: 1, email: 1 } });
  if (!admin) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('TestAdmin123!', salt);
    const now = new Date();
    admin = await users.insertOne({
      fullName: 'Phase2 Test Admin',
      email: TEST_ADMIN_EMAIL,
      password: hash,
      role: 'admin',
      registrationStatus: 'ACTIVE',
      faceRegistered: true,
      voiceRegistered: true,
      status: 'Active',
      createdAt: now,
      updatedAt: now,
    });
    admin = { _id: admin.insertedId, role: 'admin', email: TEST_ADMIN_EMAIL };
    console.log('Created temporary admin for test:', admin.email);
  }
  await mongoose.disconnect();
  return jwt.sign({ id: String(admin._id), role: admin.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

async function cleanupTestAdmin() {
  const mongoose = await connectWithRetry();
  const d = await mongoose.connection.db.collection('users').deleteOne({ email: TEST_ADMIN_EMAIL });
  await mongoose.disconnect();
  console.log('Cleaned up temp admin:', d.deletedCount);
}

function waitFor(emitter, event, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    emitter.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

(async () => {
  const results = {};

  // ── Admin reviewer token ──
  let adminToken = null;
  try {
    adminToken = await findAdminToken();
    results.adminToken = 'OK';
  } catch (e) {
    results.adminToken = `SKIPPED: ${e.message}`;
  }

  // ── Participant + reviewer join the timer session ──
  const participant = connect({});
  const reviewer = connect({ token: adminToken || undefined });
  await new Promise((r) => participant.on('connect', r));
  await new Promise((r) => reviewer.on('connect', r));

  participant.emit('join_room', { sessionId: SESSION, role: 'participant', user: { id: 'p1', name: 'Participant One' }, sessionType: 'EXAM' });
  reviewer.emit('join_room', { sessionId: SESSION, role: 'reviewer', user: { id: 'admin1', name: 'Admin' }, sessionType: 'EXAM' });
  await new Promise((r) => setTimeout(r, 500));

  // ── Test 1: participant must NOT be able to start the session timer ──
  const livePromise = waitFor(participant, 'SESSION_STATE_CHANGED', 1500);
  participant.emit('start_session', { sessionId: SESSION, sessionDuration: 9999 });
  const liveEvent = await livePromise;
  results.participantCannotStart = !liveEvent || liveEvent.status !== 'LIVE'
    ? 'OK (blocked)'
    : `FAIL (participant started session → ${liveEvent.status})`;

  // ── Test 2: reviewer starts session with 3s duration ──
  const syncPromise = waitFor(participant, 'SESSION_TIMER_SYNC', 5000);
  reviewer.emit('start_session', { sessionId: SESSION, sessionDuration: 3 });
  const sync = await syncPromise;
  results.timerSync = sync && sync.endTime ? 'OK (endTime present)' : `FAIL (${JSON.stringify(sync)?.slice(0, 120)})`;

  // ── Test 3: auto-complete on expiry ──
  const completed = await waitFor(participant, 'SESSION_COMPLETED', 8000);
  results.timerAutoComplete = completed ? `OK (completedByTimer=${completed.completedByTimer})` : 'FAIL (no SESSION_COMPLETED within 8s)';

  // ── Test 4: WebRTC offer participant -> non-admin must be blocked ──
  const targetSocket = connect({}); // unauthenticated socket
  await new Promise((r) => targetSocket.on('connect', r));
  targetSocket.emit('join_room', { sessionId: SESSION, role: 'participant', user: { id: 'p2', name: 'Other' }, sessionType: 'EXAM' });
  await new Promise((r) => setTimeout(r, 300));
  const blockedPromise = waitFor(targetSocket, 'webrtc_signal', 1500);
  participant.emit('webrtc_signal', {
    sessionId: SESSION,
    target: targetSocket.id,
    signal: { type: 'offer', sdp: 'fake-sdp-to-non-admin' },
  });
  const blocked = await blockedPromise;
  results.webrtcBlockedNonAdmin = blocked === null ? 'OK (blocked)' : 'FAIL (relayed to non-admin!)';

  // ── Test 5: WebRTC offer participant -> admin reviewer must be relayed ──
  const relayPromise = waitFor(reviewer, 'webrtc_signal', 3000);
  participant.emit('webrtc_signal', {
    sessionId: SESSION,
    target: reviewer.id,
    signal: { type: 'offer', sdp: 'fake-sdp-to-admin' },
  });
  const relayed = await relayPromise;
  results.webrtcRelayedToAdmin = relayed && relayed.signal && relayed.signal.type === 'offer' ? 'OK (relayed)' : `FAIL (${JSON.stringify(relayed)?.slice(0, 100)})`;

  console.log(JSON.stringify(results, null, 2));
  participant.close();
  reviewer.close();
  targetSocket.close();
  try {
    await cleanupTestAdmin();
  } catch (e) {
    console.log('cleanup skipped:', e.message);
  }
  process.exit(0);
})().catch((e) => {
  console.error('TEST CRASH:', e.message);
  process.exit(1);
});
