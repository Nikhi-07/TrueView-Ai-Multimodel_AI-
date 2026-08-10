/**
 * TrueView AI – Real-Time Latency Test (Section 55 of the real-time spec)
 *
 * Measures the END-TO-END latency of the live alert pipeline:
 *
 *   AI event (capture) -> server received -> socket emitted -> client received
 *
 * and verifies the new real-time guarantees:
 *   - No alert spam: 3 identical detections produce exactly ONE alert.
 *   - Lifecycle: PHONE_DETECTED -> PHONE_CLEARED produces exactly 2 events.
 *   - E2E latency stats (min / max / avg / P95) over N measured events.
 *   - Stale-event flagging when a capture timestamp is older than the threshold.
 *
 * Prereqs: Node server on port 5000 (Mongo optional — resilient mode works).
 * Usage:    node evaluation/real_time_latency_test.js [N]
 */
const { io } = require('socket.io-client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const SERVER = 'http://127.0.0.1:5000';
const N = Number(process.argv[2]) || 20; // >= 20 events per the spec

function connect(auth) {
  return io(SERVER, { transports: ['websocket'], reconnectionAttempts: 0, auth });
}
function waitFor(emitter, event, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { emitter.off(event); resolve(null); }, timeoutMs);
    emitter.once(event, (data) => { clearTimeout(t); resolve(data); });
  });
}
function pct(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * (sorted.length - 1)))];
}
function stats(vals, label) {
  if (!vals.length) return { label, min: null, max: null, avg: null, p95: null, samples: 0 };
  const sorted = [...vals].sort((a, b) => a - b);
  return {
    label,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
    p95: Math.round(pct(sorted, 95)),
    samples: vals.length,
  };
}

(async () => {
  const sid = `RT-${Date.now().toString().slice(-6)}`;
  const results = {};

  // ── Setup: reviewer + participant in an EXAM session ──
  const rev = connect({});
  await new Promise((r) => rev.on('connect', r));
  rev.emit('join_room', { sessionId: sid, role: 'reviewer', user: { id: 'admin', name: 'Admin' }, sessionType: 'EXAM' });

  const part = connect({});
  await new Promise((r) => part.on('connect', r));
  part.emit('join_room', { sessionId: sid, role: 'participant', user: { id: 'rt-p', name: 'RT User' }, sessionType: 'EXAM' });
  await new Promise((r) => setTimeout(r, 400));

  // ── Test 1: dedup — 3 identical detections -> exactly ONE alert ──
  {
    const events = [];
    const onEvt = (a) => events.push(a);
    rev.on('AI_EVENT', onEvt);
    for (let i = 0; i < 3; i++) {
      part.emit('ai_event', { sessionId: sid, eventType: 'PHONE_DETECTED', confidence: 0.92, captureTimestamp: Date.now() });
      await new Promise((r) => setTimeout(r, 150));
    }
    await new Promise((r) => setTimeout(r, 300));
    rev.off('AI_EVENT', onEvt);
    const phoneAlerts = events.filter((a) => a.eventType === 'PHONE_DETECTED' && a.state === 'DETECTED');
    results.dedup_three_detections = phoneAlerts.length === 1 ? `OK (1 alert, got ${phoneAlerts.length})` : `FAIL (expected 1, got ${phoneAlerts.length})`;
  }

  // ── Test 2: lifecycle — PHONE_DETECTED then PHONE_CLEARED -> 2 events ──
  {
    const events = [];
    const onEvt = (a) => events.push(a);
    rev.on('AI_EVENT', onEvt);
    part.emit('ai_event', { sessionId: sid, eventType: 'PHONE_CLEARED', confidence: 0.9, captureTimestamp: Date.now() });
    await new Promise((r) => setTimeout(r, 300));
    rev.off('AI_EVENT', onEvt);
    const cleared = events.filter((a) => a.eventType === 'PHONE_CLEARED');
    results.lifecycle_cleared = cleared.length === 1 && cleared[0].status === 'CLEARED'
      ? `OK (PHONE_CLEARED, status=${cleared[0].status})` : `FAIL (${JSON.stringify(cleared)})`;
  }

  // ── Test 3: E2E latency over N events (capture -> server -> socket -> UI) ──
  {
    const totalLat = [];   // captureTimestamp -> client received
    const serverLat = [];  // captureTimestamp -> serverReceivedTimestamp
    const socketLat = [];  // socketEmittedTimestamp -> client received
    // Rotating samples: after each lifecycle detection we emit its *_CLEARED
    // marker (fire-and-forget) so the SAME type can alert again on the next
    // cycle — the server's lifecycle dedup otherwise suppresses repeats.
    const SAMPLES = [
      { type: 'PHONE_DETECTED', clear: 'PHONE_CLEARED' },
      { type: 'GAZE_DEVIATION', clear: 'GAZE_CLEARED' },
      { type: 'SPEECH_CONTENT_EVENT', clear: null }, // one-shot: never deduped
    ];
    for (let i = 0; i < N; i++) {
      const s = SAMPLES[i % SAMPLES.length];
      const t0 = Date.now();
      const evt = waitFor(rev, 'AI_EVENT', 5000);
      part.emit('ai_event', {
        sessionId: sid,
        eventType: s.type,
        confidence: 0.85,
        captureTimestamp: t0,
      });
      const alert = await evt;
      if (!alert) { results.latency_error = `missing AI_EVENT for sample ${i} (${s.type})`; break; }
      const receivedAt = Date.now();
      totalLat.push(receivedAt - t0);
      if (alert.captureTimestamp) serverLat.push(alert.serverReceivedTimestamp - alert.captureTimestamp);
      if (alert.socketEmittedTimestamp) socketLat.push(receivedAt - alert.socketEmittedTimestamp);
      // Close the lifecycle so the next cycle can re-alert.
      if (s.clear) {
        part.emit('ai_event', { sessionId: sid, eventType: s.clear, confidence: 0.9 });
      }
    }
    results.total_e2e = stats(totalLat, 'capture->UI');
    results.server_segment = stats(serverLat, 'capture->server');
    results.socket_segment = stats(socketLat, 'server->UI');
    results.summary_line =
      `E2E: avg ${results.total_e2e.avg}ms, p95 ${results.total_e2e.p95}ms, ` +
      `server ${results.server_segment.avg}ms, socket ${results.socket_segment.avg}ms (${results.total_e2e.samples} samples)`;
  }

  // ── Test 4: stale-event flagging ──
  {
    const evt = waitFor(rev, 'AI_EVENT', 5000);
    part.emit('ai_event', {
      sessionId: sid,
      eventType: 'SPEECH_CONTENT_EVENT',
      confidence: 0.8,
      captureTimestamp: Date.now() - 10000, // 10s old -> stale
    });
    const alert = await evt;
    results.stale_flagging = alert && alert.stale === true
      ? 'OK (stale=true for 10s-old capture)' : `FAIL (${JSON.stringify(alert)?.slice(0, 120)})`;
  }

  console.log(JSON.stringify(results, null, 2));
  rev.close();
  part.close();
  process.exit(0);
})().catch((e) => {
  console.error('LATENCY TEST CRASH:', e.message);
  process.exit(1);
});
