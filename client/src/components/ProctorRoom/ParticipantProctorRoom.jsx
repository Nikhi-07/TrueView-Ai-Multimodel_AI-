import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Shield, Camera, Mic, Wifi, AlertTriangle, Lock, Clock, Eye, AlertCircle, 
  RefreshCw, XCircle, UserCheck, Smartphone, Users, CheckCircle2, Activity 
} from 'lucide-react';
import useControlledMediaStream from '../../hooks/useControlledMediaStream';
import useProctorSocket from '../../hooks/useProctorSocket';
import useParticipantBroadcast from '../../hooks/useParticipantBroadcast';
import api from '../../services/api';
import { WAVAudioRecorder } from '../../utils/wavRecorder';
import { evaluateEventSeverity } from '../../utils/sessionPolicies';

export default function ParticipantProctorRoom({
  room,
  user,
  stream: initialStream,
  onExit
}) {
  const sessionId = room?.id || 'TRV-1001';
  const sessionType = room?.sessionType || room?.mode || 'EXAM';
  const isExam = sessionType === 'EXAM';

  const videoRef = useRef(null);
  const aiLoopRef = useRef(null);
  // Latest-frame strategy: only ONE AI request may be in flight at a time. If the
  // engine is still processing, the freshly captured frame is DISCARDED (stale
  // frames never accumulate in a queue). This keeps alert latency == engine
  // latency instead of engine latency × backlog.
  const aiInFlightRef = useRef(false);
  // Event transition gating: an event is sent to the server only when its state
  // CHANGES (DETECTED -> CLEARED), so a 10s phone presence emits exactly one
  // PHONE_DETECTED + one PHONE_CLEARED — never one alert per frame.
  const emittedEventStatesRef = useRef({});

  // Controlled MediaStream Hook
  const {
    stream,
    cameraStatus,
    microphoneStatus,
    startStream,
  } = useControlledMediaStream({
    initialStream,
    autoStart: true,
    onCameraInterrupted: (reason) => {
      console.warn('[ParticipantRoom] CAMERA_INTERRUPTED:', reason);
      emitMediaStatus('camera', 'INTERRUPTED', reason);
    },
    onMicrophoneInterrupted: (reason) => {
      console.warn('[ParticipantRoom] MICROPHONE_INTERRUPTED:', reason);
      emitMediaStatus('microphone', 'INTERRUPTED', reason);
    }
  });

  // Socket Hook
  const {
    socket,
    isConnected,
    sessionState,
    alerts,
    livenessChallenge,
    officialWarning,
    timerWarning,
    serverClock,
    emitMediaStatus,
    emitAIEvent,
  } = useProctorSocket({
    sessionId,
    role: 'participant',
    user,
    sessionType
  });

  // Timer & AI Telemetry State
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [voiceStatus, setVoiceStatus] = useState('NOT_CHECKED'); // NOT_CHECKED | NO_VOICE | REGISTERED_SPEAKER | UNKNOWN_SPEAKER | NOISE | UNAVAILABLE
  const aiFailureCountRef = useRef(0);
  const [aiTelemetry, setAiTelemetry] = useState({
    // Honest default: nothing has been verified yet (recognition unavailable until
    // a real SFace comparison passes). Never pre-claim VERIFIED.
    faceStatus: 'UNCERTAIN',
    faceCount: 1,
    gazeDirection: 'CENTER',
    headPose: 'Straight',
    phoneDetected: false,
    multipleFaces: false,
    aiFps: 18,
    aiLatencyMs: 0,
    trustScore: 100,
    aiEngineOnline: true
  });

  // Honest identity display tones: VERIFIED -> green, MISMATCH/ABSENT -> red,
  // UNCERTAIN (recognition unavailable) -> amber.
  const identityToneDot = aiTelemetry.faceStatus === 'VERIFIED'
    ? 'bg-emerald-400 animate-ping'
    : aiTelemetry.faceStatus === 'MISMATCH' || aiTelemetry.faceStatus === 'ABSENT'
      ? 'bg-red-500'
      : 'bg-amber-400';
  const identityToneText = aiTelemetry.faceStatus === 'VERIFIED'
    ? 'text-emerald-400'
    : aiTelemetry.faceStatus === 'MISMATCH' || aiTelemetry.faceStatus === 'ABSENT'
      ? 'text-red-400'
      : 'text-amber-400';

  // Live Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format Elapsed Time (HH:MM:SS)
  const formatTimer = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs > 0 ? String(hrs).padStart(2, '0') + ':' : ''}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Derived session state (backend-authoritative via socket)
  const currentStatus = sessionState?.status || 'LIVE';
  const isSuspended = currentStatus === 'SUSPENDED' || currentStatus === 'SUSPENDING' || cameraStatus === 'INTERRUPTED' || microphoneStatus === 'INTERRUPTED';
  const isCompleted = currentStatus === 'COMPLETED';
  const suspensionReason = sessionState?.suspensionReason || (cameraStatus === 'INTERRUPTED' ? 'CAMERA_INTERRUPTED' : microphoneStatus === 'INTERRUPTED' ? 'MICROPHONE_INTERRUPTED' : 'MONITORING_VIOLATION');

  // ── Live AI event feed (the participant receives every ALERT_CREATED/AI_EVENT
  // broadcast from the server — this panel renders them, like the Live Monitoring
  // page's alert sidebar). ──
  const alertCounts = {
    CRITICAL: alerts.filter(a => a.severity === 'CRITICAL').length,
    HIGH: alerts.filter(a => a.severity === 'HIGH').length,
    MEDIUM: alerts.filter(a => a.severity === 'MEDIUM').length,
    LOW: alerts.filter(a => a.severity === 'LOW' || a.severity === 'INFO').length,
  };
  const hasFlags = alertCounts.CRITICAL + alertCounts.HIGH > 0;

  // Flash banner for the latest HIGH/CRITICAL alert (auto-dismiss after 6s).
  const [flashAlert, setFlashAlert] = useState(null);
  const lastFlashIdRef = useRef(null);
  useEffect(() => {
    const top = alerts.find(a => a.severity === 'CRITICAL' || a.severity === 'HIGH');
    if (!top || lastFlashIdRef.current === top.eventId) return;
    lastFlashIdRef.current = top.eventId;
    setFlashAlert(top);
    const t = setTimeout(() => setFlashAlert(null), 6000);
    return () => clearTimeout(t);
  }, [alerts]);

  // ── Server-synced session timer ──
  // The backend is authoritative (browser clocks are never trusted). We capture
  // the server offset on every SESSION_TIMER_SYNC / SESSION_TIMER_UPDATE and
  // tick locally so the display updates smoothly between syncs.
  const serverOffsetRef = useRef(0);
  useEffect(() => {
    if (serverClock.serverNow) {
      serverOffsetRef.current = Number(serverClock.serverNow) - Date.now();
    }
  }, [serverClock.serverNow]);

  const effectiveServerNow = Date.now() + serverOffsetRef.current;
  const startTimeMs = sessionState?.startedAt ? new Date(sessionState.startedAt).getTime() : null;
  const endTimeMs = serverClock.endTime ? Number(serverClock.endTime) : null;
  const remainingSeconds = endTimeMs ? Math.max(0, Math.floor((endTimeMs - effectiveServerNow) / 1000)) : null;
  const serverElapsedSeconds = startTimeMs ? Math.max(0, Math.floor((effectiveServerNow - startTimeMs) / 1000)) : elapsedSeconds;

  // WebRTC broadcast to authorized reviewers (media never touches the Node server)
  useParticipantBroadcast({
    socket,
    isConnected,
    stream,
    sessionId,
    active: !isSuspended && !isCompleted && currentStatus === 'LIVE',
  });

  // On completion: stop the required media streams and end monitoring (server policy).
  useEffect(() => {
    if (isCompleted) {
      const activeStream = stream || initialStream;
      activeStream?.getTracks().forEach((t) => t.stop());
    }
  }, [isCompleted, stream, initialStream]);

  // Attach Stream to Video element
  useEffect(() => {
    const activeStream = stream || initialStream;
    if (videoRef.current && activeStream) {
      videoRef.current.srcObject = activeStream;
    }
  }, [stream, initialStream]);

  // ── Voice Monitoring (VAD + speaker verification + multi-speaker + Whisper) ──
  // Samples ~4s of audio every 25s. Speaker identity stays ECAPA-TDNN (server-side,
  // embeddings never leave the server). Whisper content analysis runs on every 4th
  // sample to avoid excessive CPU use.
  const voiceMonitorRef = useRef(null);
  const voiceCheckCounterRef = useRef(0);

  const runVoiceCheck = useCallback(async () => {
    const activeStream = stream || initialStream;
    if (!activeStream || microphoneStatus !== 'ACTIVE') return;
    if (currentStatus === 'SUSPENDED' || currentStatus === 'SUSPENDING' || currentStatus === 'COMPLETED') return;

    let recorder = null;
    try {
      recorder = new WAVAudioRecorder(activeStream, 16000);
      recorder.start();
      await new Promise((resolve) => setTimeout(resolve, 4000)); // record 4 seconds
      const audioResult = await recorder.stop();
      recorder = null;

      if (!audioResult || !audioResult.base64) return;

      // 1) Speaker identity + MULTIPLE_SPEAKERS detection (server-authoritative)
      const res = await api.post('/voice/analyze-audio', { audio: audioResult.base64 });
      const data = res.data || {};

      let eventType = 'NO_VOICE';
      let description = 'No clear speech detected in the monitored audio sample.';
      let status = 'NO_VOICE';

      if (data.speechDetected) {
        if (data.multipleSpeakers) {
          eventType = 'MULTIPLE_SPEAKERS';
          description = `Multiple distinct speakers detected in the monitored audio (${data.speakerCount || 2} estimated). Evidence-based; review recommended.`;
          status = 'MULTI';
        } else if (data.verified) {
          eventType = 'REGISTERED_SPEAKER';
          description = `Registered speaker verified (${(data.confidence * 100).toFixed(0)}% match, ${data.model}).`;
          status = 'REGISTERED_SPEAKER';
        } else {
          eventType = 'UNKNOWN_SPEAKER';
          description = `Detected voice does not match the registered participant profile (${(data.confidence * 100).toFixed(0)}% match).`;
          status = 'UNKNOWN_SPEAKER';
        }
      }

      if (data.quality && (data.quality.includes('Noise') || data.quality.includes('Clipping'))) {
        eventType = 'HIGH_BACKGROUND_NOISE';
        description = `Audio quality concern during monitoring: ${data.quality}.`;
        status = 'NOISE';
      }

      setVoiceStatus(status);
      emitAIEvent({ eventType, confidence: data.confidence || 0.85, description });

      // 2) Whisper content analysis every 4th check (speech-to-text only, never identity)
      voiceCheckCounterRef.current += 1;
      if (voiceCheckCounterRef.current % 4 === 0) {
        try {
          const speechRes = await api.post('/voice/analyze-speech', { audio: audioResult.base64 });
          const speech = speechRes.data || {};
          if (speech.available && speech.transcript) {
            const kwText = speech.keywordsFound && speech.keywordsFound.length
              ? ` Keywords flagged: ${speech.keywordsFound.join(', ')}.`
              : '';
            emitAIEvent({
              eventType: 'SPEECH_CONTENT_EVENT',
              confidence: 0.9,
              description: `Speech content: "${speech.transcript.slice(0, 140)}"${kwText} (evidence only — review recommended, not an accusation).`,
            });
          }
        } catch (_) {
          // Whisper unavailable or transient – monitoring continues without transcription
        }
      }
    } catch (err) {
      console.warn('[ParticipantRoom] Voice verification error:', err);
      setVoiceStatus('UNAVAILABLE');
    } finally {
      if (recorder) {
        try { recorder.stop(); } catch (_) {}
      }
    }
  }, [stream, initialStream, microphoneStatus, currentStatus, emitAIEvent]);

  useEffect(() => {
    if (isSuspended || currentStatus !== 'LIVE') return undefined;
    // First check shortly after entering the room, then every 25s
    const first = setTimeout(() => runVoiceCheck(), 6000);
    voiceMonitorRef.current = setInterval(runVoiceCheck, 25000);
    return () => {
      clearTimeout(first);
      if (voiceMonitorRef.current) clearInterval(voiceMonitorRef.current);
    };
  }, [isSuspended, currentStatus, runVoiceCheck]);

  // Base64 Frame Capture Helper
  const captureFrameBase64 = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.65);
  }, []);

  // Start Real-Time AI Monitoring Frame Loop (latest-frame strategy)
  // Runs as fast as the engine allows (one in-flight request), capped at ~6.7 fps.
  useEffect(() => {
    if (isSuspended || currentStatus !== 'LIVE') return;

    // Session start goes through the PROTECTED backend endpoint so the user's
    // registered face embeddings (select:false in Mongo) are supplied to the AI
    // service server-side — the browser never sees them. Without a registered
    // profile the AI service honestly reports recognition UNAVAILABLE.
    api.post('/auth/ai-session-start', {
      sessionId,
      sessionType
    }).catch((err) => {
      // 401 (stale token) or 503 (AI service down): the AI engine will still
      // lazily start the session on the first /process frame, but without the
      // registered embeddings, so identity honestly reports UNCERTAIN.
      console.warn('[ParticipantRoom] AI session start failed:', err?.response?.status || err?.message);
    });

    let stopped = false;
    let timer = null;

    const scheduleNext = (delay = 100) => {
      if (stopped) return;
      timer = setTimeout(runIteration, delay);
    };

    const runIteration = async () => {
      if (stopped) {
        return;
      }
      // Latest-frame: if the previous request is still in flight, DROP this frame
      // and re-check quickly (60ms) so a new frame fires the moment the engine
      // frees up — never waits a full cadence cycle behind a busy engine.
      if (aiInFlightRef.current) {
        scheduleNext(60);
        return;
      }
      const frame = captureFrameBase64();
      if (!frame) {
        scheduleNext();
        return;
      }

      aiInFlightRef.current = true;
      const captureTs = Date.now();

      try {
        const res = await fetch(`/ai-api/ai/session/${sessionId}/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            user_id: user?.id || 'candidate_01',
            session_type: sessionType,
            video_frame: frame,
            timestamp: Date.now() / 1000.0,
            capture_timestamp: captureTs / 1000.0,
          })
        });

        if (res.ok) {
          const data = await res.json();

          // Unified engine telemetry mapping (matches UnifiedMonitoringOutput).
          const phone = Boolean(data.environment?.phone_detected);
          const personCnt = Number(data.environment?.person_count ?? 1);
          const gaze = String(data.attention?.gaze || 'center').toUpperCase();
          const headPose = data.attention?.head_pose || 'Straight';
          const livenessStatus = String(data.liveness?.status || 'live').toLowerCase();
          // HONEST IDENTITY: VERIFIED only when the engine's real SFace comparison
          // passed. UNCERTAIN when recognition is unavailable (no model / no registered
          // profile), MISMATCH only on an actual failed comparison. Never fabricate.
          const identity = data.identity || {};
          const identityMismatch = identity.status === 'IDENTITY_MISMATCH' || identity.status === 'POSSIBLE_USER_REPLACEMENT';
          const identityUnavailable = Boolean(identity.recognition_unavailable) || identity.status === 'IDENTITY_UNCERTAIN';
          const faceStatus = livenessStatus === 'no_face' || livenessStatus === 'unknown'
            ? 'ABSENT'
            : personCnt > 1 ? 'MULTIPLE'
            : identityMismatch ? 'MISMATCH'
            : identityUnavailable ? 'UNCERTAIN'
            : 'VERIFIED';

          setAiTelemetry({
            faceStatus,
            faceCount: personCnt,
            gazeDirection: gaze,
            headPose,
            phoneDetected: phone,
            multipleFaces: personCnt > 1,
            aiFps: Math.round(Number(data.performance?.fps) || 10),
            aiLatencyMs: Math.round(Number(data.performance?.latency_ms) || 0),
            trustScore: Math.round(data.risk?.current ? 100 - data.risk.current : 100),
            aiEngineOnline: true
          });

          // Emit behaviour events ONLY on state transitions (dedup per event type).
          if (data.behaviour?.events?.length) {
            data.behaviour.events.forEach(evt => {
              const evtState = String(evt.state || 'CONFIRMED').toUpperCase();
              const lastState = emittedEventStatesRef.current[evt.type];
              if (lastState === evtState) return; // no transition -> no duplicate alert
              // Lifecycle close (RESOLVED / *_CLEARED): reset the dedup map so the
              // NEXT episode of the same event type can alert again. Without this,
              // only the FIRST gaze/phone episode would ever reach the server —
              // the second OFFSCREEN_GLANCE after GAZE_CLEARED would be skipped.
              if (evtState === 'RESOLVED') emittedEventStatesRef.current = {};
              emittedEventStatesRef.current[evt.type] = evtState;

              const severity = evaluateEventSeverity(evt.type, sessionType);
              emitAIEvent({
                eventType: evt.type,
                severity,
                confidence: evt.confidence || 0.9,
                description: evt.evidence || `AI event ${evt.type}`,
                state: evtState,
                captureTimestamp: captureTs,
              });
            });
          }

          if (data.decision?.action === 'SUSPEND_SESSION' && isExam) {
            emitAIEvent({
              eventType: 'CRITICAL_RISK_THRESHOLD',
              severity: 'CRITICAL',
              confidence: 0.98,
              description: data.decision?.reasons?.[0] || 'Monitoring thresholds exceeded',
              captureTimestamp: captureTs,
            });
          }
        }
      } catch (err) {
        // FAIL CLOSED: persistent AI engine failure emits AI_ENGINE_OFFLINE so the
        // backend can apply the session policy (EXAM -> suspension).
        aiFailureCountRef.current += 1;
        setAiTelemetry(prev => ({
          ...prev,
          aiEngineOnline: aiFailureCountRef.current < 3
        }));
        if (aiFailureCountRef.current >= 3) {
          emitAIEvent({
            eventType: 'AI_ENGINE_OFFLINE',
            confidence: 0.99,
            description: 'The AI monitoring engine is unavailable. Required monitoring cannot continue.',
          });
        }
      } finally {
        aiInFlightRef.current = false;
        scheduleNext();
      }
    };

    scheduleNext(100);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (aiLoopRef.current) clearInterval(aiLoopRef.current);
      aiLoopRef.current = null;
    };
  }, [sessionId, sessionType, isSuspended, currentStatus, isExam, user, captureFrameBase64, emitAIEvent]);

  return (
    <div className="h-screen max-h-screen bg-zinc-950 text-white flex flex-col font-sans select-none overflow-hidden">
      
      {/* Sleek Ultra-Crisp Header Bar */}
      <header className="h-14 min-h-[56px] max-h-[56px] bg-zinc-900 border-b border-zinc-800 px-6 flex items-center justify-between shrink-0 z-20">
        
        {/* Left: Branding & Session Info */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse" />
            <span className="font-extrabold tracking-widest text-sm font-mono text-white">TRUEVIEW AI</span>
          </div>

          <div className="h-4 w-px bg-zinc-700" />

          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-white text-black font-mono font-extrabold text-xs rounded uppercase tracking-wider shadow-sm">
              {sessionType} MODE
            </span>
            <h1 className="text-sm font-bold text-zinc-100 truncate max-w-xs md:max-w-md">
              {room?.title || 'Controlled Monitored Session'}
            </h1>
          </div>
        </div>

        {/* Center: Live Session Timer (server-authoritative) */}
        <div className="hidden md:flex items-center gap-4 bg-zinc-950 border border-zinc-700 px-4 py-1.5 rounded-full font-mono text-xs">
          <span className="flex items-center gap-2">
            <Clock size={14} className="text-emerald-400" />
            <span className="text-zinc-300">ELAPSED: <strong className="text-emerald-400 font-extrabold">{formatTimer(serverElapsedSeconds)}</strong></span>
          </span>
          {remainingSeconds !== null && (
            <span className="flex items-center gap-2 border-l border-zinc-700 pl-4">
              <span className="text-zinc-300">REMAINING:</span>
              <strong className={`font-extrabold ${remainingSeconds <= 60 ? 'text-red-400 animate-pulse' : remainingSeconds <= 300 ? 'text-amber-400' : 'text-white'}`}>
                {formatTimer(remainingSeconds)}
              </strong>
            </span>
          )}
        </div>

        {/* Right: Surveillance Badge & Exit */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-500/60 px-3.5 py-1.5 rounded-xl shadow-sm">
            <Shield size={14} className="text-emerald-400" />
            <span className="tracking-wide">SURVEILLANCE ACTIVE</span>
          </div>

          <button
            onClick={onExit}
            className="text-xs font-mono font-bold px-4 py-1.5 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-white transition cursor-pointer shadow-sm"
          >
            EXIT
          </button>
        </div>
      </header>

      {/* Main Viewport Container */}
      <main className="flex-1 min-h-0 p-3.5 bg-zinc-950 flex flex-col justify-between overflow-hidden max-w-6xl mx-auto w-full space-y-3">
        
        {/* Dynamic Video Stream Container */}
        <div className="relative w-full flex-1 min-h-0 bg-black rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl flex items-center justify-center">
          
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-contain ${cameraStatus === 'ACTIVE' ? 'block' : 'hidden'}`}
          />

          {/* Camera Interrupted View */}
          {cameraStatus !== 'ACTIVE' && (
            <div className="flex flex-col items-center justify-center text-center p-6 space-y-3">
              <Camera size={42} className="text-red-400 animate-pulse" />
              <p className="text-sm font-mono text-red-400 font-extrabold uppercase tracking-wider">
                CAMERA STREAM INTERRUPTED
              </p>
              <p className="text-xs text-zinc-300 max-w-xs font-medium">
                Required video monitoring stream was stopped or permissions were revoked.
              </p>
            </div>
          )}

          {/* High-Contrast HUD Overlays */}
          {cameraStatus === 'ACTIVE' && (
            <>
              {/* Top-Left: Identity HUD */}
              <div className="absolute top-3.5 left-3.5 bg-black/90 backdrop-blur-md px-4 py-2 rounded-xl border border-zinc-700 flex items-center gap-2.5 text-xs font-mono shadow-lg">
                <span className={`w-2.5 h-2.5 rounded-full ${identityToneDot}`} />
                <span className="text-zinc-200 font-bold">IDENTITY:</span>
                <span className={`font-extrabold tracking-wide ${identityToneText}`}>
                  {aiTelemetry.faceStatus}
                </span>
              </div>

              {/* Top-Right: Gaze & Pose HUD */}
              <div className="absolute top-3.5 right-3.5 bg-black/90 backdrop-blur-md px-4 py-2 rounded-xl border border-zinc-700 flex items-center gap-2.5 text-xs font-mono shadow-lg">
                <Eye size={15} className="text-emerald-400" />
                <span className="text-zinc-200 font-bold">GAZE:</span>
                <span className="text-white font-extrabold tracking-wide">{aiTelemetry.gazeDirection}</span>
              </div>

              {/* Bottom-Left: Object HUD */}
              {aiTelemetry.phoneDetected && (
                <div className="absolute bottom-3.5 left-3.5 bg-red-950/95 backdrop-blur-md px-4 py-2 rounded-xl border border-red-500 text-xs font-mono text-red-200 flex items-center gap-2 animate-bounce shadow-2xl">
                  <Smartphone size={16} className="text-red-400 shrink-0" />
                  <span className="font-extrabold tracking-wide">UNAUTHORIZED PHONE DETECTED</span>
                </div>
              )}

              {/* Bottom-Right: FPS + inference latency (real telemetry) */}
              <div className="absolute bottom-3.5 right-3.5 bg-black/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-zinc-700 text-xs font-mono text-zinc-200 shadow-lg">
                <span className="text-zinc-400 font-bold">AI ENGINE:</span> <strong className="text-emerald-400 font-extrabold">{aiTelemetry.aiFps} FPS</strong>
                {aiTelemetry.aiLatencyMs > 0 && (
                  <>
                    <span className="text-zinc-400 ml-2">INF:</span> <strong className="text-amber-300 font-extrabold">{aiTelemetry.aiLatencyMs}ms</strong>
                  </>
                )}
              </div>
            </>
          )}

          {/* Session Timer Warning Banner (server broadcast) */}
          {timerWarning && (
            <div className="absolute top-28 left-1/2 -translate-x-1/2 bg-amber-950/95 border border-amber-500 text-amber-100 px-6 py-3 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-3 z-40 max-w-md w-full">
              <Clock size={20} className="text-amber-400 shrink-0" />
              <div>
                <h4 className="text-xs font-mono font-extrabold uppercase tracking-wider text-amber-400">TIME WARNING</h4>
                <p className="text-xs mt-0.5 font-sans font-medium">{timerWarning.message}</p>
              </div>
            </div>
          )}

          {/* Official Warning Toast Banner */}
          {officialWarning && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-amber-950/95 border border-amber-500 text-amber-100 px-6 py-3 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-3 animate-pulse z-40 max-w-md w-full">
              <AlertTriangle size={20} className="text-amber-400 shrink-0" />
              <div>
                <h4 className="text-xs font-mono font-extrabold uppercase tracking-wider text-amber-400">OFFICIAL REVIEWER WARNING</h4>
                <p className="text-xs mt-0.5 font-sans font-medium leading-snug">{officialWarning.message}</p>
              </div>
            </div>
          )}

          {/* Active Liveness Challenge Notification */}
          {livenessChallenge && (
            <div className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-zinc-900/95 border border-emerald-500/80 text-white px-6 py-3 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-3 z-40">
              <Shield size={20} className="text-emerald-400 shrink-0 animate-spin" />
              <div>
                <h4 className="text-xs font-mono font-extrabold uppercase tracking-wider text-emerald-400">ACTIVE LIVENESS CHALLENGE</h4>
                <p className="text-xs mt-0.5 font-sans font-medium">Please slowly blink twice looking straight into your camera.</p>
              </div>
            </div>
          )}

          {/* HIGH / CRITICAL ALERT FLASH BANNER (instant visual feedback) */}
          {flashAlert && (
            <div className={`absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-md border animate-pulse max-w-md w-full ${
              flashAlert.severity === 'CRITICAL'
                ? 'bg-red-950/95 border-red-500 text-red-100'
                : 'bg-amber-950/95 border-amber-500 text-amber-100'
            }`}>
              <AlertTriangle size={22} className={`shrink-0 ${flashAlert.severity === 'CRITICAL' ? 'text-red-400' : 'text-amber-400'}`} />
              <div className="min-w-0">
                <h4 className="text-xs font-mono font-extrabold uppercase tracking-wider">{flashAlert.severity} — {String(flashAlert.eventType || '').replace(/_/g, ' ')}</h4>
                <p className="text-xs mt-0.5 font-sans font-medium leading-snug truncate">{flashAlert.description}</p>
              </div>
            </div>
          )}

          {/* COMPLETED OVERLAY */}
          {isCompleted && (
            <div className="absolute inset-0 bg-black/95 backdrop-blur-xl z-50 flex flex-col items-center justify-center p-6 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-950/90 border border-emerald-500 flex items-center justify-center text-emerald-400 mb-1 shadow-2xl">
                <CheckCircle2 size={36} />
              </div>
              <div className="max-w-md space-y-2">
                <span className="px-3 py-1 bg-emerald-950 text-emerald-400 font-mono text-xs font-extrabold uppercase tracking-widest border border-emerald-800 rounded">
                  SESSION COMPLETED
                </span>
                <h2 className="text-xl font-bold text-white tracking-tight">Monitoring Ended</h2>
                <p className="text-xs text-zinc-300 leading-relaxed font-sans font-medium">
                  The session timer expired or the reviewer ended the session. All monitoring and media streams have been stopped.
                </p>
              </div>
            </div>
          )}

          {/* SUSPENDED / VIOLATION OVERLAY */}
          {isSuspended && (
            <div className="absolute inset-0 bg-black/95 backdrop-blur-xl z-50 flex flex-col items-center justify-center p-6 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-red-950/90 border border-red-500 flex items-center justify-center text-red-500 mb-1 shadow-2xl">
                <XCircle size={36} />
              </div>
              <div className="max-w-md space-y-2">
                <span className="px-3 py-1 bg-red-950 text-red-400 font-mono text-xs font-extrabold uppercase tracking-widest border border-red-800 rounded">
                  SESSION SUSPENDED
                </span>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Monitoring Interrupted
                </h2>
                <p className="text-xs text-zinc-300 leading-relaxed font-sans font-medium">
                  {suspensionReason === 'CAMERA_INTERRUPTED'
                    ? 'Your session was suspended because the required camera monitoring stream was disconnected or disabled.'
                    : suspensionReason === 'MICROPHONE_INTERRUPTED'
                    ? 'Your session was suspended because the required microphone stream was interrupted.'
                    : 'Your session has been temporarily suspended because the configured AI monitoring threshold was exceeded.'}
                </p>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  onClick={() => startStream()}
                  className="px-5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs font-mono text-zinc-100 font-bold transition flex items-center gap-2 cursor-pointer shadow-lg"
                >
                  <RefreshCw size={14} />
                  <span>Reconnect Devices</span>
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Live AI Event Feed — every server broadcast, rendered in real time
            (same data the reviewer's timeline shows; the participant sees it too). */}
        <div className={`bg-zinc-900 border rounded-xl overflow-hidden shrink-0 flex flex-col ${hasFlags ? 'border-red-900/70' : 'border-zinc-800'} max-h-44`}>
          <div className="px-3.5 py-2 border-b border-zinc-800 flex items-center justify-between shrink-0">
            <span className="flex items-center gap-2 text-[10px] font-mono font-extrabold uppercase tracking-wider text-zinc-300">
              <Activity size={13} className="text-emerald-400" />
              Live AI Events
              {hasFlags && <span className="text-red-400 animate-pulse">●</span>}
            </span>
            <div className="flex items-center gap-1.5 font-mono text-[9px]">
              <span className="px-1.5 py-0.5 rounded bg-red-950/80 border border-red-800 text-red-300 font-bold">C {alertCounts.CRITICAL}</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-800 text-amber-300 font-bold">H {alertCounts.HIGH}</span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-400 font-bold">M {alertCounts.MEDIUM}</span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-500 font-bold">L {alertCounts.LOW}</span>
            </div>
          </div>
          <div className="overflow-y-auto p-2 space-y-1.5">
            {alerts.length === 0 ? (
              <div className="flex items-center justify-center text-[10px] font-mono text-zinc-600 py-3">
                <CheckCircle2 size={13} className="mr-1.5 text-emerald-500" />
                No AI events yet — monitoring is active.
              </div>
            ) : (
              alerts.slice(0, 25).map(alert => {
                const isCleared = alert.state === 'RESOLVED' || String(alert.eventType || '').toUpperCase().endsWith('_CLEARED') || alert.eventType === 'FACE_PRESENT';
                const tone = alert.severity === 'CRITICAL'
                  ? 'bg-red-950/60 border-red-800/70'
                  : alert.severity === 'HIGH'
                    ? 'bg-amber-950/50 border-amber-800/60'
                    : isCleared
                      ? 'bg-emerald-950/40 border-emerald-800/50'
                      : 'bg-zinc-950 border-zinc-800';
                return (
                  <div key={alert.eventId || alert.timestamp} className={`px-2.5 py-1.5 rounded-lg border flex items-start gap-2 ${tone}`}>
                    <span className={`mt-0.5 shrink-0 ${alert.severity === 'CRITICAL' ? 'text-red-400' : alert.severity === 'HIGH' ? 'text-amber-400' : isCleared ? 'text-emerald-400' : 'text-zinc-400'}`}>
                      {isCleared ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] font-bold uppercase text-zinc-100 truncate">
                          {String(alert.eventType || alert.type || '').replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono text-[9px] text-zinc-500 shrink-0">
                          {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      {alert.description && (
                        <p className="text-[10px] text-zinc-400 leading-snug truncate mt-0.5">{alert.description}</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* High-Contrast Telemetry Widgets */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 shrink-0">
          
          <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-xl flex items-center justify-between shadow-md">
            <div>
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider block">IDENTITY</span>
              <span className={`text-xs font-extrabold font-mono mt-0.5 block ${identityToneText}`}>
                {aiTelemetry.faceStatus === 'VERIFIED' ? 'VERIFIED ✓' : aiTelemetry.faceStatus === 'UNCERTAIN' ? 'UNCERTAIN ⚠' : aiTelemetry.faceStatus}
              </span>
            </div>
            <UserCheck size={18} className={`shrink-0 ${aiTelemetry.faceStatus === 'VERIFIED' ? 'text-emerald-400' : aiTelemetry.faceStatus === 'UNCERTAIN' ? 'text-amber-400' : 'text-red-400'}`} />
          </div>

          <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-xl flex items-center justify-between shadow-md">
            <div>
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider block">VOICE IDENTITY</span>
              <span className={`text-xs font-extrabold font-mono mt-0.5 block ${voiceStatus === 'REGISTERED_SPEAKER' ? 'text-emerald-400' : voiceStatus === 'UNKNOWN_SPEAKER' || voiceStatus === 'MULTI' || voiceStatus === 'NOISE' ? 'text-red-400' : voiceStatus === 'UNAVAILABLE' ? 'text-amber-400' : 'text-zinc-400'}`}>
                {voiceStatus === 'REGISTERED_SPEAKER' ? 'REGISTERED ✓' : voiceStatus === 'MULTI' ? 'MULTI ✕' : voiceStatus === 'UNKNOWN_SPEAKER' ? 'UNKNOWN ✕' : voiceStatus === 'NOISE' ? 'NOISE ⚠' : voiceStatus === 'UNAVAILABLE' ? 'UNAVAILABLE' : voiceStatus === 'NO_VOICE' ? 'SILENT' : '—'}
              </span>
            </div>
            <Mic size={18} className="text-zinc-300 shrink-0" />
          </div>

          <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-xl flex items-center justify-between shadow-md">
            <div>
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider block">GAZE & FOCUS</span>
              <span className="text-xs font-extrabold font-mono text-white mt-0.5 block">{aiTelemetry.gazeDirection}</span>
            </div>
            <Eye size={18} className="text-zinc-300 shrink-0" />
          </div>

          <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-xl flex items-center justify-between shadow-md">
            <div>
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider block">OBJECTS</span>
              <span className={`text-xs font-extrabold font-mono mt-0.5 block ${aiTelemetry.phoneDetected ? 'text-red-400' : 'text-emerald-400'}`}>
                {aiTelemetry.phoneDetected ? 'PHONE ✕' : 'CLEAN ✓'}
              </span>
            </div>
            <Smartphone size={18} className={aiTelemetry.phoneDetected ? 'text-red-400 shrink-0' : 'text-emerald-400 shrink-0'} />
          </div>

          <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-xl flex items-center justify-between shadow-md">
            <div>
              <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider block">TRUST SCORE</span>
              <span className="text-xs font-extrabold font-mono text-emerald-400 mt-0.5 block">{aiTelemetry.trustScore}%</span>
            </div>
            <Activity size={18} className="text-emerald-400 shrink-0" />
          </div>

        </div>

      </main>

      {/* High-Contrast Bottom Footer Status Bar */}
      <footer className="h-11 min-h-[44px] max-h-[44px] bg-zinc-900 border-t border-zinc-800 px-6 flex items-center justify-between shrink-0 font-mono text-xs text-zinc-300 z-20">
        
        {/* Left: Device Badges */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400 font-bold">CAMERA:</span>
            {cameraStatus === 'ACTIVE' ? (
              <span className="text-emerald-400 font-extrabold">ACTIVE ✓</span>
            ) : (
              <span className="text-red-400 font-extrabold">INTERRUPTED ✕</span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400 font-bold">MIC:</span>
            {microphoneStatus === 'ACTIVE' ? (
              <span className="text-emerald-400 font-extrabold">ACTIVE ✓</span>
            ) : (
              <span className="text-red-400 font-extrabold">INTERRUPTED ✕</span>
            )}
          </div>
        </div>

        {/* Center: System Connections */}
        <div className="hidden lg:flex items-center gap-6">
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400 font-bold">CONN:</span>
            <span className="text-white font-extrabold">{isConnected ? 'STABLE ●' : 'RECONNECTING...'}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400 font-bold">AI:</span>
            <span className={`font-extrabold ${aiTelemetry.aiEngineOnline ? 'text-emerald-400' : 'text-red-400'}`}>{aiTelemetry.aiEngineOnline ? 'ONLINE ●' : 'OFFLINE ✕'}</span>
          </div>
        </div>

        {/* Right: User */}
        <div className="flex items-center gap-1.5 text-zinc-400">
          <span className="font-bold">PARTICIPANT:</span>
          <span className="text-white font-extrabold">{user?.name || 'Student Candidate'}</span>
        </div>
      </footer>

    </div>
  );
}
