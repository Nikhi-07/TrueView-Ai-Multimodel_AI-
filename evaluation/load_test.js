/**
 * TrueView AI – Concurrent Session Load Test (Phase 3)
 *
 * Spawns N concurrent participant sockets across N unique sessions and measures:
 *   - socket connect time (ms)
 *   - join_room -> session_state latency (ms)
 *   - ai_event -> AI_EVENT round-trip latency (ms)
 *   - failure rate (connect / join / event failures)
 *
 * Runs locally only (127.0.0.1). Test sessions are cleaned up from Mongo afterward.
 * Node server must be running on port 5000.
 */
const { io } = require('socket.io-client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const SERVER = 'http://127.0.0.1:5000';
const LEVELS = [1, 5, 10, 25, 50];
const EVENTS_PER_SESSION = 3;

function connectSession(id) {
  return new Promise((resolve, reject) => {
    const sock = io(SERVER, { transports: ['websocket'], reconnectionAttempts: 0 });
    const t0 = Date.now();
    sock.on('connect', () => {
      const connectMs = Date.now() - t0;
      const t1 = Date.now();
      sock.once('session_state', () => {
        resolve({ sock, connectMs, joinMs: Date.now() - t1 });
      });
      sock.emit('join_room', {
        sessionId: id, role: 'participant',
        user: { id: `p-${id}`, name: `Participant ${id}` },
        sessionType: 'EXAM',
      });
    });
    sock.on('connect_error', (e) => reject(new Error('connect_error: ' + (e && e.message))));
    setTimeout(() => reject(new Error('connect timeout')), 8000);
  });
}

// Rotating distinct event types: the real-time lifecycle state machine dedups
// REPEATED detections of the same type (no alert spam by design), so each RTT
// sample uses a distinct lifecycle bucket (gaze / phone / one-shot).
const EVENT_TYPES = ['GAZE_DEVIATION', 'PHONE_DETECTED', 'SPEECH_CONTENT_EVENT'];

function measureEventRTT(sock, sessionId, idx) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const onEvent = () => resolve(Date.now() - t0);
    sock.once('AI_EVENT', onEvent);
    sock.emit('ai_event', {
      sessionId,
      eventType: EVENT_TYPES[idx % EVENT_TYPES.length],
      confidence: 0.8,
      description: 'Load test event',
    });
    setTimeout(() => { sock.off('AI_EVENT', onEvent); reject(new Error('AI_EVENT timeout')); }, 8000);
  });
}

async function runLevel(n) {
  const sockets = [];
  const failures = { connect: 0, join: 0, event: 0 };
  const connects = [];
  const joins = [];
  const rtts = [];
  const t0 = Date.now();

  for (let i = 0; i < n; i++) {
    const id = `LT-${n}-${i}-${Date.now().toString().slice(-4)}`;
    try {
      const { sock, connectMs, joinMs } = await connectSession(id);
      sock.sessionId = id; // the client tracks its own room id
      sockets.push(sock);
      connects.push(connectMs);
      joins.push(joinMs);
    } catch (e) {
      failures.connect += 1;
      failures.join += 1;
    }
  }

  // Hard cap per level so a stalled server can never hang the whole test.
  const perLevelTimeout = new Promise((resolve) => setTimeout(() => {
    sockets.forEach((s) => s.close());
    resolve();
  }, 90000));
  await Promise.race([
    (async () => {
      for (const sock of sockets) {
        for (let e = 0; e < EVENTS_PER_SESSION; e++) {
          try {
            rtts.push(await measureEventRTT(sock, sock.sessionId, e));
          } catch (err) {
            failures.event += 1;
          }
        }
      }
    })(),
    perLevelTimeout,
  ]);

  const totalMs = Date.now() - t0;
  sockets.forEach((s) => s.close());

  const mean = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
  const p95 = (a) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]);
  };

  return {
    level: n,
    sessions_attempted: n,
    sessions_connected: n - failures.connect,
    connect_mean_ms: mean(connects),
    connect_p95_ms: p95(connects),
    join_mean_ms: mean(joins),
    join_p95_ms: p95(joins),
    ai_event_rtt_mean_ms: mean(rtts),
    ai_event_rtt_p95_ms: p95(rtts),
    events_fired: sockets.length * EVENTS_PER_SESSION,
    event_failures: failures.event,
    total_wall_ms: totalMs,
    failures,
  };
}

async function cleanupTestSessions() {
  try {
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/trueview', {
      serverSelectionTimeoutMS: 30000,
    });
    const db = mongoose.connection.db; // native driver avoids mongoose buffering
    const d = await db.collection('sessions').deleteMany({ sessionId: /^LT-/ });
    const a = await db.collection('alerts').deleteMany({ sessionId: /^LT-/ });
    await mongoose.disconnect();
    return { sessions: d.deletedCount, alerts: a.deletedCount };
  } catch (e) {
    return `cleanup skipped: ${e.message}`;
  }
}

(async () => {
  const results = [];
  for (const level of LEVELS) {
    const r = await runLevel(level);
    results.push(r);
    console.log(`level ${level}: connected ${r.sessions_connected}/${level}, join ${r.join_mean_ms}ms, rtt ${r.ai_event_rtt_mean_ms}ms, failures ${JSON.stringify(r.failures)}`);
  }
  const cleanup = await cleanupTestSessions();
  const output = { results, cleanup };
  // Write a clean machine-readable JSON artifact for the graph generator.
  require('fs').writeFileSync(
    path.join(__dirname, 'results', 'load_test.json'),
    JSON.stringify(output, null, 2)
  );
  console.log('cleanup:', JSON.stringify(cleanup));
  console.log(JSON.stringify(output, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error('LOAD TEST CRASH:', e.message);
  process.exit(1);
});
