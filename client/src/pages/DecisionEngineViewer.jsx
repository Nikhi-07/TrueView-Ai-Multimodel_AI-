import { useState, useEffect, useRef } from 'react';
import {
  Play, Square, Shield, AlertTriangle, Clock, Activity,
  UserCheck, Eye, Compass, Mic, Boxes, TrendingUp,
  RefreshCw, CheckCircle, XCircle, Zap, Brain
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../components/Cards/PageHeader';
import StatusBadge from '../components/Cards/StatusBadge';
import useCamera from '../hooks/useCamera';

// ─── Severity badge color map ───
const SEVERITY_COLORS = {
  CRITICAL: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444', border: 'rgba(239,68,68,0.3)' },
  HIGH:     { bg: 'rgba(249,115,22,0.15)', text: '#f97316', border: 'rgba(249,115,22,0.3)' },
  MEDIUM:   { bg: 'rgba(234,179,8,0.15)',  text: '#eab308', border: 'rgba(234,179,8,0.3)' },
  LOW:      { bg: 'rgba(34,197,94,0.15)',  text: '#22c55e', border: 'rgba(34,197,94,0.3)' },
};

const STATUS_STYLES = {
  CLEAN:        { color: '#22c55e', icon: CheckCircle, label: 'Clean'        },
  UNDER_REVIEW: { color: '#eab308', icon: Eye,         label: 'Under Review' },
  FLAGGED:      { color: '#f97316', icon: AlertTriangle,label: 'Flagged'      },
  SUSPENDED:    { color: '#ef4444', icon: XCircle,      label: 'Suspended'    },
};

// ─── SVG Risk Gauge Component ───
function RiskGauge({ score, tierLabel, tierColor }) {
  const radius = 80;
  const stroke = 12;
  const circumference = Math.PI * radius; // half-circle
  const progress = (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="200" height="120" viewBox="0 0 200 120">
        {/* Background arc */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="rgba(0,0,0,0.1)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {/* Progress arc */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={tierColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={circumference - progress}
          style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.5s ease' }}
        />
        {/* Score text */}
        <text x="100" y="88" textAnchor="middle" fill="black" fontSize="32" fontWeight="700">
          {score}
        </text>
        <text x="100" y="108" textAnchor="middle" fill="rgba(0,0,0,0.5)" fontSize="11">
          / 100
        </text>
      </svg>
      <span
        className="text-sm font-semibold px-3 py-1 rounded-full"
        style={{ backgroundColor: `${tierColor}20`, color: tierColor, border: `1px solid ${tierColor}40` }}
      >
        {tierLabel}
      </span>
    </div>
  );
}

// ─── SVG Area Chart for Trend ───
function TrendChart({ history }) {
  const width = 400;
  const height = 100;
  const padding = 4;
  const len = history.length || 1;
  const stepX = (width - padding * 2) / Math.max(len - 1, 1);

  const points = history.map((p, i) => {
    const x = padding + i * stepX;
    const y = height - padding - ((p.score ?? 0) / 100) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `${padding},${height - padding} ${points} ${padding + (len - 1) * stepX},${height - padding}`;

  // Color the last point
  const lastScore = history.length ? history[history.length - 1].score : 0;
  const lineColor = lastScore > 80 ? '#ef4444' : lastScore > 60 ? '#f97316' : lastScore > 40 ? '#eab308' : '#22c55e';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#trendFill)" />
      <polyline points={points} fill="none" stroke={lineColor} strokeWidth="2" />
    </svg>
  );
}

// ─── Confidence Bar ───
function ConfidenceBar({ label, icon: Icon, value }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#eab308' : '#f97316';
  return (
    <div className="flex items-center gap-3">
      <Icon size={16} style={{ color, flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-600 font-semibold truncate">{label}</span>
          <span className="text-xs font-mono" style={{ color }}>{pct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: color }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Module icon mapping ───
const MODULE_ICONS = {
  face_detection:      UserCheck,
  gaze_tracking:       Eye,
  head_pose:           Compass,
  voice_detection:     Mic,
  object_detection:    Boxes,
  behaviour_analysis:  Activity,
};

const MODULE_LABELS = {
  face_detection:      'Face Detection',
  gaze_tracking:       'Gaze Tracking',
  head_pose:           'Head Pose',
  voice_detection:     'Voice Detection',
  object_detection:    'Object Detection',
  behaviour_analysis:  'Behaviour',
};


// ═════════════════════════════════════════════
//  Main Component
// ═════════════════════════════════════════════
export default function DecisionEngineViewer() {
  const { videoRef, isActive, error, startCamera, stopCamera, captureFrameBase64 } = useCamera();

  const [decision, setDecision] = useState(null);
  const [scoreHistory, setScoreHistory] = useState([]);
  const [loopFps, setLoopFps] = useState(0);

  const loopRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioProcessorRef = useRef(null);
  const currentVoiceStatus = useRef('silence');
  const activeSessionId = useRef(`decision_session_${Date.now()}`);
  const lastTime = useRef(Date.now());
  const framesCount = useRef(0);

  // ─── Start / Stop ─────────────────────────
  const toggleSession = async () => {
    if (isActive) {
      stopCamera();
      stopAudio();
      setLoopFps(0);
      setDecision(null);
      setScoreHistory([]);
    } else {
      activeSessionId.current = `decision_session_${Date.now()}`;

      // Reset all AI module sessions in parallel
      await Promise.all([
        fetch('/ai-api/decision-engine/reset', { method: 'POST' }).catch(() => {}),
        fetch('/ai-api/eye-gaze/reset-session', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: activeSessionId.current })
        }).catch(() => {}),
        fetch('/ai-api/head-pose/reset-pose-session', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: activeSessionId.current })
        }).catch(() => {}),
        fetch('/ai-api/object-detection/reset-object-session', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: activeSessionId.current })
        }).catch(() => {}),
        fetch('/ai-api/voice-detection/reset-voice-session', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: activeSessionId.current })
        }).catch(() => {}),
      ]);

      startCamera();
      startAudio();
    }
  };

  const handleReset = () => {
    fetch('/ai-api/decision-engine/reset', { method: 'POST' })
      .then(() => {
        setDecision({
          risk_score: 0.0,
          risk_tier: { label: 'Very Safe', color: '#22c55e', min: 0, max: 20 },
          session_status: 'CLEAN',
          action: 'CONTINUE',
          reasoning: 'Session reset to clean state.',
          violation_count: 0,
          violations: [],
          ai_confidence: 0.9,
          module_confidence: {},
        });
        setScoreHistory([]);
      })
      .catch(() => {});
  };

  // ─── Audio Capture ────────────────────────
  const startAudio = async () => {
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

      processor.onaudioprocess = async (e) => {
        const samples = Array.from(e.inputBuffer.getChannelData(0));
        try {
          const res = await fetch('/ai-api/voice-detection/process-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ samples })
          });
          const data = await res.json();
          if (res.ok) currentVoiceStatus.current = data.voice_status;
        } catch (_) { /* silent */ }
      };
    } catch (err) {
      console.warn('Microphone access failed:', err);
    }
  };

  const stopAudio = () => {
    if (audioProcessorRef.current) { audioProcessorRef.current.disconnect(); audioProcessorRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
    currentVoiceStatus.current = 'silence';
  };

  // ─── Main Processing Loop ─────────────────
  useEffect(() => {
    let active = true;

    const processLoop = async () => {
      if (!isActive || !active) return;

      const frame = captureFrameBase64();
      if (!frame) {
        loopRef.current = requestAnimationFrame(processLoop);
        return;
      }

      // FPS tracking
      framesCount.current++;
      const now = Date.now();
      if (now - lastTime.current >= 1000) {
        setLoopFps(framesCount.current);
        framesCount.current = 0;
        lastTime.current = now;
      }

      try {
        // 1. Run all AI pipelines in parallel
        const [gazeRes, poseRes, yoloRes] = await Promise.all([
          fetch('/ai-api/eye-gaze/process-eye-gaze', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: frame, draw_overlay: false })
          }).then(r => r.json()).catch(() => ({})),

          fetch('/ai-api/head-pose/process-head-pose', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: frame, draw_overlay: false })
          }).then(r => r.json()).catch(() => ({})),

          fetch('/ai-api/object-detection/process-object-detection', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: frame, draw_overlay: false })
          }).then(r => r.json()).catch(() => ({})),
        ]);

        if (!active) return;

        // 2. Build consolidated telemetry payload for Decision Engine
        const voiceIsSpeaking = currentVoiceStatus.current === 'speaking';
        const personCount = yoloRes.summary?.person_count ?? (gazeRes.face_detected || poseRes.face_detected ? 1 : 0);
        const faceDetected = gazeRes.face_detected ?? poseRes.face_detected ?? false;

        const telemetry = {
          // Face
          face_detected: faceDetected,
          face_match: faceDetected ? true : null,
          face_confidence: gazeRes.confidence ?? poseRes.confidence ?? 0.9,
          // Gaze
          gaze_status: gazeRes.gaze_direction || gazeRes.status || 'center',
          gaze_confidence: gazeRes.confidence ?? 0.85,
          // Head Pose (real dynamic values)
          head_yaw:   poseRes.yaw   ?? 0.0,
          head_pitch: poseRes.pitch  ?? 0.0,
          head_roll:  poseRes.roll   ?? 0.0,
          head_direction: poseRes.head_direction || poseRes.direction || 'Looking Straight',
          head_attention: poseRes.attention_status || 'focused',
          pose_confidence: poseRes.confidence ?? 0.85,
          // Voice
          is_speaking: voiceIsSpeaking,
          voice_confidence: voiceIsSpeaking ? 0.85 : 0.95,
          // YOLO
          phone_detected: yoloRes.summary?.phone_detected || false,
          person_count:   personCount,
          yolo_confidence: yoloRes.summary?.avg_confidence ?? 0.9,
          detected_objects: yoloRes.detections || [],
          // Derived
          is_spoof: false,
          user_absent: !faceDetected && personCount === 0,
          behaviour_confidence: 0.9,
        };

        // 3. Send to Decision Engine
        const decisionRes = await fetch('/ai-api/decision-engine/evaluate-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(telemetry)
        });

        const result = await decisionRes.json();

        if (active && decisionRes.ok && result.success) {
          setDecision(result.data);

          // Update rolling score history (keep last 60 samples for the local chart)
          setScoreHistory(prev => {
            const next = [...prev, { ts: Date.now(), score: result.data.risk_score }];
            return next.length > 60 ? next.slice(-60) : next;
          });

          // Log to Express backend (fire-and-forget)
          fetch('/api/decision/log', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('trueview_token')}`
            },
            body: JSON.stringify({
              sessionId: activeSessionId.current,
              riskScore: result.data.risk_score,
              sessionStatus: result.data.session_status,
              action: result.data.action,
              reasoning: result.data.reasoning,
              violationCount: result.data.violation_count,
              violations: result.data.violations,
              aiConfidence: result.data.ai_confidence,
              moduleConfidence: result.data.module_confidence,
            })
          }).catch(() => {});
        }
      } catch (_) { /* silent */ }

      // Throttle to ~4 Hz
      setTimeout(() => {
        if (isActive && active) {
          loopRef.current = requestAnimationFrame(processLoop);
        }
      }, 250);
    };

    if (isActive) {
      loopRef.current = requestAnimationFrame(processLoop);
    }

    return () => {
      active = false;
      if (loopRef.current) cancelAnimationFrame(loopRef.current);
    };
  }, [isActive]);

  // ─── Cleanup on unmount ───────────────────
  useEffect(() => {
    return () => {
      stopAudio();
      if (loopRef.current) cancelAnimationFrame(loopRef.current);
    };
  }, []);

  // ─── Derived display values ───────────────
  const riskScore    = decision?.risk_score    ?? 0;
  const tierLabel    = decision?.risk_tier?.label  ?? 'Very Safe';
  const tierColor    = decision?.risk_tier?.color  ?? '#22c55e';
  const sessionStatus = decision?.session_status  ?? 'CLEAN';
  const action        = decision?.action          ?? 'CONTINUE';
  const reasoning     = decision?.reasoning       ?? 'Session not started.';
  const violations    = decision?.violations      ?? [];
  const moduleConf    = decision?.module_confidence ?? {};
  const aiConfidence  = decision?.ai_confidence   ?? 0;
  const evalCount     = decision?.evaluation_count ?? 0;
  const sessionDur    = decision?.session_duration ?? 0;
  const statusStyle   = STATUS_STYLES[sessionStatus] || STATUS_STYLES.CLEAN;
  const StatusIcon    = statusStyle.icon;

  // Card style helper
  const cardClass = 'rounded-2xl border border-gray-200 bg-white backdrop-blur-md p-5';

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="Decision Engine"
        subtitle="AI-powered risk scoring & session evaluation"
        icon={Brain}
        actions={
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 hover:bg-gray-100 text-gray-600 font-semibold border border-gray-200 transition-all"
            >
              <RefreshCw size={14} /> Reset
            </button>
            <button
              onClick={toggleSession}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all shadow-lg ${
                isActive
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
              }`}
            >
              {isActive ? <><Square size={14} /> Stop Session</> : <><Play size={14} /> Start Session</>}
            </button>
          </div>
        }
      />

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-red-400 text-sm">{error}</div>
      )}

      {/* ═══ Top Row: Camera + Gauge + Status ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Camera Feed */}
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-gray-600 font-semibold text-sm font-semibold flex items-center gap-2">
              <Eye size={14} className="text-blue-400" /> Live Feed
            </h3>
            {isActive && (
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                {loopFps} FPS
              </span>
            )}
          </div>
          <div className="relative aspect-video rounded-xl overflow-hidden bg-black/40 border border-gray-200">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            {!isActive && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <p className="text-gray-600 font-semibold text-sm">Camera inactive</p>
              </div>
            )}
          </div>
        </div>

        {/* Risk Score Gauge */}
        <div className={cardClass + ' flex flex-col items-center justify-center'}>
          <h3 className="text-gray-600 font-semibold text-sm font-semibold flex items-center gap-2 mb-4">
            <Shield size={14} style={{ color: tierColor }} /> Risk Score
          </h3>
          <RiskGauge score={riskScore} tierLabel={tierLabel} tierColor={tierColor} />
          <div className="mt-4 text-center">
            <p className="text-gray-600 font-semibold text-xs">
              {evalCount} evaluations · {Math.round(sessionDur)}s session
            </p>
          </div>
        </div>

        {/* Session Status Card */}
        <div className={cardClass + ' flex flex-col'}>
          <h3 className="text-gray-600 font-semibold text-sm font-semibold flex items-center gap-2 mb-4">
            <Zap size={14} className="text-yellow-400" /> Decision
          </h3>

          {/* Status Badge */}
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${statusStyle.color}15`, border: `1px solid ${statusStyle.color}30` }}
            >
              <StatusIcon size={20} style={{ color: statusStyle.color }} />
            </div>
            <div>
              <p className="text-black font-bold font-semibold text-lg">{statusStyle.label}</p>
              <p className="text-gray-600 font-semibold text-xs">Action: {action.replace(/_/g, ' ')}</p>
            </div>
          </div>

          {/* Reasoning */}
          <div className="flex-1 rounded-xl bg-gray-100 border border-gray-200 p-3 mb-4">
            <p className="text-gray-600 font-semibold text-xs leading-relaxed">{reasoning}</p>
          </div>

          {/* AI Confidence */}
          <div className="flex items-center justify-between">
            <span className="text-gray-600 font-semibold text-xs">Overall AI Confidence</span>
            <span
              className="text-sm font-mono font-bold"
              style={{ color: aiConfidence >= 0.8 ? '#22c55e' : aiConfidence >= 0.6 ? '#eab308' : '#f97316' }}
            >
              {Math.round(aiConfidence * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* ═══ Middle Row: Trend + Module Confidence ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Risk Trend Chart */}
        <div className={cardClass}>
          <h3 className="text-gray-600 font-semibold text-sm font-semibold flex items-center gap-2 mb-3">
            <TrendingUp size={14} className="text-cyan-400" /> Risk Trend
          </h3>
          <div className="h-28 w-full">
            {scoreHistory.length > 1 ? (
              <TrendChart history={scoreHistory} />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-600 font-semibold text-sm">
                Waiting for data...
              </div>
            )}
          </div>
        </div>

        {/* Per-Module Confidence Grid */}
        <div className={cardClass}>
          <h3 className="text-gray-600 font-semibold text-sm font-semibold flex items-center gap-2 mb-4">
            <Activity size={14} className="text-purple-400" /> Module Confidence
          </h3>
          <div className="space-y-3">
            {Object.entries(MODULE_ICONS).map(([key, Icon]) => (
              <ConfidenceBar
                key={key}
                label={MODULE_LABELS[key]}
                icon={Icon}
                value={moduleConf[key] ?? 0.5}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ═══ Bottom: Violations Table ═══ */}
      <div className={cardClass}>
        <h3 className="text-gray-600 font-semibold text-sm font-semibold flex items-center gap-2 mb-4">
          <AlertTriangle size={14} className="text-amber-400" /> Active Violations
          {violations.length > 0 && (
            <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
              {violations.length} active
            </span>
          )}
        </h3>

        {violations.length === 0 ? (
          <div className="text-center py-8 text-gray-600 font-semibold">
            <CheckCircle size={32} className="mx-auto mb-2 text-emerald-400/30" />
            <p className="text-sm">No violations detected</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-600 font-semibold text-xs border-b border-gray-200">
                  <th className="text-left py-2 pr-4 font-medium">Violation</th>
                  <th className="text-left py-2 pr-4 font-medium">Severity</th>
                  <th className="text-left py-2 pr-4 font-medium">Weight</th>
                  <th className="text-left py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {violations.map((v, i) => {
                    const sc = SEVERITY_COLORS[v.severity] || SEVERITY_COLORS.LOW;
                    return (
                      <motion.tr
                        key={v.rule_id}
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, delay: i * 0.03 }}
                        className="border-b border-gray-200"
                      >
                        <td className="py-2.5 pr-4 text-gray-600 font-semibold font-medium">{v.label}</td>
                        <td className="py-2.5 pr-4">
                          <span
                            className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}
                          >
                            {v.severity}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-gray-600 font-semibold">{v.weight}</td>
                        <td className="py-2.5 text-gray-600 font-semibold text-xs max-w-xs truncate">{v.reason}</td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
