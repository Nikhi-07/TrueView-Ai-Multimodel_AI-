import { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Camera as CameraIcon, Mic, Clock, ShieldAlert, Eye, Brain, Volume2, Shield, ScanFace, Play, Square, Fingerprint, Activity
} from 'lucide-react';
import { motion } from 'framer-motion';
import PageHeader from '../components/Cards/PageHeader';
import StatusBadge from '../components/Cards/StatusBadge';
import MetricGauge from '../components/Charts/MetricGauge';
import ProgressBar from '../components/Charts/ProgressBar';
import CameraFeed from '../components/Camera/CameraFeed';

export default function LiveMonitoring() {
  const [isMonitoringActive, setIsMonitoringActive] = useState(false);
  const [detectionData, setDetectionData] = useState({
    faceCount: 0, confidence: 0, fps: 0, processingTime: 0
  });
  const [livenessData, setLivenessData] = useState({
    liveness: 'Unknown', confidence: 0, blinkCount: 0, blinkScore: 0,
    motionScore: 0, textureScore: 0, eyeClosed: false, processingTime: 0
  });
  const [alerts, setAlerts] = useState([]);
  const [elapsedTime, setElapsedTime] = useState(0);

  const timerRef = useRef(null);
  const cameraFeedRef = useRef(null);
  const livenessIntervalRef = useRef(null);
  const sessionIdRef = useRef(`session_${Date.now()}`);

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

  // Liveness polling — uses the CameraFeed's captureFrameBase64 via ref
  useEffect(() => {
    if (isMonitoringActive) {
      sessionIdRef.current = `session_${Date.now()}`;
      // Wait a moment for camera to initialize before starting liveness polling
      const startDelay = setTimeout(() => {
        livenessIntervalRef.current = setInterval(async () => {
          try {
            const frame = cameraFeedRef.current?.captureFrameBase64();
            if (!frame) return;

            const res = await fetch('/ai-api/liveness/check', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image: frame, session_id: sessionIdRef.current })
            });
            const result = await res.json();

            if (res.ok && result.liveness) {
              setLivenessData({
                liveness: result.liveness,
                confidence: result.confidence,
                blinkCount: result.blink_count,
                blinkScore: result.blink_score,
                motionScore: result.motion_score,
                textureScore: result.texture_score,
                eyeClosed: result.eye_closed,
                processingTime: result.processing_time_ms
              });
              if (result.liveness === 'Fake') {
                addAlert('⚠️ Spoof attempt detected!', 'danger');
              }
            }
          } catch (e) { /* silent */ }
        }, 600);
      }, 2000);

      return () => {
        clearTimeout(startDelay);
        if (livenessIntervalRef.current) clearInterval(livenessIntervalRef.current);
      };
    } else {
      if (livenessIntervalRef.current) clearInterval(livenessIntervalRef.current);
    }
  }, [isMonitoringActive]);

  const handleDetectionUpdate = useCallback((result, currentFps) => {
    const highestConfidence = result.faces.length > 0 
      ? Math.max(...result.faces.map(f => f.confidence)) : 0;
    setDetectionData({
      faceCount: result.faceCount, confidence: highestConfidence * 100,
      fps: currentFps, processingTime: result.processingTimeMs
    });
    if (result.faceCount > 1) addAlert('Multiple faces detected in frame.', 'danger');
    else if (result.faceCount === 0) addAlert('No face detected. User is absent.', 'warning');
  }, []);

  const addAlert = (msg, type) => {
    setAlerts(prev => {
      if (prev.length > 0 && prev[0].msg === msg && (Date.now() - prev[0].time) < 3000) return prev;
      return [{ id: Date.now(), msg, type, time: Date.now() }, ...prev].slice(0, 15);
    });
  };

  const toggleMonitoring = () => {
    const next = !isMonitoringActive;
    setIsMonitoringActive(next);
    if (!next) {
      setDetectionData({ faceCount: 0, confidence: 0, fps: 0, processingTime: 0 });
      setLivenessData({ liveness: 'Unknown', confidence: 0, blinkCount: 0, blinkScore: 0, motionScore: 0, textureScore: 0, eyeClosed: false, processingTime: 0 });
    }
  };

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } };
  const item = { hidden: { opacity: 0, scale: 0.95 }, show: { opacity: 1, scale: 1 } };
  const livenessColor = livenessData.liveness === 'Real' ? 'success' : livenessData.liveness === 'Fake' ? 'danger' : 'gray';

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="h-full flex flex-col">
      <PageHeader
        title="Live Monitoring"
        subtitle="Session: SES-042 • Student: Jane Smith"
        breadcrumb={['TrueView AI', 'Live Monitoring']}
        actions={
          <div className="flex items-center gap-3">
            <div className="glass px-3 py-1.5 rounded-lg flex items-center gap-2">
              <Clock size={14} className="text-primary-400" />
              <span className="text-sm font-mono font-bold text-gray-200">{formatTime(elapsedTime)}</span>
            </div>
            <button onClick={toggleMonitoring}
              className={`text-sm py-1.5 px-4 flex items-center gap-2 ${isMonitoringActive ? 'btn-danger' : 'btn-primary'}`}>
              {isMonitoringActive ? <Square size={14}/> : <Play size={14}/>}
              {isMonitoringActive ? 'Stop Session' : 'Start Session'}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Left Panel */}
        <motion.div variants={item} className="lg:col-span-2 space-y-4">
          <div className="glass p-4 rounded-2xl">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Stream Status</h3>
            <div className="space-y-4">
              {[
                { icon: CameraIcon, label: 'Video', status: isMonitoringActive ? 'Active' : 'Offline', variant: isMonitoringActive ? 'success' : 'default', dot: isMonitoringActive },
                { icon: Mic, label: 'Audio', status: 'Offline', variant: 'default', dot: false },
                { icon: Brain, label: 'AI Engine', status: isMonitoringActive ? 'Active' : 'Idle', variant: isMonitoringActive ? 'success' : 'info', dot: isMonitoringActive },
                { icon: Fingerprint, label: 'Liveness', status: isMonitoringActive ? livenessData.liveness : 'Idle', variant: isMonitoringActive ? livenessColor : 'default', dot: isMonitoringActive && livenessData.liveness === 'Real' },
              ].map((s, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><s.icon size={14} className="text-gray-400"/> <span className="text-sm text-gray-300">{s.label}</span></div>
                  <StatusBadge label={s.status} variant={s.variant} dot={s.dot} />
                </div>
              ))}
            </div>
            <div className="mt-6 pt-4 border-t border-white/[0.06]">
              <div className="text-xs text-gray-500 mb-1">Inference Time</div>
              <div className="text-lg font-mono text-gray-200">{detectionData.processingTime} ms</div>
            </div>
            <div className="mt-4">
              <div className="text-xs text-gray-500 mb-1">Detection FPS</div>
              <div className="text-lg font-mono text-gray-200">{detectionData.fps}</div>
            </div>
          </div>

          {/* Blink Counter */}
          <div className="glass p-4 rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              <Eye size={14} className="text-primary-400" />
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Blink Counter</h3>
            </div>
            <div className="text-3xl font-mono font-bold text-gray-100 mb-1">{livenessData.blinkCount}</div>
            <p className="text-[10px] text-gray-500">Blinks this session</p>
            <div className="mt-3 flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${livenessData.eyeClosed ? 'bg-warning-400' : 'bg-success-400'}`} />
              <span className="text-xs text-gray-400">{livenessData.eyeClosed ? 'Eyes Closed' : 'Eyes Open'}</span>
            </div>
          </div>
        </motion.div>

        {/* Center Panel: Camera */}
        <motion.div variants={item} className="lg:col-span-7 flex flex-col relative h-[500px] lg:h-auto">
          <div className="glass flex-1 relative rounded-2xl overflow-hidden border-white/[0.1] h-full">
            <CameraFeed ref={cameraFeedRef} isActive={isMonitoringActive} onDetectionUpdate={handleDetectionUpdate} />

            {isMonitoringActive && (
              <>
                <div className="absolute top-4 left-4 flex gap-2">
                  <div className="bg-danger-500/20 backdrop-blur-md border border-danger-500/30 text-danger-400 text-xs font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-danger-400 animate-pulse"/> REC
                  </div>
                  <div className="bg-black/40 backdrop-blur-md border border-white/10 text-white text-xs px-2.5 py-1 rounded-md font-mono">SES-042</div>
                </div>
                <div className={`absolute bottom-4 right-4 backdrop-blur-md border px-3 py-2 rounded-xl flex items-center gap-2 ${
                  livenessData.liveness === 'Real' ? 'bg-success-500/15 border-success-500/30' 
                  : livenessData.liveness === 'Fake' ? 'bg-danger-500/20 border-danger-500/30 animate-pulse' 
                  : 'bg-black/40 border-white/10'
                }`}>
                  <Fingerprint size={14} className={`text-${livenessColor}-400`} />
                  <span className={`text-xs font-bold text-${livenessColor}-400`}>
                    {livenessData.liveness === 'Real' ? 'LIVE' : livenessData.liveness === 'Fake' ? 'SPOOF' : '---'}
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">{livenessData.confidence.toFixed(0)}%</span>
                </div>
              </>
            )}
          </div>
        </motion.div>

        {/* Right Panel: AI Analytics */}
        <motion.div variants={item} className="lg:col-span-3 space-y-4">
          <div className="glass p-5 rounded-2xl bg-gradient-to-br from-surface-900 to-surface-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-200">Liveness Score</h3>
              <Fingerprint size={16} className={`text-${livenessColor}-400`} />
            </div>
            <div className="flex items-center justify-center mb-4">
              <MetricGauge value={Math.round(livenessData.confidence)} max={100} size={110} strokeWidth={8} label={livenessData.liveness} />
            </div>
            <ProgressBar label="Blink Score" value={livenessData.blinkScore} color={livenessData.blinkScore > 40 ? 'success' : 'warning'} />
            <div className="mt-2" />
            <ProgressBar label="Motion Score" value={livenessData.motionScore} color={livenessData.motionScore > 30 ? 'success' : 'warning'} />
            <div className="mt-2" />
            <ProgressBar label="Texture Score" value={livenessData.textureScore} color={livenessData.textureScore > 40 ? 'success' : 'warning'} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Face Detect', status: isMonitoringActive ? (detectionData.faceCount === 1 ? '1 Face' : `${detectionData.faceCount} Faces`) : 'Off', icon: ScanFace, color: detectionData.faceCount === 1 ? 'success' : (detectionData.faceCount === 0 && isMonitoringActive ? 'warning' : (isMonitoringActive ? 'danger' : 'gray')) },
              { label: 'Liveness', status: isMonitoringActive ? livenessData.liveness : 'Off', icon: Shield, color: isMonitoringActive ? livenessColor : 'gray' },
              { label: 'Eye Gaze', status: 'N/A', icon: Eye, color: 'gray' },
              { label: 'Audio', status: 'N/A', icon: Volume2, color: 'gray' },
            ].map((p, i) => (
              <div key={i} className="glass p-3 rounded-xl hover:bg-white/[0.04] transition-colors cursor-default">
                <p.icon size={14} className={`mb-2 text-${p.color}-400`} />
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">{p.label}</div>
                <div className={`text-xs font-semibold mt-0.5 text-${p.color}-400`}>{p.status}</div>
              </div>
            ))}
          </div>

          <div className="glass rounded-2xl flex flex-col overflow-hidden h-[240px]">
            <div className="px-4 py-3 border-b border-white/[0.06] bg-surface-800/50">
              <h3 className="text-xs font-semibold text-gray-200">Alert Stream</h3>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              {alerts.length === 0 ? (
                <div className="text-xs text-gray-500 text-center mt-8">No alerts yet.</div>
              ) : (
                alerts.map(alert => (
                  <div key={alert.id} className="flex gap-3 items-start animate-fade-in">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-${alert.type}-400 ${alert.type === 'danger' ? 'animate-pulse' : ''}`} />
                    <div>
                      <p className="text-xs text-gray-300">{alert.msg}</p>
                      <span className="text-[9px] text-gray-500">Just now</span>
                    </div>
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
