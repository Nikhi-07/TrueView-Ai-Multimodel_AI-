import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, Users, MessageSquare, Info, ShieldAlert, AlertTriangle, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CameraFeed from '../components/Camera/CameraFeed';

const CONTEXT_OPTIONS = [
  { id: 'EXAM', label: 'Examination (Strict)' },
  { id: 'INTERVIEW', label: 'Interview (Conversational)' },
  { id: 'ONLINE_CLASS', label: 'Online Class' },
  { id: 'MEETING', label: 'Meeting' },
  { id: 'WORKPLACE', label: 'Workplace' }
];

export default function LiveMonitoring() {
  const [isMonitoringActive, setIsMonitoringActive] = useState(false);
  const [sessionType, setSessionType] = useState('EXAM');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [terminationReason, setTerminationReason] = useState(null);
  const [engineResult, setEngineResult] = useState(null);
  
  // UI Controls (Visual only for now, can be hooked to actual WebRTC later)
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const [alerts, setAlerts] = useState([]);

  const cameraFeedRef = useRef(null);
  const sessionIdRef = useRef(`session_${Date.now()}`);
  const timerRef = useRef(null);
  const unifiedLoopRef = useRef(null);
  // Host report is generated ONCE per session (guard against double-fire from
  // kickout + unmount cleanup).
  const reportGeneratedRef = useRef(false);
  const audioContextRef = useRef(null);
  const audioProcessorRef = useRef(null);
  const audioSamplesRef = useRef([]);
  const lastSpokenRef = useRef({ time: 0, text: '' });

  // Latest-frame strategy: at most ONE AI request in flight. If the engine is
  // still busy, the fresh frame is dropped instead of queuing stale frames, so
  // alert latency tracks engine latency (never engine latency × backlog).
  const aiInFlightRef = useRef(false);
  const monitoringActiveRef = useRef(false);
  // Event transition gating: only state CHANGES create alerts / DB rows.
  const emittedEventsRef = useRef({});

  const speakAlert = useCallback((text) => {
    if (!('speechSynthesis' in window)) return;
    const now = Date.now();
    if (lastSpokenRef.current.text === text && (now - lastSpokenRef.current.time) < 4000) return;
    if ((now - lastSpokenRef.current.time) < 2500) return;

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.volume = 1.0;
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
      lastSpokenRef.current = { time: now, text };
    } catch (_) {}
  }, []);

  // Session Timer
  useEffect(() => {
    if (isMonitoringActive) {
      setElapsedTime(0);
      timerRef.current = setInterval(() => setElapsedTime(prev => prev + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isMonitoringActive]);

  const formatTime = (s) => {
    const h = Math.floor(s / 3600).toString().padStart(2, '0');
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    if (s < 3600) return `${m}:${sec}`;
    return `${h}:${m}:${sec}`;
  };

  const startAudioCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      audioProcessorRef.current = processor;
      source.connect(processor);
      processor.connect(audioCtx.destination);

      processor.onaudioprocess = (e) => {
        const samples = Array.from(e.inputBuffer.getChannelData(0));
        audioSamplesRef.current = samples.slice(0, 1024);
      };
    } catch (_) {}
  };

  const stopAudioCapture = () => {
    if (audioProcessorRef.current) { audioProcessorRef.current.disconnect(); audioProcessorRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
    audioSamplesRef.current = [];
  };

  // Generate the host report from ALL recorded alerts (same as the Proctor Room
  // auto-report). Runs once per session; the host sees it on the Reports page.
  const generateHostReport = async () => {
    if (reportGeneratedRef.current) return;
    reportGeneratedRef.current = true;
    await fetch('/api/reports/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('trueview_token')}`
      },
      body: JSON.stringify({ sessionId: sessionIdRef.current })
    }).catch(() => {});
  };

  const stopMonitoringDueToKickout = async () => {
    stopAudioCapture();
    monitoringActiveRef.current = false;
    if (unifiedLoopRef.current) clearTimeout(unifiedLoopRef.current);
    // Generate the report BEFORE the stop call so an immediate navigation/exit
    // cannot abort it (the report request is awaited).
    await generateHostReport();
    await fetch(`/ai-api/ai/session/${sessionIdRef.current}/stop`, { method: 'POST' }).catch(() => {});
    setIsMonitoringActive(false);
  };

  const addAlert = (msg, type) => {
    setAlerts(prev => {
      if (prev.length > 0 && prev[0].msg === msg && (Date.now() - prev[0].time) < 3000) return prev;
      return [{ id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, msg, type, time: Date.now() }, ...prev].slice(0, 50);
    });
  };

  const startMeeting = async () => {
    sessionIdRef.current = `session_${Date.now()}`;
    // New session -> a fresh report must be allowed for this session.
    reportGeneratedRef.current = false;
    setAlerts([]);

    await fetch('/ai-api/ai/session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionIdRef.current,
        user_id: 'candidate_01',
        session_type: sessionType
      })
    }).catch(() => {});

    startAudioCapture();
    setIsMonitoringActive(true);
    monitoringActiveRef.current = true;

    // Latest-frame loop: one in-flight request at a time, reschedule after each
    // iteration. Stale frames are dropped rather than queued.
    const scheduleNext = (delay = 100) => {
      if (!monitoringActiveRef.current) return;
      unifiedLoopRef.current = setTimeout(runIteration, delay);
    };

    const runIteration = async () => {
      if (!monitoringActiveRef.current) return;
      // Latest-frame: if the engine is still busy, drop this frame and re-check
      // quickly (60ms) instead of waiting a full cadence behind the backlog.
      if (aiInFlightRef.current) {
        scheduleNext(60);
        return;
      }

      const frame = cameraFeedRef.current?.captureFrameBase64();
      const samples = audioSamplesRef.current;
      if (!frame) {
        scheduleNext();
        return;
      }

      aiInFlightRef.current = true;
      const captureTs = Date.now();

      try {
        const res = await fetch(`/ai-api/ai/session/${sessionIdRef.current}/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionIdRef.current,
            user_id: 'candidate_01',
            session_type: sessionType,
            video_frame: frame,
            audio_samples: samples.length ? samples : null,
            timestamp: Date.now() / 1000.0,
            capture_timestamp: captureTs / 1000.0,
          })
        });

        const data = await res.json();
        if (res.ok && data) {
          setEngineResult(data);

          let shouldKickout = false;
          let kickoutReason = '';

          if (data.decision?.action === 'SUSPEND_SESSION' || data.risk?.current > 85) {
             shouldKickout = true;
             kickoutReason = data.decision?.reasons?.[0] || 'High risk score reached. Session suspended.';
          }

          // Emit alerts + persist ONLY on event state transitions (dedup).
          let hasNewEvents = false;
          if (data.behaviour?.events?.length) {
            data.behaviour.events.forEach(evt => {
              const evtState = String(evt.state || 'CONFIRMED').toUpperCase();
              if (emittedEventsRef.current[evt.type] === evtState) return;
              // Lifecycle close (RESOLVED / *_CLEARED): reset the dedup map so the
              // NEXT episode of the same event type can alert again (second gaze/
              // phone episode after a CLEARED must not be silently dropped).
              if (evtState === 'RESOLVED') emittedEventsRef.current = {};
              emittedEventsRef.current[evt.type] = evtState;
              hasNewEvents = true;

              addAlert(`[${evt.type.replace(/_/g, ' ')}] ${evt.evidence}`, evt.severity === 'CRITICAL' ? 'danger' : 'warning');
              
              if (evt.type === 'PHONE_DETECTED') {
                speakAlert("Warning! Mobile phone detected in camera view.");
              } else if (evt.type === 'MULTIPLE_PERSONS' && sessionType === 'EXAM') {
                speakAlert("Warning! Multiple persons detected in the room.");
              } else if (evt.type === 'PROLONGED_DISTRACTION' && sessionType === 'EXAM') {
                speakAlert("Warning! Please focus directly on your screen.");
              } else if (evt.type === 'USER_ABSENT') {
                speakAlert("Warning! Please stay in the camera view.");
              } else if (evt.severity === 'CRITICAL') {
                speakAlert(`Warning! ${evt.type.replace(/_/g, ' ')}`);
              }
            });
          }

          // Persist to the Node backend only when new events occurred (the AI
          // service already returns full engine telemetry; the DB is for history
          // and reports, not for the real-time loop).
          if (hasNewEvents) {
            fetch('/api/ai-engine/log', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('trueview_token')}`
              },
              body: JSON.stringify(data)
            }).catch(() => {});
          }

          if (shouldKickout) {
            if ('speechSynthesis' in window) {
              window.speechSynthesis.cancel();
              const utterance = new SpeechSynthesisUtterance("Session terminated due to high risk score and rule violations.");
              utterance.volume = 1.0;
              window.speechSynthesis.speak(utterance);
            }
            setTerminationReason(kickoutReason);
            stopMonitoringDueToKickout();
          }
        }
      } catch (_) {}
      finally {
        aiInFlightRef.current = false;
        scheduleNext();
      }
    };

    scheduleNext(100);
  };

  // Start meeting automatically when entering the room
  useEffect(() => {
    if (!isMonitoringActive && !terminationReason) {
      startMeeting();
    }
    return () => {
      stopMonitoringDueToKickout();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-[#202124] text-white flex flex-col font-sans overflow-hidden">
      
      {/* Termination Modal Overlay */}
      {terminationReason && (
        <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-[#2b2d31] border border-[#3f4147] rounded-2xl shadow-2xl max-w-md w-full p-8 text-center space-y-6">
            <div className="w-20 h-20 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
              <PhoneOff size={40} />
            </div>
            <div>
              <h2 className="text-2xl font-normal text-white mb-3">You have been removed from the session</h2>
              <p className="text-gray-400 font-normal leading-relaxed">{terminationReason}</p>
            </div>
            <button 
              onClick={() => window.location.href = '/'}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-8 rounded-lg transition-colors"
            >
              Return to Home
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 relative flex overflow-hidden min-h-0">
        
        {/* Main Video Area */}
        <div className={`flex-1 p-4 flex items-center justify-center transition-all duration-300 ${isSidebarOpen ? 'mr-80' : ''}`}>
          <div className="w-full h-full max-w-6xl relative bg-[#3c4043] rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center group border border-[#5f6368]/30">
            
            {isCamOn ? (
              <CameraFeed ref={cameraFeedRef} isMonitoringActive={isMonitoringActive} />
            ) : (
              <div className="w-32 h-32 rounded-full bg-blue-600 flex items-center justify-center text-4xl font-normal text-white shadow-lg">
                C
              </div>
            )}

            {/* Video Overlays */}
            <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-lg flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
              <span className="text-xs font-medium text-white tracking-wide">Proctoring Active</span>
            </div>

            {engineResult && (
              <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
                <div className="bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2 text-xs text-white">
                  Risk: <span className={`font-bold ${engineResult.risk?.score > 50 ? 'text-rose-400' : 'text-emerald-400'}`}>{engineResult.risk?.score?.toFixed(0) || 0}%</span>
                </div>
                {engineResult.environment?.phone_detected && (
                  <div className="bg-rose-500/90 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-rose-400/50 flex items-center gap-2 text-[10px] font-bold text-white shadow-lg">
                    <PhoneOff size={12} /> Phone Detected
                  </div>
                )}
              </div>
            )}

            <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
              <div className="bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-lg flex items-center gap-2">
                {!isMicOn && <MicOff size={16} className="text-red-500" />}
                <span className="text-sm font-medium text-white">Candidate (You)</span>
              </div>

              {engineResult && (
                <div className="bg-black/60 backdrop-blur-md px-3 py-2 rounded-lg border border-white/10 flex items-center gap-3 text-[11px] text-gray-200">
                  <span>Gaze: <b className="text-white">{engineResult.attention?.gaze || 'N/A'}</b></span>
                  <span>Pose: <b className="text-white">{engineResult.attention?.head_pose || 'N/A'}</b></span>
                  {engineResult.performance?.latency_ms > 0 && (
                    <span title="End-to-end AI inference latency (capture → result)">
                      Latency: <b className="text-amber-300">{engineResult.performance.latency_ms}ms</b>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Collapsible Sidebar for AI Alerts */}
        <AnimatePresence>
          {isSidebarOpen && (
            <motion.div
              initial={{ x: 320 }}
              animate={{ x: 0 }}
              exit={{ x: 320 }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="absolute right-0 top-0 bottom-0 w-80 bg-[#2b2d31] border-l border-[#3f4147] flex flex-col shadow-2xl z-40"
            >
              <div className="p-4 border-b border-[#3f4147] flex items-center justify-between shrink-0">
                <h3 className="text-sm font-medium text-white flex items-center gap-2">
                  <ShieldAlert size={16} className="text-blue-400" />
                  Proctoring Alerts
                </h3>
                <button 
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-1 hover:bg-[#3f4147] rounded-md text-gray-400 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {alerts.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-3">
                    <ShieldAlert size={32} className="opacity-50" />
                    <p className="text-sm">No alerts detected</p>
                  </div>
                ) : (
                  alerts.map(alert => (
                    <motion.div 
                      key={alert.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-3 rounded-lg border text-sm shadow-sm ${
                        alert.type === 'danger' 
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-200' 
                          : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                        <span className="font-medium">{alert.msg}</span>
                      </div>
                      <div className="text-[10px] text-gray-400 mt-2 flex justify-end">
                        {new Date(alert.time).toLocaleTimeString()}
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Control Bar */}
      <div className="h-20 bg-[#202124] px-6 flex items-center justify-between shrink-0 z-50">
        
        {/* Left: Time and Info */}
        <div className="flex items-center gap-4 w-64">
          <span className="text-base font-normal text-white">{formatTime(elapsedTime)}</span>
          <div className="w-px h-5 bg-[#5f6368]"></div>
          <select
            value={sessionType}
            onChange={e => setSessionType(e.target.value)}
            disabled={isMonitoringActive}
            className="bg-transparent text-gray-300 text-sm font-medium focus:outline-none border-b border-transparent hover:border-gray-500 cursor-pointer disabled:opacity-50"
          >
            {CONTEXT_OPTIONS.map(opt => (
              <option key={opt.id} value={opt.id} className="bg-[#202124] text-white">
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Center: Primary Controls */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsMicOn(!isMicOn)}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              isMicOn ? 'bg-[#3c4043] hover:bg-[#4a4d51] text-white' : 'bg-[#ea4335] hover:bg-[#d93025] text-white'
            }`}
          >
            {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
          </button>

          <button 
            onClick={() => setIsCamOn(!isCamOn)}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              isCamOn ? 'bg-[#3c4043] hover:bg-[#4a4d51] text-white' : 'bg-[#ea4335] hover:bg-[#d93025] text-white'
            }`}
          >
            {isCamOn ? <Video size={20} /> : <VideoOff size={20} />}
          </button>

          <button className="w-12 h-12 rounded-full bg-[#3c4043] hover:bg-[#4a4d51] text-white flex items-center justify-center transition-colors">
            <MonitorUp size={20} />
          </button>

          <button 
            onClick={async () => {
              if (window.confirm("Are you sure you want to leave the examination? This may flag your session.")) {
                await stopMonitoringDueToKickout();
                window.location.href = '/';
              }
            }}
            className="w-14 h-10 rounded-full bg-[#ea4335] hover:bg-[#d93025] text-white flex items-center justify-center transition-colors shadow-lg px-6"
          >
            <PhoneOff size={20} />
          </button>
        </div>

        {/* Right: Secondary Controls */}
        <div className="flex items-center justify-end gap-3 w-64 text-[#9aa0a6]">
          <button className="p-2 hover:bg-[#3c4043] rounded-full transition-colors">
            <Info size={20} />
          </button>
          <button className="p-2 hover:bg-[#3c4043] rounded-full transition-colors">
            <Users size={20} />
          </button>
          <button className="p-2 hover:bg-[#3c4043] rounded-full transition-colors">
            <MessageSquare size={20} />
          </button>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`p-2 rounded-full transition-colors relative ${isSidebarOpen ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-[#3c4043]'}`}
          >
            <ShieldAlert size={20} />
            {alerts.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full border border-[#202124]"></span>
            )}
          </button>
        </div>
      </div>
      
    </div>
  );
}
