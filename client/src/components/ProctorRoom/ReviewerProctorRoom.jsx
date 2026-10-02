import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Shield, Camera, Mic, Eye, AlertTriangle, Play, Pause, XCircle, RefreshCw, 
  UserCheck, Activity, Clock, Filter, AlertCircle, CheckCircle2, ChevronRight, Volume2, 
  VolumeX, Volume1, Gauge, Cpu, Wifi, Activity as Pulse, Check 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useProctorSocket from '../../hooks/useProctorSocket';
import useReviewerSubscriber from '../../hooks/useReviewerSubscriber';
import VoiceCommandController from './VoiceCommandController';
import { calculateTrustScore } from '../../utils/sessionPolicies';

export default function ReviewerProctorRoom({ room, user, onExit }) {
  const sessionId = room?.id || 'TRV-1001';
  const sessionType = room?.sessionType || room?.mode || 'EXAM';

  // Socket Connection
  const {
    socket,
    isConnected,
    sessionState,
    alerts,
    trustScore,
    timerWarning,
    serverClock,
    emitReviewerCommand,
    emitAIEvent,
    subscribeStream,
    startSession,
  } = useProctorSocket({
    sessionId,
    role: 'reviewer',
    user,
    sessionType
  });

  // Real WebRTC participant feed (signaled through the authoritative server)
  const reviewerVideoRef = useRef(null);
  useReviewerSubscriber({
    socket,
    isConnected,
    sessionId,
    videoRef: reviewerVideoRef,
    active: true,
    emitAIEvent,
  });

  const [activeTab, setActiveTab] = useState('video');
  const [filterSeverity, setFilterSeverity] = useState('ALL');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const [customWarningMsg, setCustomWarningMsg] = useState('');
  const [streamRetry, setStreamRetry] = useState(0);
  const [remoteReady, setRemoteReady] = useState(false);

  // ── Real-time reviewer upgrades ─────────────────────────────────────────
  // Live alert stack + acknowledgement
  const [liveStack, setLiveStack] = useState([]);
  const [reviewedIds, setReviewedIds] = useState(() => new Set());
  // Alert sounds + text-to-speech (HIGH/CRITICAL only, configurable)
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('trueview_sound') !== '0');
  const [voiceEnabled, setVoiceEnabled] = useState(() => localStorage.getItem('trueview_voice') !== '0');
  // Performance diagnostics panel (reviewer/admin only)
  const [perfOpen, setPerfOpen] = useState(false);
  const [aiHealth, setAiHealth] = useState({ online: null, moduleHealth: null, perf: null, checkedAt: null });
  const latencySamplesRef = useRef([]);
  const audioCtxRef = useRef(null);
  const lastSpokenRef = useRef({ time: 0, text: '' });
  const lastStackIdRef = useRef(null);

  // Local tick for smooth display between server syncs
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Server-synced timer (browser clocks are never trusted)
  const serverOffsetRef = useRef(0);
  useEffect(() => {
    if (serverClock.serverNow) serverOffsetRef.current = Number(serverClock.serverNow) - Date.now();
  }, [serverClock.serverNow]);
  const effectiveServerNow = Date.now() + serverOffsetRef.current;
  const startTimeMs = sessionState?.startedAt ? new Date(sessionState.startedAt).getTime() : null;
  const endTimeMs = serverClock.endTime ? Number(serverClock.endTime) : null;
  const remainingSeconds = endTimeMs ? Math.max(0, Math.floor((endTimeMs - effectiveServerNow) / 1000)) : null;
  const serverElapsedSeconds = startTimeMs ? Math.max(0, Math.floor((effectiveServerNow - startTimeMs) / 1000)) : elapsedSeconds;

  // Re-request the participant stream when the reviewer explicitly asks
  const requestStream = () => {
    setStreamRetry(r => r + 1);
    subscribeStream();
  };

  const formatTimer = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs > 0 ? String(hrs).padStart(2, '0') + ':' : ''}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Compute Alert Counts
  const alertCounts = {
    CRITICAL: alerts.filter(a => a.severity === 'CRITICAL').length,
    HIGH: alerts.filter(a => a.severity === 'HIGH').length,
    MEDIUM: alerts.filter(a => a.severity === 'MEDIUM').length,
    LOW: alerts.filter(a => a.severity === 'LOW').length,
    INFO: alerts.filter(a => a.severity === 'INFO').length,
  };

  const filteredAlerts = alerts.filter(a => {
    if (filterSeverity === 'ALL') return true;
    if (filterSeverity === 'CRITICAL') return a.severity === 'CRITICAL';
    if (filterSeverity === 'HIGH') return a.severity === 'HIGH' || a.severity === 'CRITICAL';
    if (filterSeverity === 'VOICE') return a.eventType?.includes('VOICE') || a.eventType?.includes('SPEAKER');
    if (filterSeverity === 'SUSPICIOUS') return a.severity === 'HIGH' || a.severity === 'CRITICAL' || a.severity === 'MEDIUM';
    return true;
  });

  // Handle Reviewer Voice Command Callback
  const handleVoiceCommand = (command, payload) => {
    if (command === 'FILTER_ALERTS') {
      setFilterSeverity(payload);
    } else if (command === 'NAVIGATE_TAB') {
      setActiveTab(payload);
    } else {
      emitReviewerCommand(command, { reason: 'Voice command' });
    }
  };

  const issueOfficialWarning = () => {
    emitReviewerCommand('ISSUE_WARNING', {
      message: customWarningMsg || 'Official Reviewer Warning: Please focus on your screen.'
    });
    setWarningModalOpen(false);
    setCustomWarningMsg('');
  };

  const currentStatus = sessionState?.status || 'READY';
  const computedTrustScore = sessionState?.trustScore !== undefined ? sessionState.trustScore : calculateTrustScore(alerts, sessionType);

  // Session duration selector (minutes) — the SERVER computes endTime from this.
  const [durationMinutes, setDurationMinutes] = useState(60);
  const handleStartSession = () => {
    const durationSeconds = Math.max(1, Math.round(Number(durationMinutes) || 60)) * 60;
    startSession(durationSeconds);
  };

  // ── Alert sounds (WebAudio, no asset files needed) ──────────────────────
  const playAlertSound = useCallback((severity) => {
    if (!soundEnabled) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;
      const beeps = severity === 'CRITICAL'
        ? [[880, 0, 0.22], [660, 0.28, 0.22]]       // distinct two-tone critical
        : severity === 'HIGH'
        ? [[660, 0, 0.18], [880, 0.2, 0.18]]         // strong high
        : [[520, 0, 0.15]];                          // subtle medium
      beeps.forEach(([freq, offset, dur]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.35, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + dur + 0.05);
      });
    } catch (_) { /* audio unavailable — alerts remain visual */ }
  }, [soundEnabled]);

  // ── Text-to-speech for HIGH/CRITICAL reviewer alerts (throttled) ────────
  const speakReviewerAlert = useCallback((alert) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    if (alert.severity !== 'CRITICAL' && alert.severity !== 'HIGH') return;
    const now = Date.now();
    if (now - lastSpokenRef.current.time < 2500) return;
    const label = String(alert.eventType || '').replace(/_/g, ' ').toLowerCase();
    const text = alert.severity === 'CRITICAL'
      ? `Critical alert. ${label}.`
      : `High alert. ${label}.`;
    if (lastSpokenRef.current.text === text && now - lastSpokenRef.current.time < 6000) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.volume = 1.0;
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
      lastSpokenRef.current = { time: now, text };
    } catch (_) {}
  }, [voiceEnabled]);

  const acknowledgeAlert = useCallback((eventId) => {
    setReviewedIds(prev => new Set(prev).add(eventId));
    setLiveStack(prev => prev.filter(a => a.eventId !== eventId));
  }, []);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('trueview_sound', next ? '1' : '0');
  };

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    localStorage.setItem('trueview_voice', next ? '1' : '0');
  };

  // ── Live alert stack + sound + TTS + E2E latency sampling ───────────────
  useEffect(() => {
    const top = alerts[0];
    if (!top) return;
    // Push HIGH/CRITICAL alerts onto the transient live stack (max 5 cards).
    if ((top.severity === 'CRITICAL' || top.severity === 'HIGH') && top.eventId !== lastStackIdRef.current) {
      lastStackIdRef.current = top.eventId;
      setLiveStack(prev => [top, ...prev].slice(0, 5));
      playAlertSound(top.severity);
      speakReviewerAlert(top);
    }
    // Sample end-to-end latency (capture -> client render path).
    if (top.captureTimestamp || top.socketEmittedTimestamp) {
      const now = Date.now();
      const sample = {
        total: top.captureTimestamp ? now - top.captureTimestamp : null,
        socket: top.socketEmittedTimestamp ? now - top.socketEmittedTimestamp : null,
        server: (top.captureTimestamp && top.socketEmittedTimestamp)
          ? top.socketEmittedTimestamp - top.captureTimestamp : null,
      };
      if (sample.total !== null || sample.socket !== null) {
        latencySamplesRef.current = [...latencySamplesRef.current, sample].slice(-100);
      }
    }
  }, [alerts, playAlertSound, speakReviewerAlert]);

  // Auto-dismiss stack cards after 8s (acknowledgement also removes them).
  useEffect(() => {
    if (!liveStack.length) return;
    const timers = liveStack.map((card) =>
      setTimeout(() => setLiveStack(prev => prev.filter(a => a.eventId !== card.eventId)), 8000)
    );
    return () => timers.forEach(clearTimeout);
  }, [liveStack]);

  // Unlock WebAudio after the first user interaction (browser autoplay policy).
  useEffect(() => {
    const unlock = () => {
      try {
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
      } catch (_) {}
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // ── AI service health + rolling inference latency (reviewer-only panel) ──
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const [healthRes, perfRes] = await Promise.allSettled([
          fetch('/ai-api/health').then(r => r.json()),
          fetch('/ai-api/ai/performance').then(r => r.json()),
        ]);
        if (cancelled) return;
        const health = healthRes.status === 'fulfilled' ? healthRes.value : null;
        const perf = perfRes.status === 'fulfilled' ? perfRes.value : null;
        setAiHealth({
          online: Boolean(health && health.status === 'ok'),
          moduleHealth: (perf && perf.module_health) || (health ? null : null),
          perf: perf || null,
          checkedAt: Date.now(),
        });
      } catch (_) {
        if (!cancelled) setAiHealth(prev => ({ ...prev, online: false, checkedAt: Date.now() }));
      }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Latency stats for the performance panel (avg / P95 over last 100 samples).
  const computeLatencyStats = (key) => {
    const vals = latencySamplesRef.current.map(s => s[key]).filter(v => v !== null);
    if (!vals.length) return null;
    const sorted = [...vals].sort((a, b) => a - b);
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    return { avg, p95: Math.round(p95) };
  };

  const totalStats = computeLatencyStats('total');
  const socketStats = computeLatencyStats('socket');
  const serverStats = computeLatencyStats('server');
  const aiPerf = aiHealth.perf?.latency_ms;
  const staleCount = alerts.filter(a => a.stale).length;

  return (
    <div className="h-screen max-h-screen bg-black text-white flex flex-col font-sans select-none overflow-hidden">

      {/* LIVE ALERT STACK — CRITICAL/HIGH surface INSTANTLY, independent of the
          timeline/report system. Reviewer can acknowledge or let it auto-dismiss. */}
      <div className="fixed top-16 right-4 z-[90] flex flex-col gap-2 w-80 pointer-events-none">
        <AnimatePresence>
          {liveStack.map((alert) => (
            <motion.div
              key={alert.eventId}
              initial={{ opacity: 0, x: 70, scale: 0.94 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 70, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 480, damping: 32 }}
              className={`pointer-events-auto rounded-xl border shadow-2xl backdrop-blur-md p-3.5 ${
                alert.severity === 'CRITICAL'
                  ? 'bg-red-950/95 border-red-500/70 shadow-red-950/60'
                  : 'bg-amber-950/95 border-amber-500/70 shadow-amber-950/60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-extrabold tracking-wider ${alert.severity === 'CRITICAL' ? 'bg-red-500 text-white' : 'bg-amber-500 text-black'}`}>
                    {alert.severity}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-300">CONF {(Number(alert.confidence) * 100).toFixed(0)}%</span>
                </div>
                <button onClick={() => acknowledgeAlert(alert.eventId)} className="text-zinc-300 hover:text-white transition" title="Dismiss">
                  <XCircle size={14} />
                </button>
              </div>
              <h4 className="text-sm font-extrabold text-white uppercase tracking-wide mt-2">
                {String(alert.eventType || '').replace(/_/g, ' ')}
              </h4>
              <p className="text-[11px] text-zinc-300 mt-1 leading-snug line-clamp-2">{alert.description}</p>
              <div className="flex items-center justify-between mt-2.5">
                <span className="text-[10px] font-mono text-zinc-400">
                  {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  {alert.priority && <span className={`ml-2 ${alert.priority === 'P0' ? 'text-red-300' : 'text-emerald-300'}`}>PRI {alert.priority}</span>}
                </span>
                <button
                  onClick={() => acknowledgeAlert(alert.eventId)}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-mono font-bold flex items-center gap-1 transition cursor-pointer"
                >
                  <Check size={11} /> ACK
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      
      {/* Reviewer Header Bar (52px) */}
      <header className="h-13 min-h-[52px] max-h-[52px] bg-zinc-950 border-b border-zinc-800 px-5 flex items-center justify-between shrink-0 z-20">
        
        {/* Left: Room Title & Mode */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse" />
            <span className="font-extrabold tracking-wider text-xs font-mono text-white">TRUEVIEW AI MONITOR</span>
          </div>

          <div className="h-3.5 w-px bg-zinc-800" />

          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-white font-mono font-bold text-[11px] rounded uppercase">
              {sessionType}
            </span>
            <span className="text-xs font-semibold text-zinc-300 truncate max-w-xs">
              {room?.title || 'Live Monitored Session'}
            </span>
          </div>
        </div>

        {/* Center: Reviewer Voice Commands Engine */}
        <div className="hidden lg:flex items-center">
          <VoiceCommandController onCommandExecuted={handleVoiceCommand} />
        </div>

        {/* Right: Timer & Exit (server-authoritative) */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-lg font-mono text-xs text-zinc-300">
            <span className="flex items-center gap-1.5">
              <Clock size={13} className="text-zinc-400" />
              <span>ELAPSED: <strong className="text-emerald-400 font-extrabold">{formatTimer(serverElapsedSeconds)}</strong></span>
            </span>
            {remainingSeconds !== null && (
              <span className="flex items-center gap-1.5 border-l border-zinc-800 pl-3">
                <span>REMAINING:</span>
                <strong className={`font-extrabold ${remainingSeconds <= 60 ? 'text-red-400 animate-pulse' : remainingSeconds <= 300 ? 'text-amber-400' : 'text-white'}`}>
                  {formatTimer(remainingSeconds)}
                </strong>
              </span>
            )}
          </div>

          {/* Reviewer alert toggles: sound / voice / performance panel */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleSound}
              title={soundEnabled ? 'Alert sounds ON — click to mute' : 'Alert sounds OFF — click to enable'}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${soundEnabled ? 'border-emerald-700 bg-emerald-950/60 text-emerald-400' : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300'}`}
            >
              {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
            <button
              onClick={toggleVoice}
              title={voiceEnabled ? 'Voice alerts ON — click to mute' : 'Voice alerts OFF — click to enable'}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${voiceEnabled ? 'border-emerald-700 bg-emerald-950/60 text-emerald-400' : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300'}`}
            >
              {voiceEnabled ? <Volume1 size={14} /> : <VolumeX size={14} />}
            </button>
            <button
              onClick={() => setPerfOpen(v => !v)}
              title="Real-time performance diagnostics (reviewer only)"
              className={`p-1.5 rounded-lg border transition cursor-pointer ${perfOpen ? 'border-emerald-700 bg-emerald-950/60 text-emerald-400' : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'}`}
            >
              <Gauge size={14} />
            </button>
          </div>

          <button
            onClick={onExit}
            className="text-xs font-mono px-3 py-1 rounded-lg border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white transition font-medium cursor-pointer"
          >
            EXIT
          </button>
        </div>
      </header>

      {/* Main Grid: Participant Video (Left) + AI Monitor & Timeline (Right) */}
      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3 p-3 overflow-hidden bg-zinc-950">
        
        {/* Left Side: Live Participant Stream + Control Panel (7 cols) */}
        <div className="lg:col-span-7 flex flex-col justify-between min-h-0 h-full space-y-3 overflow-hidden">
          
          {/* Main Stream Box (flex-1 min-h-0) */}
          <div className="relative w-full flex-1 min-h-0 bg-black rounded-2xl overflow-hidden border border-zinc-800 flex items-center justify-center shadow-2xl">
            
            {/* Real WebRTC Live Stream (media never touches the Node server) */}
            <div className="w-full h-full bg-zinc-900 relative">
              <video
                ref={reviewerVideoRef}
                autoPlay
                playsInline
                muted
                onLoadedData={() => setRemoteReady(true)}
                onPlaying={() => setRemoteReady(true)}
                className={`w-full h-full object-contain ${remoteReady ? 'block' : 'hidden'}`}
              />

              {/* Fallback until the WebRTC offer/answer completes */}
              {!remoteReady && (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="flex flex-col items-center justify-center text-center space-y-2">
                    <div className="w-16 h-16 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400">
                      <Camera size={32} />
                    </div>
                    <h4 className="text-xs font-semibold text-zinc-300">
                      Candidate Stream: {room?.participants?.[0]?.name || 'Student Candidate'}
                    </h4>
                    <p className="text-[11px] font-mono text-zinc-500">
                      Status: {currentStatus} • WebRTC handshake in progress
                    </p>
                    {(sessionState?.participants?.filter(p => p.role === 'participant').length || 0) === 0 && (
                      <p className="text-[11px] font-mono text-amber-400 font-bold animate-pulse">
                        NO PARTICIPANT CONNECTED — AI ALERTS REQUIRE A PARTICIPANT IN THIS ROOM
                      </p>
                    )}
                    <button
                      onClick={requestStream}
                      className="px-3 py-1.5 bg-white text-black text-[11px] font-mono font-bold rounded-lg hover:bg-zinc-200 transition mt-1 cursor-pointer"
                    >
                      REQUEST STREAM
                    </button>
                  </div>
                </div>
              )}

              {/* HUD Overlays */}
              <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-zinc-800 text-[11px] font-mono text-emerald-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>AI MONITORING • MODE: MODERATE</span>
              </div>

              <div className="absolute top-3 right-3 bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-zinc-800 text-[11px] font-mono text-zinc-300 flex items-center gap-2">
                <UserCheck size={13} className="text-emerald-400" />
                <span>MATCH: 98.4%</span>
              </div>
            </div>

            {/* Session Timer Warning Banner */}
            {timerWarning && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-amber-950/95 border border-amber-500 text-amber-100 px-4 py-2 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-2.5 z-40 max-w-sm w-full">
                <Clock size={16} className="text-amber-400 shrink-0" />
                <span className="text-xs font-mono font-bold">{timerWarning.message}</span>
              </div>
            )}

            {/* Suspended State Banner */}
            {currentStatus === 'SUSPENDED' && (
              <div className="absolute inset-0 bg-red-950/85 backdrop-blur-md z-30 flex flex-col items-center justify-center p-6 text-center space-y-2">
                <XCircle size={40} className="text-red-400" />
                <h3 className="text-base font-bold text-white font-mono uppercase">SESSION SUSPENDED</h3>
                <p className="text-xs text-red-200 max-w-sm">
                  Reason: {sessionState?.suspensionReason || 'MONITORING_THRESHOLD_EXCEEDED'}
                </p>
                <button
                  onClick={() => emitReviewerCommand('RESUME_SESSION')}
                  className="px-4 py-1.5 bg-white text-black font-bold text-xs rounded-lg shadow-lg hover:bg-zinc-200 transition mt-1 cursor-pointer"
                >
                  RESUME SESSION
                </button>
              </div>
            )}
          </div>

          {/* Reviewer Action Controls Bar (shrink-0) */}
          <div className="bg-zinc-900 border border-zinc-800 p-2.5 rounded-xl flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              {currentStatus !== 'LIVE' && currentStatus !== 'COMPLETED' && (
                <div className="flex items-center gap-1.5 pr-2 mr-1 border-r border-zinc-700">
                  <select
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs font-mono rounded-lg px-2 py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer"
                    title="Session duration (minutes)"
                  >
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>60 min</option>
                    <option value={90}>90 min</option>
                    <option value={120}>120 min</option>
                  </select>
                  <button
                    onClick={handleStartSession}
                    className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-mono font-extrabold flex items-center gap-1.5 border border-emerald-400 shadow-lg shadow-emerald-950 transition cursor-pointer"
                  >
                    <Play size={13} />
                    <span>START SESSION</span>
                  </button>
                </div>
              )}
              <button
                onClick={() => emitReviewerCommand(currentStatus === 'WARNING' ? 'RESUME_SESSION' : 'PAUSE_SESSION')}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-semibold flex items-center gap-1.5 border border-zinc-700 transition cursor-pointer"
              >
                {currentStatus === 'WARNING' ? <Play size={13} /> : <Pause size={13} />}
                <span>{currentStatus === 'WARNING' ? 'RESUME' : 'PAUSE'}</span>
              </button>

              <button
                onClick={() => emitReviewerCommand('SUSPEND_SESSION', { reason: 'Reviewer manual suspension' })}
                className="px-3 py-1.5 rounded-lg bg-red-950/60 border border-red-800/80 hover:bg-red-900 text-red-300 text-xs font-mono font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <XCircle size={13} />
                <span>SUSPEND</span>
              </button>

              <button
                onClick={() => setWarningModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-amber-950/60 border border-amber-800/80 hover:bg-amber-900 text-amber-300 text-xs font-mono font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <AlertTriangle size={13} />
                <span>WARNING</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => emitReviewerCommand('TRIGGER_LIVENESS', { type: 'BLINK' })}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-semibold flex items-center gap-1.5 border border-zinc-700 transition cursor-pointer"
              >
                <Shield size={13} className="text-emerald-400" />
                <span>LIVENESS</span>
              </button>

              <button
                onClick={() => emitReviewerCommand('END_SESSION')}
                className="px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-xs font-mono font-semibold transition cursor-pointer"
              >
                END SESSION
              </button>
            </div>
          </div>

        </div>

        {/* Right Side: AI Metrics & Timeline Feed (5 cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between min-h-0 h-full space-y-3 overflow-hidden">
          
          {/* Top Panel: Dynamic Trust Score & Alert Counters (shrink-0) */}
          <div className="bg-zinc-900 border border-zinc-800 p-3.5 rounded-xl space-y-3 shrink-0">
            
            {/* Trust Score Meter */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">BEHAVIOUR TRUST SCORE</span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className={`text-2xl font-extrabold font-mono ${computedTrustScore >= 80 ? 'text-emerald-400' : computedTrustScore >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                    {computedTrustScore}%
                  </span>
                  <span className="text-[11px] text-zinc-500 font-mono">
                    {computedTrustScore >= 80 ? 'HIGH TRUST' : computedTrustScore >= 50 ? 'MODERATE RISK' : 'CRITICAL RISK'}
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-20 h-2.5 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700 p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${computedTrustScore >= 80 ? 'bg-emerald-400' : computedTrustScore >= 50 ? 'bg-amber-400' : 'bg-red-500'}`}
                  style={{ width: `${computedTrustScore}%` }}
                />
              </div>
            </div>

            {/* Alert Severity Counters */}
            <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-zinc-800 text-center font-mono text-[10px]">
              <div className="bg-zinc-950 p-1.5 rounded-lg border border-zinc-800">
                <span className="text-red-400 font-bold block">CRITICAL</span>
                <span className="text-sm font-bold text-red-400">{alertCounts.CRITICAL}</span>
              </div>
              <div className="bg-zinc-950 p-1.5 rounded-lg border border-zinc-800">
                <span className="text-amber-400 font-bold block">HIGH</span>
                <span className="text-sm font-bold text-amber-400">{alertCounts.HIGH}</span>
              </div>
              <div className="bg-zinc-950 p-1.5 rounded-lg border border-zinc-800">
                <span className="text-zinc-300 font-bold block">MEDIUM</span>
                <span className="text-sm font-bold text-zinc-300">{alertCounts.MEDIUM}</span>
              </div>
              <div className="bg-zinc-950 p-1.5 rounded-lg border border-zinc-800">
                <span className="text-zinc-500 font-bold block">LOW/INFO</span>
                <span className="text-sm font-bold text-zinc-500">{alertCounts.LOW + alertCounts.INFO}</span>
              </div>
            </div>

          </div>

          {/* Real-Time Performance Panel — reviewer/admin diagnostics (never shown to participants) */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shrink-0">
            <button
              onClick={() => setPerfOpen(v => !v)}
              className="w-full px-3 py-2 flex items-center justify-between text-xs font-mono text-zinc-300 hover:bg-zinc-800/60 transition cursor-pointer"
            >
              <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
                <Gauge size={13} className="text-emerald-400" /> Real-Time Performance
              </span>
              <span className="flex items-center gap-2">
                {staleCount > 0 && (
                  <span className="text-[10px] font-extrabold text-amber-400 bg-amber-950/70 border border-amber-800 px-1.5 py-0.5 rounded">
                    {staleCount} STALE
                  </span>
                )}
                <span className={`flex items-center gap-1 text-[10px] ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
                  <Wifi size={11} /> {isConnected ? 'SOCKET OK' : 'RECONNECTING'}
                </span>
                <ChevronRight size={14} className={`transition-transform ${perfOpen ? 'rotate-90' : ''}`} />
              </span>
            </button>

            {perfOpen && (
              <div className="px-3 pb-3 pt-1 space-y-2 text-[11px] font-mono text-zinc-300">
                {/* AI service health chips */}
                <div className="flex flex-wrap gap-1.5">
                  {['face_detection', 'liveness', 'gaze_tracking', 'head_pose', 'yolo', 'voice_vad'].map((mod) => {
                    const status = (aiHealth.moduleHealth && aiHealth.moduleHealth[mod]) || 'UNKNOWN';
                    const ok = status === 'READY';
                    return (
                      <span
                        key={mod}
                        className={`px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase ${ok ? 'bg-emerald-950/70 border-emerald-800 text-emerald-300' : status === 'FAILED' ? 'bg-red-950/70 border-red-800 text-red-300' : 'bg-amber-950/70 border-amber-800 text-amber-300'}`}
                        title={`${mod}: ${status}`}
                      >
                        {mod.replace('_', ' ')} {ok ? '✓' : status === 'FAILED' ? '✕' : '?'}
                      </span>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2">
                    <span className="text-[9px] text-zinc-500 uppercase tracking-wider block">AI INFERENCE (service)</span>
                    <span className="text-xs font-extrabold text-white mt-0.5 block">
                      {aiPerf ? `avg ${aiPerf.avg}ms · p95 ${aiPerf.p95}ms` : aiHealth.online === false ? 'OFFLINE' : 'measuring…'}
                    </span>
                    <span className="text-[9px] text-zinc-600 block mt-0.5">{aiHealth.perf?.samples ?? 0} samples</span>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2">
                    <span className="text-[9px] text-zinc-500 uppercase tracking-wider block">CAPTURE → SERVER</span>
                    <span className="text-xs font-extrabold text-white mt-0.5 block">
                      {serverStats ? `avg ${serverStats.avg}ms · p95 ${serverStats.p95}ms` : '—'}
                    </span>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2">
                    <span className="text-[9px] text-zinc-500 uppercase tracking-wider block">SERVER → UI</span>
                    <span className="text-xs font-extrabold text-white mt-0.5 block">
                      {socketStats ? `avg ${socketStats.avg}ms · p95 ${socketStats.p95}ms` : '—'}
                    </span>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2">
                    <span className="text-[9px] text-zinc-500 uppercase tracking-wider block">TOTAL E2E</span>
                    <span className={`text-xs font-extrabold mt-0.5 block ${totalStats && totalStats.p95 > 1000 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {totalStats ? `avg ${totalStats.avg}ms · p95 ${totalStats.p95}ms` : '—'}
                    </span>
                    {totalStats && totalStats.p95 > 1000 && (
                      <span className="text-[9px] text-red-400 block mt-0.5">PIPELINE DEGRADED — likely AI queue backlog</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1">
                  <span className="flex items-center gap-1"><Pulse size={11} /> {latencySamplesRef.current.length} measured events</span>
                  <span className={`flex items-center gap-1 ${aiHealth.online ? 'text-emerald-400' : 'text-red-400'}`}>
                    <Cpu size={11} /> AI SERVICE {aiHealth.online ? 'CONNECTED' : 'DEGRADED'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Panel: Live Event Timeline Feed (flex-1 min-h-0 overflow-hidden) */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl flex-1 min-h-0 flex flex-col overflow-hidden">
            
            {/* Timeline Filter Header */}
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-300 font-bold uppercase">
                <Activity size={13} className="text-emerald-400" />
                <span>EVENT TIMELINE</span>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-1 font-mono text-[10px]">
                <button
                  onClick={() => setFilterSeverity('ALL')}
                  className={`px-2 py-0.5 rounded border transition ${filterSeverity === 'ALL' ? 'bg-white text-black border-white font-bold' : 'bg-zinc-950 text-zinc-400 border-zinc-800'}`}
                >
                  ALL
                </button>
                <button
                  onClick={() => setFilterSeverity('CRITICAL')}
                  className={`px-2 py-0.5 rounded border transition ${filterSeverity === 'CRITICAL' ? 'bg-red-950 text-red-300 border-red-800 font-bold' : 'bg-zinc-950 text-zinc-400 border-zinc-800'}`}
                >
                  CRITICAL
                </button>
                <button
                  onClick={() => setFilterSeverity('VOICE')}
                  className={`px-2 py-0.5 rounded border transition ${filterSeverity === 'VOICE' ? 'bg-zinc-800 text-white border-zinc-700 font-bold' : 'bg-zinc-950 text-zinc-400 border-zinc-800'}`}
                >
                  VOICE
                </button>
              </div>
            </div>

            {/* Event List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredAlerts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 text-zinc-500 font-mono text-xs">
                  <CheckCircle2 size={28} className="text-zinc-700 mb-1" />
                  <p>No alerts generated yet</p>
                </div>
              ) : (
                filteredAlerts.map((alert, idx) => {
                  const isReviewed = reviewedIds.has(alert.eventId);
                  const isCleared = alert.state === 'RESOLVED' || String(alert.eventType || '').toUpperCase().endsWith('_CLEARED') || alert.eventType === 'FACE_PRESENT';
                  return (
                  <div
                    key={alert.eventId || idx}
                    className={`p-2.5 rounded-lg bg-zinc-950 border transition flex items-start gap-2.5 ${isReviewed ? 'border-emerald-900/60 opacity-70' : 'border-zinc-800 hover:border-zinc-700'}`}
                  >
                    <div className={`mt-0.5 p-1 rounded shrink-0 ${
                      alert.severity === 'CRITICAL' ? 'bg-red-950 text-red-400 border border-red-800' :
                      alert.severity === 'HIGH' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                      isCleared ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                      'bg-zinc-900 text-zinc-400'
                    }`}>
                      {isCleared ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between font-mono text-[10px]">
                        <span className="font-bold text-zinc-200 uppercase">{alert.eventType || alert.type}</span>
                        <span className="flex items-center gap-1.5">
                          {alert.stale && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-800 text-amber-400 font-extrabold text-[9px]" title="Event reached the UI after the freshness threshold (AI queue backlog)">
                              STALE
                            </span>
                          )}
                          {isCleared && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 font-extrabold text-[9px]">
                              CLEARED
                            </span>
                          )}
                          <span className="text-zinc-500">{new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                        {alert.description}
                      </p>
                      <div className="flex items-center justify-end mt-1.5">
                        <button
                          onClick={() => acknowledgeAlert(alert.eventId)}
                          disabled={isReviewed}
                          className={`px-2 py-0.5 rounded font-mono text-[9px] font-bold flex items-center gap-1 transition cursor-pointer ${
                            isReviewed ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800' : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white hover:border-zinc-600'
                          }`}
                        >
                          {isReviewed ? (<><Check size={10} /> REVIEWED</>) : (<><Check size={10} /> ACK</>)}
                        </button>
                      </div>
                    </div>
                  </div>
                  );
                })
              )}
            </div>

          </div>

        </div>

      </main>

      {/* Custom Warning Modal */}
      {warningModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 max-w-md w-full rounded-2xl p-5 space-y-3 shadow-2xl">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle size={20} />
              <h3 className="text-sm font-bold text-white">Issue Official Reviewer Warning</h3>
            </div>
            <textarea
              value={customWarningMsg}
              onChange={(e) => setCustomWarningMsg(e.target.value)}
              placeholder="Enter warning message for participant..."
              className="w-full bg-zinc-900 border border-zinc-800 text-white text-xs rounded-xl p-3 focus:outline-none focus:border-zinc-600 h-20"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setWarningModalOpen(false)}
                className="px-3.5 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs rounded-lg hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={issueOfficialWarning}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-lg"
              >
                Send Warning
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
