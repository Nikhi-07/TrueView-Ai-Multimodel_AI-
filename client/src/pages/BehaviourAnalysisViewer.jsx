import { useState, useEffect, useRef } from 'react';
import {
  Play, Square, Shield, AlertTriangle, Clock, Activity,
  ActivitySquare, UserCheck, Eye, Compass, Mic, Boxes,
  TrendingUp, RefreshCw, HelpCircle, CheckCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../components/Cards/PageHeader';
import StatusBadge from '../components/Cards/StatusBadge';
import useCamera from '../hooks/useCamera';

export default function BehaviourAnalysisViewer() {
  const { videoRef, isActive, error, startCamera, stopCamera, captureFrameBase64 } = useCamera();

  // Integrated proctor state
  const [analysisData, setAnalysisData] = useState({
    timeline: [],
    metrics: {
      attention_pct: 100.0,
      focus_duration_seconds: 0.0,
      speaking_duration_seconds: 0.0,
      face_loss_seconds: 0.0,
      session_total_seconds: 0.0,
      looking_away_count: 0,
      phone_detection_count: 0,
      multiple_person_count: 0
    },
    active_events: [],
    session_summary: {
      behavioral_insight: 'Focused Student',
      attention_rating: 'Excellent',
      last_active_event: 'None'
    }
  });

  // Rolling history of attention ratings for the SVG Graph
  const [attentionHistory, setAttentionHistory] = useState([100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
  const [loopFps, setLoopFps] = useState(0);

  const loopRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioProcessorRef = useRef(null);
  const currentVoiceStatus = useRef('silence');
  const activeSessionId = useRef(`behaviour_session_${Date.now()}`);
  const lastTime = useRef(Date.now());
  const framesCount = useRef(0);

  // Toggle Proctor Session
  const toggleSession = async () => {
    if (isActive) {
      stopCamera();
      stopAudio();
      setLoopFps(0);
      setAnalysisData({
        timeline: [],
        metrics: {
          attention_pct: 100.0,
          focus_duration_seconds: 0.0,
          speaking_duration_seconds: 0.0,
          face_loss_seconds: 0.0,
          session_total_seconds: 0.0,
          looking_away_count: 0,
          phone_detection_count: 0,
          multiple_person_count: 0
        },
        active_events: [],
        session_summary: {
          behavioral_insight: 'Focused Student',
          attention_rating: 'Excellent',
          last_active_event: 'None'
        }
      });
    } else {
      activeSessionId.current = `behaviour_session_${Date.now()}`;
      
      // Reset AI Service Session
      await fetch('/ai-api/behaviour-analysis/reset-behaviour-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: activeSessionId.current })
      }).catch(() => {});
      
      await fetch('/ai-api/eye-gaze/reset-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: activeSessionId.current })
      }).catch(() => {});

      await fetch('/ai-api/head-pose/reset-pose-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: activeSessionId.current })
      }).catch(() => {});

      await fetch('/ai-api/object-detection/reset-object-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: activeSessionId.current })
      }).catch(() => {});

      await fetch('/ai-api/voice-detection/reset-voice-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: activeSessionId.current })
      }).catch(() => {});

      startCamera();
      startAudio();
    }
  };

  const handleReset = () => {
    fetch('/ai-api/behaviour-analysis/reset-behaviour-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: activeSessionId.current })
    })
      .then(() => {
        setAnalysisData(prev => ({
          ...prev,
          timeline: [],
          active_events: []
        }));
        setAttentionHistory([100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
      })
      .catch(() => {});
  };

  // 🎤 Web Audio API loop for Voice status inputs
  const startAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      
      const source = audioCtx.createMediaStreamSource(stream);
      // Create script processor
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      audioProcessorRef.current = processor;
      
      source.connect(processor);
      processor.connect(audioCtx.destination);
      
      processor.onaudioprocess = async (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Downsample to 16kHz
        const samples = Array.from(inputData);
        
        try {
          const res = await fetch('/ai-api/voice-detection/process-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ samples })
          });
          const data = await res.json();
          if (res.ok) {
            currentVoiceStatus.current = data.voice_status;
          }
        } catch (err) {
          // silent fail
        }
      };
    } catch (err) {
      console.warn("Microphone access failed for behaviour integration:", err);
    }
  };

  const stopAudio = () => {
    if (audioProcessorRef.current) {
      audioProcessorRef.current.disconnect();
      audioProcessorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    currentVoiceStatus.current = 'silence';
  };

  // 👁️ Video Processing loop
  useEffect(() => {
    let active = true;

    const processLoop = async () => {
      if (!isActive || !active) return;

      const frame = captureFrameBase64();
      if (!frame) {
        loopRef.current = requestAnimationFrame(processLoop);
        return;
      }

      // FPS metrics
      framesCount.current++;
      const now = Date.now();
      if (now - lastTime.current >= 1000) {
        setLoopFps(framesCount.current);
        framesCount.current = 0;
        lastTime.current = now;
      }

      try {
        // Run AI telemetry requests in parallel to avoid queue delays
        const [gazeRes, poseRes, yoloRes] = await Promise.all([
          fetch('/ai-api/eye-gaze/process-eye-gaze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: frame, draw_overlay: false })
          }).then(r => r.json()).catch(() => ({})),

          fetch('/ai-api/head-pose/process-head-pose', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: frame, draw_overlay: false })
          }).then(r => r.json()).catch(() => ({})),

          fetch('/ai-api/object-detection/process-object-detection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: frame, draw_overlay: false })
          }).then(r => r.json()).catch(() => ({}))
        ]);

        if (!active) return;

        // Consolidate telemetries
        const telemetry = {
          face_detected: gazeRes.face_detected || poseRes.face_detected || false,
          identity: gazeRes.face_detected ? "verified_candidate" : "unknown",
          is_live: gazeRes.is_live ?? true,
          gaze_direction: gazeRes.gaze_direction || "center",
          head_pose_yaw: poseRes.yaw || 0.0,
          head_pose_pitch: poseRes.pitch || 0.0,
          head_pose_direction: poseRes.direction || "Looking Straight",
          voice_status: currentVoiceStatus.current,
          yolo_person_count: yoloRes.summary?.person_count || 0,
          yolo_phone_detected: yoloRes.summary?.phone_detected || false,
          yolo_book_detected: yoloRes.summary?.book_detected || false
        };

        // Post consolidation telemetry to Behaviour Analysis Engine
        const behaviourRes = await fetch('/ai-api/behaviour-analysis/analyze-behaviour', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(telemetry)
        });

        const result = await behaviourRes.json();

        if (active && behaviourRes.ok) {
          setAnalysisData({
            timeline: result.timeline || [],
            metrics: result.metrics || {},
            active_events: result.active_events || [],
            session_summary: result.session_summary || {}
          });

          // Log metrics to Express server
          fetch('/api/behaviour/log', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('trueview_token')}`
            },
            body: JSON.stringify({
              sessionId: activeSessionId.current,
              metrics: result.metrics,
              activeEvents: result.active_events,
              sessionSummary: result.session_summary
            })
          }).catch(() => {});

          // Append to rolling graph history
          const attPct = result.metrics?.attention_pct ?? 100;
          setAttentionHistory(prev => {
            const next = [...prev.slice(1), attPct];
            return next;
          });
        }
      } catch (err) {
        // silent fail
      }

      // Throttle behavior assessment to 4-5 Hz (approx 200ms) to conserve CPU
      setTimeout(() => {
        if (isActive && active) {
          loopRef.current = requestAnimationFrame(processLoop);
        }
      }, 200);
    };

    if (isActive) {
      loopRef.current = requestAnimationFrame(processLoop);
    }

    return () => {
      active = false;
      if (loopRef.current) cancelAnimationFrame(loopRef.current);
    };
  }, [isActive, captureFrameBase64]);

  // Clean up streams on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      stopAudio();
    };
  }, [stopCamera]);

  // Helper colors for events
  const getSeverityStyles = (severity) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-danger-500/10 border-danger-500/20 text-danger-400';
      case 'WARNING':
        return 'bg-warning-500/10 border-warning-500/20 text-warning-400';
      default:
        return 'bg-primary-500/10 border-primary-500/20 text-primary-400';
    }
  };

  // Generate SVG path for Attention Area Chart
  const svgWidth = 500;
  const svgHeight = 100;
  const points = attentionHistory.map((val, idx) => {
    const x = (idx / (attentionHistory.length - 1)) * svgWidth;
    const y = svgHeight - (val / 100) * svgHeight;
    return `${x},${y}`;
  });
  const pathData = points.length > 0 ? `M 0,${svgHeight} L ${points.join(' L ')} L ${svgWidth},${svgHeight} Z` : '';
  const lineData = points.length > 0 ? `M ${points.join(' L ')}` : '';

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const item = { hidden: { opacity: 0, scale: 0.95 }, show: { opacity: 1, scale: 1 } };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="h-full flex flex-col gap-6">
      <PageHeader
        title="Behaviour Analysis Control Console"
        subtitle="Unified pipeline aggregating Face Mesh, Gaze, Pose, Voice VAD, and YOLO tracks statefully"
        breadcrumb={['TrueView AI', 'Behaviour Engine']}
        actions={
          <div className="flex gap-2">
            {isActive && (
              <button
                onClick={handleReset}
                className="py-2 px-4 rounded-xl text-xs font-semibold bg-gray-50 hover:bg-gray-50 text-black font-bold border border-gray-200 transition-all"
              >
                Reset Session
              </button>
            )}
            <button
              onClick={toggleSession}
              className={`py-2 px-4 rounded-xl font-medium flex items-center gap-2 transition-all ${
                isActive
                  ? 'bg-danger-500/25 hover:bg-danger-500/35 text-danger-400 border border-danger-500/30'
                  : 'bg-primary-500 hover:bg-primary-600 text-black font-bold'
              }`}
            >
              {isActive ? <Square size={16} /> : <Play size={16} />}
              {isActive ? 'Stop Proctoring' : 'Start Session Monitor'}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        
        {/* ══════════ Left Side: Timeline Feed & Attention Graph ══════════ */}
        <div className="lg:col-span-8 space-y-6 flex flex-col min-h-0">
          
          {/* Attention Level Graph Card */}
          <motion.div variants={item} className="bg-white border border-gray-200 shadow-sm p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-primary-400" />
                <h3 className="text-sm font-bold text-black font-bold">Attention Level History</h3>
              </div>
              <div className="text-xs font-bold text-gray-600 font-semibold flex items-center gap-1.5">
                Current Level:
                <span className={`px-2 py-0.5 rounded font-mono text-sm ${
                  analysisData.metrics.attention_pct >= 85.0
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : analysisData.metrics.attention_pct >= 65.0
                    ? 'bg-warning-500/10 text-warning-400'
                    : 'bg-danger-500/10 text-danger-400'
                }`}>
                  {analysisData.metrics.attention_pct}%
                </span>
              </div>
            </div>

            {/* SVG Area Chart */}
            <div className="h-28 bg-gray-50/60 rounded-xl relative overflow-hidden border border-gray-200 p-1.5">
              {isActive ? (
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-full" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="attentionGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  
                  {/* Fill area */}
                  <path d={pathData} fill="url(#attentionGrad)" />
                  {/* Line border */}
                  <path d={lineData} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-600 font-semibold">
                  Graph offline. Start proctoring monitor to stream data points.
                </div>
              )}
            </div>
          </motion.div>

          {/* Session Timeline Feed */}
          <motion.div variants={item} className="bg-white border border-gray-200 shadow-sm p-5 rounded-2xl flex-1 flex flex-col min-h-[300px]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-primary-400" />
                <h3 className="text-sm font-bold text-black font-bold">Proctoring Timeline Log</h3>
              </div>
              <span className="text-[10px] text-gray-600 font-semibold font-bold bg-gray-50 px-2 py-0.5 rounded uppercase">
                Rolling Events
              </span>
            </div>

            {isActive ? (
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs max-h-[320px]">
                {analysisData.timeline.length > 0 ? (
                  <div className="space-y-3 relative border-l border-gray-200 ml-3 pl-5">
                    {analysisData.timeline.map((ev, index) => (
                      <div key={index} className="relative group">
                        
                        {/* Event Dot */}
                        <div className={`absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full border-2 border-surface-900 ${
                          ev.severity === 'CRITICAL'
                            ? 'bg-danger-500'
                            : ev.severity === 'WARNING'
                            ? 'bg-warning-500'
                            : 'bg-primary-500'
                        }`} />

                        <div className={`border rounded-xl p-3 flex items-start gap-4 transition-all hover:bg-gray-50/30 ${getSeverityStyles(ev.severity)}`}>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h4 className="font-bold text-black font-bold capitalize">{ev.event_type}</h4>
                              <div className="text-[10px] font-mono text-gray-600 font-semibold flex items-center gap-2">
                                <span>{ev.timestamp}</span>
                                <span>•</span>
                                <span>Duration: {ev.duration}s</span>
                              </div>
                            </div>
                            <p className="text-[11px] text-gray-600 font-semibold mt-1">{ev.description}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-600 font-semibold py-20 text-center">
                    <CheckCircle size={32} className="mb-2 text-emerald-500/80 animate-pulse" />
                    <p className="font-semibold text-gray-600 font-semibold">No flags registered yet</p>
                    <p className="text-[11px] text-gray-600 font-semibold mt-0.5">Workspace activities are normal.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-600 font-semibold text-center py-20">
                <ActivitySquare size={48} className="mb-3 text-gray-600 font-semibold animate-pulse" />
                <h4 className="text-sm font-bold text-gray-600 font-semibold">Timeline Offline</h4>
                <p className="text-[11px] text-gray-600 font-semibold mt-1 max-w-xs">
                  Initiate the proctor session to log live student behaviors and room changes.
                </p>
              </div>
            )}
          </motion.div>
        </div>

        {/* ══════════ Right Side: Live Video, Active Events, Metrics ══════════ */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Live Proctor View Card */}
          <motion.div variants={item} className="bg-white border border-gray-200 shadow-sm p-4 rounded-2xl space-y-4">
            <div className="aspect-video bg-black rounded-xl overflow-hidden relative border border-gray-200 flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${isActive ? '' : 'hidden'}`}
              />
              {!isActive && (
                <div className="text-center text-gray-600 font-semibold p-4">
                  <Shield size={36} className="mx-auto mb-2 text-gray-600 font-semibold" />
                  <div className="text-xs font-semibold text-gray-600 font-semibold">Video Capture Off</div>
                </div>
              )}

              {isActive && (
                <div className="absolute top-2 left-2 flex gap-1.5">
                  <span className="bg-primary-500/20 backdrop-blur-md border border-primary-500/30 text-primary-400 text-[10px] font-bold px-2 py-0.5 rounded">
                    FPS: {loopFps}
                  </span>
                </div>
              )}
            </div>

            {/* Active alerts box */}
            {isActive && analysisData.active_events.length > 0 && (
              <div className="bg-danger-500/10 border border-danger-500/20 text-danger-400 rounded-xl p-3 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle size={14} className="animate-bounce" />
                  Active Frame Warnings:
                </div>
                <div className="text-[11px] list-disc pl-4">
                  {analysisData.active_events.map((ae, i) => (
                    <div key={i}>• {ae.type}</div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>

          {/* Session Summary Statistics */}
          <motion.div variants={item} className="bg-white border border-gray-200 shadow-sm p-5 rounded-2xl bg-gray-50 space-y-4">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-primary-400" />
              <h3 className="text-sm font-bold text-black font-bold">Compliance Summary</h3>
            </div>

            <div className="space-y-3.5 text-xs">
              
              {/* Insight Rating */}
              <div className="flex justify-between items-center bg-gray-50/40 p-2.5 rounded-lg">
                <span className="text-gray-600 font-semibold">Class Rating</span>
                <span className={`px-2 py-0.5 rounded font-extrabold text-[10px] uppercase ${
                  analysisData.session_summary.attention_rating === 'Excellent'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-warning-500/10 text-warning-400 border border-warning-500/20'
                }`}>
                  {analysisData.session_summary.attention_rating}
                </span>
              </div>

              {/* Behavior Insight */}
              <div className="flex justify-between items-center bg-gray-50/40 p-2.5 rounded-lg">
                <span className="text-gray-600 font-semibold">Room Status</span>
                <span className="font-bold text-black font-bold">{analysisData.session_summary.behavioral_insight}</span>
              </div>

              {/* Cumulative stats */}
              <div className="grid grid-cols-2 gap-2 text-center text-[10px] mt-2">
                <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                  <div className="text-gray-600 font-semibold font-bold">Focus Time</div>
                  <div className="text-sm font-extrabold font-mono text-black font-bold mt-0.5">
                    {analysisData.metrics.focus_duration_seconds}s
                  </div>
                </div>

                <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                  <div className="text-gray-600 font-semibold font-bold">Speaking Time</div>
                  <div className="text-sm font-extrabold font-mono text-black font-bold mt-0.5">
                    {analysisData.metrics.speaking_duration_seconds}s
                  </div>
                </div>

                <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                  <div className="text-gray-600 font-semibold font-bold">Look Away Count</div>
                  <div className="text-sm font-extrabold font-mono text-black font-bold mt-0.5 text-warning-400">
                    {analysisData.metrics.looking_away_count}
                  </div>
                </div>

                <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                  <div className="text-gray-600 font-semibold font-bold">Phones Detected</div>
                  <div className="text-sm font-extrabold font-mono text-black font-bold mt-0.5 text-danger-400">
                    {analysisData.metrics.phone_detection_count}
                  </div>
                </div>
              </div>

            </div>
          </motion.div>

        </div>

      </div>
    </motion.div>
  );
}
