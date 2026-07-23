import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Square, Volume2, Clock, Eye, ScanFace, Fingerprint, Mic, Boxes, Activity
} from 'lucide-react';
import { motion } from 'framer-motion';
import CameraFeed from '../components/Camera/CameraFeed';
import MetricGauge from '../components/Charts/MetricGauge';
import PageHeader from '../components/Cards/PageHeader';

const CONTEXT_OPTIONS = [
  { id: 'EXAM', label: 'Examination Mode (Strict)' },
  { id: 'INTERVIEW', label: 'Interview Mode (Conversational)' },
  { id: 'ONLINE_CLASS', label: 'Online Class (Lecture)' },
  { id: 'MEETING', label: 'Meeting Mode (Collaborative)' },
  { id: 'WORKPLACE', label: 'Workplace Mode (Productivity)' }
];

export default function LiveMonitoring() {
  const [isMonitoringActive, setIsMonitoringActive] = useState(false);
  const [sessionType, setSessionType] = useState('EXAM');
  const [voiceAlertsEnabled, setVoiceAlertsEnabled] = useState(true);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [alerts, setAlerts] = useState([]);
  
  const cameraFeedRef = useRef(null);
  const sessionIdRef = useRef(`session_${Date.now()}`);
  const timerRef = useRef(null);
  const unifiedLoopRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioProcessorRef = useRef(null);
  const audioSamplesRef = useRef([]);
  const lastSpokenRef = useRef({ time: 0, text: '' });

  const [engineResult, setEngineResult] = useState({
    session: { id: sessionIdRef.current, mode: 'EXAM' },
    identity: { verified: true, confidence: 0.98, user_id: 'candidate_01', status: 'Verified' },
    liveness: { status: 'live', confidence: 0.96 },
    attention: { status: 'FOCUSED', score: 92.0, gaze: 'center', head_pose: 'Looking Straight' },
    audio: { speaking: false, noise_level: 'low', voice_confidence: 0.95 },
    environment: { person_count: 1, phone_detected: false, objects: [] },
    behaviour: { current_state: 'normal', events: [] },
    risk: { score: 0.0, current: 0.0, peak: 0.0, level: 'NORMAL' },
    decision: { action: 'CONTINUE_MONITORING', reasons: [] },
    performance: { fps: 0, latency_ms: 0 },
    module_health: {},
  });

  const speakAlert = useCallback((text) => {
    if (!voiceAlertsEnabled || !('speechSynthesis' in window)) return;
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
  }, [voiceAlertsEnabled]);

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
    return `${h}:${m}:${sec}`;
  };

  // Audio capture
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

  // Start / Stop Unified Monitoring
  const toggleMonitoring = async () => {
    if (isMonitoringActive) {
      stopAudioCapture();
      if (unifiedLoopRef.current) clearInterval(unifiedLoopRef.current);
      await fetch(`/ai-api/ai/session/${sessionIdRef.current}/stop`, { method: 'POST' }).catch(() => {});
      setIsMonitoringActive(false);
    } else {
      sessionIdRef.current = `session_${Date.now()}`;
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

      unifiedLoopRef.current = setInterval(async () => {
        try {
          const frame = cameraFeedRef.current?.captureFrameBase64();
          const samples = audioSamplesRef.current;

          const res = await fetch(`/ai-api/ai/session/${sessionIdRef.current}/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: sessionIdRef.current,
              user_id: 'candidate_01',
              session_type: sessionType,
              video_frame: frame || null,
              audio_samples: samples.length ? samples : null,
              timestamp: Date.now() / 1000.0,
            })
          });

          const data = await res.json();
          if (res.ok && data) {
            setEngineResult(data);

            // Log to Express Server backend
            fetch('/api/ai-engine/log', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('trueview_token')}`
              },
              body: JSON.stringify(data)
            }).catch(() => {});

            // Process alerts
            if (data.behaviour?.events?.length) {
              data.behaviour.events.forEach(evt => {
                addAlert(`[${evt.type}] ${evt.evidence}`, evt.severity === 'CRITICAL' ? 'danger' : 'warning');
                
                if (evt.type === 'PHONE_DETECTED') {
                  speakAlert("Warning! Mobile phone detected in camera view.");
                } else if (evt.type === 'MULTIPLE_PERSONS' && sessionType === 'EXAM') {
                  speakAlert("Warning! Multiple persons detected in the room.");
                } else if (evt.type === 'PROLONGED_DISTRACTION' && sessionType === 'EXAM') {
                  speakAlert("Warning! Please focus directly on your screen.");
                }
              });
            }
          }
        } catch (_) {}
      }, 250);
    }
  };

  const addAlert = (msg, type) => {
    setAlerts(prev => {
      if (prev.length > 0 && prev[0].msg === msg && (Date.now() - prev[0].time) < 3000) return prev;
      return [{ id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, msg, type, time: Date.now() }, ...prev].slice(0, 15);
    });
  };

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
  const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="h-full flex flex-col space-y-4">
      <PageHeader
        title="Live Proctoring Control Engine"
        subtitle={`Session ID: ${sessionIdRef.current.slice(-8)} • Candidate: Student #01`}
        breadcrumb={['TrueView AI', 'Live Monitoring']}
        actions={
          <div className="flex items-center gap-3">
            <select
              value={sessionType}
              onChange={e => setSessionType(e.target.value)}
              disabled={isMonitoringActive}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-800 bg-white border border-slate-300 focus:outline-none"
            >
              {CONTEXT_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
            <button
              onClick={() => setVoiceAlertsEnabled(prev => !prev)}
              className={`text-xs py-1.5 px-3 rounded-lg flex items-center gap-1.5 border font-medium transition-all ${
                voiceAlertsEnabled 
                  ? 'bg-slate-900 text-white border-slate-900' 
                  : 'bg-white text-slate-600 border-slate-300'
              }`}
            >
              <Volume2 size={14} />
              {voiceAlertsEnabled ? 'Voice Alerts Active' : 'Voice Alerts Muted'}
            </button>
            <div className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-2">
              <Clock size={14} className="text-slate-500" />
              <span className="text-xs font-mono font-semibold text-slate-900">{formatTime(elapsedTime)}</span>
            </div>
            <button onClick={toggleMonitoring}
              className={`text-xs font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-all ${isMonitoringActive ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-slate-900 hover:bg-slate-800 text-white'}`}>
              {isMonitoringActive ? <Square size={14}/> : <Play size={14}/>}
              {isMonitoringActive ? 'Stop Monitoring' : 'Start Monitoring'}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Left Panel: Module Status */}
        <motion.div variants={item} className="lg:col-span-3 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 shadow-sm">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Module Status</h3>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2">
                  <ScanFace size={15} className="text-slate-700" />
                  <span className="text-xs font-medium text-slate-800">Identity</span>
                </div>
                <span className={engineResult.identity.verified ? 'badge-success' : 'badge-danger'}>
                  {engineResult.identity.verified ? 'Verified' : 'Unverified'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2">
                  <Fingerprint size={15} className="text-slate-700" />
                  <span className="text-xs font-medium text-slate-800">Liveness</span>
                </div>
                <span className={engineResult.liveness.status === 'live' ? 'badge-success' : 'badge-warning'}>
                  {engineResult.liveness.status.toUpperCase()}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2">
                  <Eye size={15} className="text-slate-700" />
                  <span className="text-xs font-medium text-slate-800">Attention</span>
                </div>
                <span className={(engineResult.attention.status === 'FOCUSED' || engineResult.attention.status === 'LOOKING_AT_KEYBOARD') ? 'badge-success' : 'badge-warning'}>
                  {engineResult.attention.status}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2">
                  <Mic size={15} className="text-slate-700" />
                  <span className="text-xs font-medium text-slate-800">Voice VAD</span>
                </div>
                <span className={engineResult.audio.speaking ? 'badge-warning' : 'badge-neutral'}>
                  {engineResult.audio.speaking ? 'SPEAKING' : 'QUIET'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2">
                  <Boxes size={15} className="text-slate-700" />
                  <span className="text-xs font-medium text-slate-800">YOLO Object</span>
                </div>
                <span className={engineResult.environment.person_count > 1 ? 'badge-danger' : 'badge-neutral'}>
                  {engineResult.environment.person_count} Person(s)
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Latency</span>
              <span className="font-mono font-semibold text-slate-800">{engineResult.performance.latency_ms} ms</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Frame Rate</span>
              <span className="font-mono font-semibold text-slate-800">{engineResult.performance.fps} FPS</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Status</span>
              <span className="font-semibold text-emerald-700 uppercase">{engineResult.status}</span>
            </div>
          </div>
        </motion.div>

        {/* Center Panel: Video Feed */}
        <motion.div variants={item} className="lg:col-span-6 flex flex-col space-y-4">
          <div className="relative flex-1 bg-slate-900 rounded-xl overflow-hidden min-h-[360px] flex items-center justify-center border border-slate-300 shadow-sm">
            <CameraFeed ref={cameraFeedRef} isMonitoringActive={isMonitoringActive} />

            {isMonitoringActive && (
              <>
                <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
                  <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-700 text-white text-xs px-3 py-1.5 rounded-md font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>LIVE STREAM</span>
                  </div>
                  <div className="bg-slate-900/80 border border-slate-700 text-slate-200 text-xs px-2.5 py-1 rounded-md font-mono">{sessionType}</div>
                </div>

                <div className="absolute bottom-4 left-4 right-4 bg-slate-900/90 border border-slate-700 p-3 rounded-xl backdrop-blur-md flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="badge-neutral uppercase font-bold text-xs">{engineResult.risk.level}</span>
                    <span className="text-xs text-slate-300">Gaze: <b>{engineResult.attention.gaze}</b></span>
                    <span className="text-xs text-slate-300">Head: <b>{engineResult.attention.head_pose}</b></span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {engineResult.environment.phone_detected && (
                      <span className="badge-danger font-bold">
                        Phone Detected
                      </span>
                    )}
                    {engineResult.environment.objects?.map((obj, i) => (
                      obj.label !== 'person' && (
                        <span key={i} className="badge-warning font-semibold">
                          {obj.label.toUpperCase()} ({Math.round((obj.confidence || 0.8) * 100)}%)
                        </span>
                      )
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </motion.div>

        {/* Right Panel: Risk & Events */}
        <motion.div variants={item} className="lg:col-span-3 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 text-center shadow-sm">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Dynamic Risk Score</h3>
            <div className="flex items-center justify-center mb-3">
              <MetricGauge value={Math.round(engineResult?.risk?.score ?? engineResult?.risk?.current ?? 0)} max={100} size={110} strokeWidth={8} label={engineResult?.risk?.level ?? 'NORMAL'} />
            </div>
            <div className="text-xs text-slate-500">Context: <b className="text-slate-800">{sessionType}</b></div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden h-[260px] shadow-sm">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-700">Unified Event Log</h3>
              <span className="text-[10px] font-mono text-slate-500">{alerts.length} logged</span>
            </div>
            <div className="p-4 space-y-2.5 overflow-y-auto flex-1">
              {alerts.length === 0 ? (
                <div className="text-xs text-slate-400 text-center mt-10">No suspicious events recorded.</div>
              ) : (
                alerts.map(alert => (
                  <div key={alert.id} className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-0.5">
                    <span className={`font-semibold ${alert.type === 'danger' ? 'text-rose-700' : 'text-amber-700'}`}>
                      {alert.msg}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
