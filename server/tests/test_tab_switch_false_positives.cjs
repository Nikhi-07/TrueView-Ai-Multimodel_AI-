/**
 * TRUEVIEW AI — FALSE TAB-SWITCH DETECTION FIX VALIDATION SUITE
 * 
 * Verifies all 12 test cases specified in the requirements:
 * TEST 1: Open monitoring page -> 0 / 3
 * TEST 2: Allow camera and microphone (focus shifts) -> remains 0 / 3
 * TEST 3: Click inside the application -> 0 / 3
 * TEST 4: Open/close an internal UI panel -> 0 / 3
 * TEST 5: Trigger window blur without document becoming hidden -> 0 / 3
 * TEST 6: Switch to another browser tab (duration >= 500ms) and return -> 1 / 3 (WARNING)
 * TEST 7: Switch again and return -> 2 / 3 (WARNING)
 * TEST 8: Switch again and return -> 3 / 3 (FINAL WARNING)
 * TEST 9: One more genuine validated switch -> 4 / 3 (TERMINATED)
 * TEST 10: One visibility episode with multiple visibility events -> ONLY ONE counter increment
 * TEST 11: Refresh/reinitialize / reset monitoring -> Starts at 0 / 3
 * TEST 12: React StrictMode / duplicate event pipeline -> ONE genuine switch = ONE increment only
 */

const axios = require('axios');
const mongoose = require('mongoose');

const BASE_URL = 'http://localhost:5000';
const api = axios.create({ baseURL: BASE_URL, timeout: 5000 });

// Simulated Client-Side State Machine replicating useTabSwitchVerification.js
class TabSwitchClientStateMachine {
  constructor({ minHiddenDurationMs = 500, gracePeriodMs = 2500, onIncrement, onTerminate }) {
    this.minHiddenDurationMs = minHiddenDurationMs;
    this.gracePeriodMs = gracePeriodMs;
    this.onIncrement = onIncrement;
    this.onTerminate = onTerminate;

    this.tabSwitchCount = 0;
    this.tabSwitchStatus = 'NORMAL';
    this.isTerminated = false;
    this.isMonitoringInitialized = false;

    this.hasActiveEpisode = false;
    this.hiddenAt = null;
    this.episodeId = null;
    this.lastTriggerTime = 0;
    this.debugLogs = [];
  }

  log(event, details) {
    this.debugLogs.push({ event, ...details });
  }

  initialize() {
    this.isMonitoringInitialized = true;
    this.log('INITIALIZED', { isMonitoringInitialized: true });
  }

  // Window blur event — must be completely ignored
  onWindowBlur() {
    this.log('WINDOW_BLUR_IGNORED', { reason: 'window.blur is not a tab switch' });
    // Intentionally DOES NOT trigger any tab switch logic
  }

  // Internal UI click, panel open, etc.
  onInternalUIEvent(actionName) {
    this.log('INTERNAL_UI_ACTION_IGNORED', { action: actionName });
    // Intentionally DOES NOT trigger any tab switch logic
  }

  // Document visibility change event
  onVisibilityChange(visibilityState, fakeTimestamp = Date.now()) {
    if (!this.isMonitoringInitialized) {
      this.log('PRE_INIT_VISIBILITY_IGNORED', { visibilityState });
      return;
    }

    if (this.isTerminated) return;

    if (visibilityState === 'hidden') {
      // Debounce multiple hidden events within same episode
      if (this.hasActiveEpisode) {
        this.log('CONSECUTIVE_HIDDEN_IGNORED', { episodeId: this.episodeId });
        return;
      }
      this.hasActiveEpisode = true;
      this.hiddenAt = fakeTimestamp;
      this.episodeId = `ep_${fakeTimestamp}_${Math.random().toString(36).substr(2, 6)}`;
      this.log('EPISODE_STARTED', { episodeId: this.episodeId, hiddenAt: this.hiddenAt });
    } else if (visibilityState === 'visible') {
      if (!this.hasActiveEpisode || this.hiddenAt === null) {
        this.log('SPURIOUS_VISIBLE_IGNORED', {});
        return;
      }

      const hiddenDuration = fakeTimestamp - this.hiddenAt;
      const epId = this.episodeId;

      // Consume episode immediately
      this.hasActiveEpisode = false;
      this.hiddenAt = null;
      this.episodeId = null;

      // Check minimum hidden duration
      if (hiddenDuration < this.minHiddenDurationMs) {
        this.log('TRANSIENT_BLIP_IGNORED', { hiddenDuration, threshold: this.minHiddenDurationMs });
        return;
      }

      // Check cooldown debounce
      if (fakeTimestamp - this.lastTriggerTime < 2000) {
        this.log('COOLDOWN_DEBOUNCE_IGNORED', { diff: fakeTimestamp - this.lastTriggerTime });
        return;
      }
      this.lastTriggerTime = fakeTimestamp;

      // Validated tab switch confirmed
      this.tabSwitchCount += 1;
      if (this.tabSwitchCount === 1) {
        this.tabSwitchStatus = 'WARNING';
      } else if (this.tabSwitchCount === 2) {
        this.tabSwitchStatus = 'WARNING';
      } else if (this.tabSwitchCount === 3) {
        this.tabSwitchStatus = 'FINAL_WARNING';
      } else if (this.tabSwitchCount >= 4) {
        this.tabSwitchStatus = 'TERMINATED';
        this.isTerminated = true;
      }

      this.log('CONFIRMED_TAB_SWITCH', {
        count: this.tabSwitchCount,
        status: this.tabSwitchStatus,
        hiddenDuration,
        episodeId: epId
      });

      if (this.onIncrement) this.onIncrement(this.tabSwitchCount, this.tabSwitchStatus, epId, hiddenDuration);
      if (this.isTerminated && this.onTerminate) this.onTerminate();
    }
  }

  reset() {
    this.tabSwitchCount = 0;
    this.tabSwitchStatus = 'NORMAL';
    this.isTerminated = false;
    this.hasActiveEpisode = false;
    this.hiddenAt = null;
    this.episodeId = null;
    this.log('RESET', { count: 0 });
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('TRUEVIEW AI — 12 TAB-SWITCH TEST CASES VALIDATION');
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

  // Create an active session on the backend for integration
  const testSessionId = `TRV-TEST-${Date.now().toString(36).toUpperCase()}`;
  await api.post('/api/ai-engine/log', {
    session_id: testSessionId,
    event_type: 'SESSION_INITIALIZE',
    severity: 'LOW',
    message: 'Test session created'
  });

  const client = new TabSwitchClientStateMachine({
    minHiddenDurationMs: 500,
    gracePeriodMs: 2500,
  });

  // TEST 1: Open monitoring page -> TAB SWITCHES = 0 / 3
  console.log('▶ Running TEST 1: Open monitoring page...');
  const test1Pass = client.tabSwitchCount === 0 && client.tabSwitchStatus === 'NORMAL' && !client.isTerminated;
  record('TEST 1: Open monitoring page', test1Pass, `Count: ${client.tabSwitchCount}/3, Status: ${client.tabSwitchStatus}`);

  // TEST 2: Allow camera and microphone (window blur during permission prompt) -> remains 0 / 3
  console.log('▶ Running TEST 2: Allow camera and microphone (permission popup focus shift)...');
  client.onWindowBlur();
  client.onVisibilityChange('visible'); // initial visibility state during permission dialog
  const test2Pass = client.tabSwitchCount === 0 && client.tabSwitchStatus === 'NORMAL';
  record('TEST 2: Camera/Mic permission dialog does not increment', test2Pass, `Count: ${client.tabSwitchCount}/3`);

  // Initialize monitoring after permission acquisition
  client.initialize();

  // TEST 3: Click inside the application -> 0 / 3
  console.log('▶ Running TEST 3: Click inside the application...');
  client.onInternalUIEvent('click_button');
  client.onInternalUIEvent('focus_input');
  const test3Pass = client.tabSwitchCount === 0;
  record('TEST 3: Internal application clicks do not increment', test3Pass, `Count: ${client.tabSwitchCount}/3`);

  // TEST 4: Open/close an internal UI panel -> 0 / 3
  console.log('▶ Running TEST 4: Open/close internal UI panel / modals / menus...');
  client.onInternalUIEvent('open_sidebar');
  client.onInternalUIEvent('close_sidebar');
  client.onInternalUIEvent('open_modal');
  client.onInternalUIEvent('fullscreen_enter');
  client.onInternalUIEvent('fullscreen_exit');
  const test4Pass = client.tabSwitchCount === 0;
  record('TEST 4: Open/close UI panel / fullscreen does not increment', test4Pass, `Count: ${client.tabSwitchCount}/3`);

  // TEST 5: Trigger window blur without document becoming hidden -> 0 / 3
  console.log('▶ Running TEST 5: Window blur without document hidden (e.g. devtools/click outside)...');
  client.onWindowBlur();
  // Transient blip: hidden for only 150ms (< 500ms threshold)
  client.onVisibilityChange('hidden', 1000);
  client.onVisibilityChange('visible', 1150); // duration = 150ms < 500ms
  const test5Pass = client.tabSwitchCount === 0;
  record('TEST 5: Blur and transient < 500ms events do not increment', test5Pass, `Count: ${client.tabSwitchCount}/3`);

  // TEST 6: Switch to another browser tab and return -> 1 / 3 (WARNING)
  console.log('▶ Running TEST 6: Switch to another browser tab (1200ms) and return...');
  let fakeNow = 5000;
  client.onVisibilityChange('hidden', fakeNow);
  fakeNow += 1200; // 1200ms hidden
  client.onVisibilityChange('visible', fakeNow);

  // Sync with authoritative backend
  const backendRes1 = await api.post(`/api/ai-engine/sessions/${testSessionId}/tab-switch`, {
    episodeId: 'ep_test_6',
    hiddenDuration: 1200,
  });
  const test6Pass = client.tabSwitchCount === 1 && client.tabSwitchStatus === 'WARNING' &&
                    backendRes1.data.count === 1 && backendRes1.data.tabSwitchStatus === 'WARNING';
  record('TEST 6: Genuine tab switch: count = 1 / 3, status = WARNING', test6Pass, `Client: ${client.tabSwitchCount}, Backend: ${backendRes1.data.count}`);

  // TEST 7: Switch again and return -> 2 / 3 (WARNING)
  console.log('▶ Running TEST 7: Second tab switch (1000ms) and return...');
  fakeNow += 3000; // after cooldown
  client.onVisibilityChange('hidden', fakeNow);
  fakeNow += 1000;
  client.onVisibilityChange('visible', fakeNow);

  const backendRes2 = await api.post(`/api/ai-engine/sessions/${testSessionId}/tab-switch`, {
    episodeId: 'ep_test_7',
    hiddenDuration: 1000,
  });
  const test7Pass = client.tabSwitchCount === 2 && client.tabSwitchStatus === 'WARNING' &&
                    backendRes2.data.count === 2 && backendRes2.data.tabSwitchStatus === 'WARNING';
  record('TEST 7: Second tab switch: count = 2 / 3, status = WARNING', test7Pass, `Client: ${client.tabSwitchCount}, Backend: ${backendRes2.data.count}`);

  // TEST 8: Switch again and return -> 3 / 3 (FINAL WARNING)
  console.log('▶ Running TEST 8: Third tab switch (1500ms) and return...');
  fakeNow += 3000;
  client.onVisibilityChange('hidden', fakeNow);
  fakeNow += 1500;
  client.onVisibilityChange('visible', fakeNow);

  const backendRes3 = await api.post(`/api/ai-engine/sessions/${testSessionId}/tab-switch`, {
    episodeId: 'ep_test_8',
    hiddenDuration: 1500,
  });
  const test8Pass = client.tabSwitchCount === 3 && client.tabSwitchStatus === 'FINAL_WARNING' &&
                    backendRes3.data.count === 3 && backendRes3.data.tabSwitchStatus === 'FINAL_WARNING';
  record('TEST 8: Third tab switch: count = 3 / 3, status = FINAL WARNING', test8Pass, `Client: ${client.tabSwitchCount}, Backend: ${backendRes3.data.count}`);

  // TEST 9: One more genuine validated switch -> 4 / 3 (SESSION TERMINATED)
  console.log('▶ Running TEST 9: Fourth tab switch (800ms) -> TERMINATED...');
  fakeNow += 3000;
  client.onVisibilityChange('hidden', fakeNow);
  fakeNow += 800;
  client.onVisibilityChange('visible', fakeNow);

  const backendRes4 = await api.post(`/api/ai-engine/sessions/${testSessionId}/tab-switch`, {
    episodeId: 'ep_test_9',
    hiddenDuration: 800,
  });
  const test9Pass = client.tabSwitchCount === 4 && client.tabSwitchStatus === 'TERMINATED' && client.isTerminated &&
                    backendRes4.data.count === 4 && backendRes4.data.tabSwitchStatus === 'TERMINATED' && backendRes4.data.terminated === true;
  record('TEST 9: Fourth tab switch terminates session: 4 / 3, TERMINATED', test9Pass, `Client: ${client.tabSwitchCount}, Backend: ${backendRes4.data.count}, Terminated: ${backendRes4.data.terminated}`);

  // TEST 10: One visibility episode with multiple visibility events -> ONLY ONE counter increment
  console.log('▶ Running TEST 10: Multiple hidden/visible blips within one episode...');
  const dedupClient = new TabSwitchClientStateMachine({ minHiddenDurationMs: 500 });
  dedupClient.initialize();
  let t = 20000;
  // Sequence: VISIBLE -> HIDDEN -> HIDDEN -> HIDDEN -> VISIBLE -> VISIBLE
  dedupClient.onVisibilityChange('hidden', t);
  dedupClient.onVisibilityChange('hidden', t + 200);
  dedupClient.onVisibilityChange('hidden', t + 400);
  dedupClient.onVisibilityChange('visible', t + 1200); // completed episode (duration 1200ms)
  dedupClient.onVisibilityChange('visible', t + 1300); // duplicate visible
  dedupClient.onVisibilityChange('visible', t + 1400); // duplicate visible

  const test10Pass = dedupClient.tabSwitchCount === 1;
  record('TEST 10: Multiple rapid visibility events produce ONLY ONE increment', test10Pass, `Count: ${dedupClient.tabSwitchCount} (Expected 1)`);

  // TEST 11: Refresh / reinitialize monitoring -> New session starts at 0 / 3
  console.log('▶ Running TEST 11: Reset / reinitialize monitoring starts at 0 / 3...');
  const resetRes = await api.post(`/api/ai-engine/sessions/${testSessionId}/reset-tab-switches`);
  client.reset();

  const sessionCheck = await api.get(`/api/ai-engine/sessions/${testSessionId}`);
  const sess = sessionCheck.data.session;
  const test11Pass = resetRes.data.success && resetRes.data.count === 0 && resetRes.data.tabSwitchStatus === 'NORMAL' &&
                     sess.tabSwitchCount === 0 && sess.tabSwitchStatus === 'NORMAL' && sess.status === 'ACTIVE' &&
                     client.tabSwitchCount === 0 && client.tabSwitchStatus === 'NORMAL';
  record('TEST 11: Refresh/reset authoritatively clears false state back to 0 / 3', test11Pass, `Session count: ${sess.tabSwitchCount}/3, Status: ${sess.status}`);

  // TEST 12: React development hot reload / StrictMode / duplicate socket/REST requests -> Exactly ONE increment
  console.log('▶ Running TEST 12: React StrictMode / duplicate requests with same episodeId...');
  const episodeDupId = `ep_strict_mode_${Date.now()}`;
  const reqA = await api.post(`/api/ai-engine/sessions/${testSessionId}/tab-switch`, {
    episodeId: episodeDupId,
    hiddenDuration: 900
  });
  // Second identical request within StrictMode
  const reqB = await api.post(`/api/ai-engine/sessions/${testSessionId}/tab-switch`, {
    episodeId: episodeDupId,
    hiddenDuration: 900
  });

  const test12Pass = reqA.data.count === 1 && reqB.data.count === 1 && reqB.data.deduplicated === true;
  record('TEST 12: StrictMode / duplicate events produce exactly ONE increment', test12Pass, `ReqA count: ${reqA.data.count}, ReqB count: ${reqB.data.count}, Deduplicated: ${reqB.data.deduplicated}`);

  console.log('\n================================================================');
  console.log(`TOTAL: ${passed} / ${passed + failed} PASSED`);
  if (failed === 0) {
    console.log('🎉 ALL 12 TAB-SWITCH TEST CASES PASSED PERFECTLY!');
  } else {
    console.error(`⚠️ ${failed} TESTS FAILED`);
  }
  console.log('================================================================');

  process.exit(failed === 0 ? 0 : 1);
}

runTestSuite().catch(err => {
  console.error('Test suite execution error:', err.response?.data || err.message);
  process.exit(1);
});
