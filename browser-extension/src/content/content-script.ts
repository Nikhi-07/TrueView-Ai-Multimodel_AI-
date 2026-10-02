/**
 * Content Script – TrueView AI Monitor Extension
 *
 * Full-fidelity autonomous monitoring layer.
 * Sessions are registered in MongoDB on start → appear in "My Sessions".
 * Reports are generated on stop → appear in "Reports".
 */

import { PageDetector } from './page-detector';
import { WidgetInjector } from './widget-injector';
import { TrueViewBridge } from '../bridge/trueview-client';
import { TrueViewSessionClient } from '../bridge/api-client';
import { UnifiedAIState, SessionState, ExtensionMessage } from '../types';

let pageDetector = new PageDetector();
let widgetInjector = new WidgetInjector();
let bridge = new TrueViewBridge();

let currentSessionState: SessionState = 'SESSION_AVAILABLE';
let currentAIState: UnifiedAIState | null = null;
let currentSessionId: string | null = null;
let currentRoomId: string | null = null;
let currentRoomTitle: string | null = null;
let lastSpokenTime = 0;
let lastSpokenText = '';
let logThrottle = 0; // log to backend every N frames, not every frame

let audioCtx: AudioContext | null = null;
let audioProcessor: ScriptProcessorNode | null = null;
let latestAudioSamples: number[] = [];
let localCamVideo: HTMLVideoElement | null = null;

const { adapter, info } = pageDetector.detect();
console.log(`[TrueView Extension] Active Platform: ${info.platform}`);

// ─────────────────────────────────────────────────────────────────────────────
// Spoken Alert Synthesizer
// ─────────────────────────────────────────────────────────────────────────────
function speakAlert(text: string) {
  if (!('speechSynthesis' in window)) return;
  const now = Date.now();
  if (lastSpokenText === text && (now - lastSpokenTime) < 5000) return;
  if ((now - lastSpokenTime) < 3000) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = 1.0;
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
    lastSpokenTime = now;
    lastSpokenText = text;
  } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Web Audio API VAD Sampler
// ─────────────────────────────────────────────────────────────────────────────
async function startAudioCapture() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
    const source = audioCtx.createMediaStreamSource(stream);
    audioProcessor = audioCtx.createScriptProcessor(4096, 1, 1);
    source.connect(audioProcessor);
    audioProcessor.connect(audioCtx.destination);
    audioProcessor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      latestAudioSamples = Array.from(inputData.slice(0, 1024));
    };
  } catch (_) {}
}

function stopAudioCapture() {
  if (audioProcessor) { audioProcessor.disconnect(); audioProcessor = null; }
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  latestAudioSamples = [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Video Frame Sampler
// ─────────────────────────────────────────────────────────────────────────────
async function setupLocalCameraStream() {
  if (localCamVideo) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
    localCamVideo = document.createElement('video');
    localCamVideo.srcObject = stream;
    localCamVideo.muted = true;
    localCamVideo.play();
  } catch (_) {}
}

function captureFrame(): string | null {
  let videoEl = localCamVideo;
  if (!videoEl || videoEl.videoWidth === 0) {
    const pageVideos = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];
    videoEl = pageVideos.find(v => v.videoWidth > 0 && v.videoHeight > 0) || null;
  }
  if (!videoEl || videoEl.videoWidth === 0) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Extension Message Handler
// ─────────────────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'GET_SESSION_STATE') {
    sendResponse({ sessionState: currentSessionState, platformInfo: info, aiState: currentAIState });
    return true;
  }
  if (message.type === 'START_MONITORING') {
    handleStartMonitoring().then((success) => { sendResponse({ success }); });
    return true;
  }
  if (message.type === 'STOP_MONITORING') {
    handleStopMonitoring().then(() => { sendResponse({ success: true }); });
    return true;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Start Monitoring
// ─────────────────────────────────────────────────────────────────────────────
async function handleStartMonitoring(): Promise<boolean> {
  if (currentSessionState === 'MONITORING') return true;

  const context = adapter.getSessionContext();
  currentSessionState = 'READY';
  currentSessionId = context.sessionId;

  // Extract room info from URL or context
  const urlParams = new URLSearchParams(window.location.search);
  currentRoomId = urlParams.get('room') || context.sessionId.split('-').slice(0, 2).join('-') || null;
  currentRoomTitle = document.title || 'TrueView Monitored Session';

  // 1. Initialize camera & audio
  await setupLocalCameraStream();
  await startAudioCapture();

  // 2. Register session in MongoDB immediately → appears in "My Sessions" as ACTIVE
  chrome.storage.local.get(['token', 'user'], async (data) => {
    try {
      await TrueViewSessionClient.registerSession(currentSessionId!, {
        roomId: currentRoomId || undefined,
        roomTitle: currentRoomTitle || undefined,
        mode: context.mode || 'EXAM',
        userName: data.user?.name || data.user?.fullName || undefined,
        userEmail: data.user?.email || undefined,
      });
      console.log('[TrueView Extension] Session registered in MongoDB:', currentSessionId);
    } catch (_) {}
  });

  // 3. Mount floating monitoring widget
  widgetInjector.inject(
    () => chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' }),
    () => handleStopMonitoring()
  );

  // 4. Start AI Engine perception loop
  const started = await bridge.startMonitoring(
    context.sessionId,
    context.mode,
    captureFrame,
    (aiState: UnifiedAIState) => {
      currentAIState = aiState;
      currentSessionState = 'MONITORING';

      // Update floating widget UI
      widgetInjector.updateState(
        aiState,
        'MONITORING',
        () => chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' }),
        () => handleStopMonitoring()
      );

      // Process confirmed AI events → spoken warnings
      if (aiState.behaviour?.events?.length) {
        aiState.behaviour.events.forEach(evt => {
          if (evt.type === 'PHONE_DETECTED') {
            speakAlert('Warning! Mobile phone detected. Please remove it immediately.');
          } else if (evt.type === 'BOOK_DETECTED' && context.mode === 'EXAM') {
            speakAlert('Warning! Book or notes detected during examination.');
          } else if (evt.type === 'MULTIPLE_PERSONS' && context.mode === 'EXAM') {
            speakAlert('Warning! Multiple persons detected in the room.');
          } else if (evt.type === 'SPEAKING_DETECTED' && context.mode === 'EXAM') {
            speakAlert('Warning! Voice activity detected during exam.');
          } else if (evt.type === 'PROLONGED_DISTRACTION' || evt.type === 'REPEATED_DISTRACTION') {
            speakAlert('Warning! Please focus directly on your screen.');
          }
        });
      }

      // Log AI state to Node.js backend (throttled: every 3rd frame)
      // This creates Alert documents and keeps Session risk scores updated
      logThrottle++;
      if (logThrottle % 3 === 0 && currentSessionId) {
        TrueViewSessionClient.logEvent(currentSessionId, {
          ...aiState,
          session_id: currentSessionId,
        } as any).catch(() => {});
      }

      // Broadcast to Popup & Side Panel
      chrome.runtime.sendMessage({
        type: 'AI_STATE_UPDATE',
        payload: { aiState, sessionState: 'MONITORING' },
      }).catch(() => {});
    },
    (err: string) => {
      console.error(`[TrueView Bridge Error]: ${err}`);
    }
  );

  return started;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stop Monitoring — finalizes session, generates report in MongoDB
// ─────────────────────────────────────────────────────────────────────────────
async function handleStopMonitoring(): Promise<void> {
  stopAudioCapture();
  if (localCamVideo && localCamVideo.srcObject) {
    const tracks = (localCamVideo.srcObject as MediaStream).getTracks();
    tracks.forEach(track => track.stop());
    localCamVideo = null;
  }

  // Stop FastAPI AI engine session
  await bridge.stopMonitoring();
  widgetInjector.remove();
  currentSessionState = 'COMPLETED';

  // Finalize session in Node.js backend:
  // - Marks Session as COMPLETED in MongoDB
  // - Calculates integrity score
  // - Creates Report document → appears in "Reports"
  // - Emits REPORT_CREATED + SESSION_COMPLETED via Socket.IO
  if (currentSessionId) {
    try {
      const result = await TrueViewSessionClient.finalizeSession(currentSessionId, {
        roomId: currentRoomId || undefined,
        roomTitle: currentRoomTitle || undefined,
      });
      console.log('[TrueView Extension] Session finalized:', result);
      if (result.success && result.reportId) {
        console.log(`[TrueView Extension] Report generated: ${result.reportId} | Integrity: ${result.integrityScore ?? 'N/A'}%`);
      }
    } catch (err) {
      console.error('[TrueView Extension] Failed to finalize session:', err);
    }
  }

  currentAIState = null;
  currentSessionId = null;
  currentRoomId = null;

  chrome.runtime.sendMessage({
    type: 'AI_STATE_UPDATE',
    payload: { aiState: null, sessionState: 'COMPLETED' },
  }).catch(() => {});
}
