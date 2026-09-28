import { useState, useEffect, useRef } from 'react';
import {
  Eye, Play, Square, Sparkles, AlertCircle, Activity,
  MonitorCheck, Focus, ArrowUpDown, TrendingUp
} from 'lucide-react';
import { motion } from 'framer-motion';
import PageHeader from '../components/Cards/PageHeader';
import StatusBadge from '../components/Cards/StatusBadge';
import GazeDirectionIndicator from '../components/Charts/GazeDirectionIndicator';
import AttentionMeter from '../components/Charts/AttentionMeter';
import FocusTimer from '../components/Charts/FocusTimer';
import ProgressBar from '../components/Charts/ProgressBar';
import useCamera from '../hooks/useCamera';
import useFaceLandmarker from '../hooks/useFaceLandmarker';

export default function EyeGazeViewer() {
  const { videoRef, isActive, error, startCamera, stopCamera, captureFrameBase64 } = useCamera();
  const landmarker = useFaceLandmarker(videoRef, { enabled: isActive });

  // Gaze & attention state
  const [gazeData, setGazeData] = useState({
    faceDetected: false,
    eyeStatus: 'UNKNOWN',
    leftEAR: 0,
    rightEAR: 0,
    ear: 0,
    gazeDirection: 'unknown',
    confidence: 0,
    attentionStatus: 'looking_away',
    focusState: 'FACE_NOT_DETECTED',
    attentionScore: 0,
    focusDuration: 0,
    sessionAttentionPct: 0,
    horizontalOffset: 0,
    verticalOffset: 0,
    isFocused: false,
    processingTimeMs: 0,
    fps: 0,
    framesAnalyzed: 0,
  });

  const canvasRef = useRef(null);
  const loopRef = useRef(null);
  const fpsTimestampsRef = useRef([]);
  const isProcessingRef = useRef(false);
  const lastSentTimeRef = useRef(0);
  const lastLogTimeRef = useRef(0);
  const activeSessionId = useRef(`gaze_session_${Date.now()}`);

  const renderHudOverlay = (result) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!result || !result.face_detected) return;

    const w = canvas.width;
    const h = canvas.height;
    const eyeStatus = result.eye_status;

    if (eyeStatus === 'CLOSED') {
      ctx.save();
      ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
      ctx.fillRect(0, h * 0.35, w, h * 0.3);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(w * 0.2, h * 0.38, w * 0.6, h * 0.24);
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 15px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('EYES CLOSED DETECTED', w / 2, h * 0.52);
      ctx.restore();
      return;
    }

    // Draw Gaze Target Reticle when eyes are open or blinking
    const hOffset = result.horizontal_offset || 0;
    const vOffset = result.vertical_offset || 0;
    const isBlinking = eyeStatus === 'BLINKING';
    const isCenter = Math.abs(hOffset) < 0.15 && Math.abs(vOffset) < 0.15;
    const color = isBlinking ? '#f59e0b' : (isCenter ? '#10b981' : '#3b82f6');

    const targetX = w * (0.5 + hOffset * 0.65);
    const targetY = h * (0.5 + vOffset * 0.65);

    ctx.save();
    // Gaze tracking point (directional line/trajectory removed)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(targetX, targetY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const toggleCamera = () => {
    if (isActive) {
      stopCamera();
      fpsTimestampsRef.current = [];
      isProcessingRef.current = false;
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      setGazeData(prev => ({
        ...prev,
        faceDetected: false,
        eyeStatus: 'UNKNOWN',
        leftEAR: 0,
        rightEAR: 0,
        ear: 0,
        gazeDirection: 'unknown',
        confidence: 0,
        attentionStatus: 'looking_away',
        focusState: 'FACE_NOT_DETECTED',
        attentionScore: 0,
        isFocused: false,
        fps: 0,
      }));
    } else {
      activeSessionId.current = `gaze_session_${Date.now()}`;
      fpsTimestampsRef.current = [];
      isProcessingRef.current = false;
      lastSentTimeRef.current = 0;
      // Reset AI session state
      fetch('/ai-api/eye-gaze/reset-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: activeSessionId.current }),
      }).catch(() => {});
      startCamera();
    }
  };

  // Continuous, non-blocking frame processing loop
  useEffect(() => {
    let active = true;

    const processLoop = () => {
      if (!isActive || !active) return;

      // Keep native video stream & requestAnimationFrame running uninterrupted
      loopRef.current = requestAnimationFrame(processLoop);

      const now = performance.now();

      // Adaptive throttle: if an AI request is in flight or interval is < 45ms (~22 FPS max), skip dispatch
      if (isProcessingRef.current || (now - lastSentTimeRef.current < 45)) {
        return;
      }

      const frame = captureFrameBase64();
      if (!frame) return;

      isProcessingRef.current = true;
      lastSentTimeRef.current = now;

      const eyeMetrics = landmarker.getEyeMetrics();

      fetch('/ai-api/eye-gaze/process-eye-gaze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: frame,
          draw_overlay: false,
          eye_metrics: eyeMetrics,
        }),
      })
      .then(async (res) => {
        if (!res.ok || !active) return;
        const result = await res.json();
        if (!active) return;

        // Rolling 1-second window FPS calculation
        const finishTime = performance.now();
        fpsTimestampsRef.current.push(finishTime);
        while (
          fpsTimestampsRef.current.length > 0 &&
          fpsTimestampsRef.current[0] < finishTime - 1000
        ) {
          fpsTimestampsRef.current.shift();
        }
        const currentFps = fpsTimestampsRef.current.length;

        setGazeData(prev => ({
          ...prev,
          faceDetected: result.face_detected,
          eyeStatus: result.eye_status || 'UNKNOWN',
          leftEAR: result.left_ear ?? eyeMetrics?.leftEAR ?? 0,
          rightEAR: result.right_ear ?? eyeMetrics?.rightEAR ?? 0,
          ear: result.ear ?? eyeMetrics?.averageEAR ?? 0,
          gazeDirection: result.gaze_direction || (result.face_detected ? 'unknown' : '—'),
          confidence: result.confidence || 0,
          attentionStatus: result.attention_status || (result.face_detected ? 'focused' : 'looking_away'),
          focusState: result.focus_state || (result.face_detected ? 'FOCUSED' : 'FACE_NOT_DETECTED'),
          attentionScore: result.attention_score ?? 0,
          focusDuration: result.focus_duration_seconds || 0,
          sessionAttentionPct: result.session_attention_pct || 0,
          horizontalOffset: result.horizontal_offset || 0,
          verticalOffset: result.vertical_offset || 0,
          isFocused: result.is_currently_focused || false,
          processingTimeMs: result.processing_time_ms || 0,
          framesAnalyzed: result.frames_analyzed || 0,
          fps: currentFps,
        }));

        // Render transparent HUD vector overlay on top of the live video
        renderHudOverlay(result);

        // Throttle telemetry logging to once per second max
        if (result.face_detected && (finishTime - lastLogTimeRef.current >= 1000)) {
          lastLogTimeRef.current = finishTime;
          fetch('/api/eye-gaze/log', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
            },
            body: JSON.stringify({
              sessionId: activeSessionId.current,
              gazeDirection: result.gaze_direction,
              attentionStatus: result.attention_status,
              focusState: result.focus_state,
              attentionScore: result.attention_score,
              focusDuration: result.focus_duration_seconds,
              confidence: result.confidence,
              processingTimeMs: result.processing_time_ms,
            }),
          }).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => {
        isProcessingRef.current = false;
      });
    };

    if (isActive) {
      loopRef.current = requestAnimationFrame(processLoop);
    }

    return () => {
      active = false;
      if (loopRef.current) cancelAnimationFrame(loopRef.current);
    };
  }, [isActive, captureFrameBase64]);

  // Clean up on unmount
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);  // Determine attention badge variant
  const attentionVariant = {
    focused: 'success',
    blinking: 'warning',
    eyes_closed: 'danger',
    distracted: 'warning',
    looking_away: 'danger',
  }[gazeData.attentionStatus] || 'neutral';

  // Determine attention progress bar color
  const attentionColor = gazeData.attentionScore >= 70 ? 'success'
    : gazeData.attentionScore >= 40 ? 'warning' : 'danger';

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const item = { hidden: { opacity: 0, scale: 0.95 }, show: { opacity: 1, scale: 1 } };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="h-full flex flex-col gap-6">
      <PageHeader
        title="Eye Gaze Tracking"
        subtitle="Real-time iris detection, gaze estimation & attention monitoring"
        breadcrumb={['TrueView AI', 'Eye Gaze']}
        actions={
          <button
            onClick={toggleCamera}
            className={`py-2 px-4 rounded-xl font-medium flex items-center gap-2 transition-all ${
              isActive
                ? 'bg-danger-500/25 hover:bg-danger-500/35 text-danger-400 border border-danger-500/30'
                : 'bg-primary-500 hover:bg-primary-600 text-black font-bold'
            }`}
          >
            {isActive ? <Square size={16} /> : <Play size={16} />}
            {isActive ? 'Stop Tracking' : 'Start Eye Tracking'}
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        {/* ══════════ Left: Camera Feed ══════════ */}
        <motion.div variants={item} className="lg:col-span-8 flex flex-col h-[500px] lg:h-auto">
          <div className="bg-white border border-gray-200 shadow-sm flex-1 relative rounded-2xl overflow-hidden border-gray-200 h-full bg-black flex items-center justify-center">
            {/* Continuous hardware live video feed */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${isActive ? '' : 'hidden'}`}
            />
            {/* Transparent HUD canvas for gaze vector and tracking overlay */}
            <canvas
              ref={canvasRef}
              className={`absolute inset-0 w-full h-full object-cover pointer-events-none ${isActive ? '' : 'hidden'}`}
            />

            {isActive ? (
              <>
                {/* Live badges */}
                <div className="absolute top-4 left-4 flex gap-2">
                  <span className="bg-primary-500/20 backdrop-blur-md border border-primary-500/30 text-primary-400 text-xs font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5 animate-pulse">
                    <Sparkles size={12} /> EYE TRACKING
                  </span>
                  {gazeData.faceDetected && (
                    <StatusBadge
                      label={
                        gazeData.attentionStatus === 'eyes_closed'
                          ? 'EYES CLOSED'
                          : gazeData.attentionStatus?.replace('_', ' ').toUpperCase() || 'N/A'
                      }
                      variant={attentionVariant}
                      dot
                    />
                  )}
                </div>

                {/* Direction overlay (bottom-left) */}
                {gazeData.faceDetected && (
                  <div className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 border border-slate-700 shadow-md">
                    <div className="flex items-center gap-2">
                      <Eye size={14} className={gazeData.eyeStatus === 'CLOSED' ? 'text-rose-400' : 'text-primary-400'} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${
                        gazeData.eyeStatus === 'CLOSED' ? 'text-rose-400' : 'text-white'
                      }`}>
                        {gazeData.eyeStatus === 'CLOSED'
                          ? 'EYES CLOSED'
                          : gazeData.eyeStatus === 'BLINKING'
                          ? 'BLINKING'
                          : gazeData.gazeDirection}
                      </span>
                      {gazeData.eyeStatus === 'OPEN' && (
                        <span className="text-[10px] text-gray-300 font-semibold font-mono">
                          {(gazeData.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-gray-600 font-semibold p-8 flex flex-col items-center">
                <Eye size={64} className="mb-4 text-gray-600 font-semibold" />
                <h3 className="text-lg font-medium text-gray-600 font-semibold">Eye Tracking Inactive</h3>
                <p className="text-xs text-gray-600 font-semibold max-w-xs mt-1">
                  Start eye tracking to monitor gaze direction and attention levels in real-time.
                </p>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-6 text-danger-400">
                <AlertCircle size={48} className="mb-4" />
                <p className="text-sm font-semibold">{error}</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* ══════════ Right: Metrics Panel ══════════ */}
        <motion.div variants={item} className="lg:col-span-4 space-y-4 overflow-y-auto">

          {/* ── Gaze Direction Indicator ── */}
          <div className="bg-white border border-gray-200 shadow-sm p-5 rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              <Focus size={16} className="text-primary-400" />
              <h3 className="text-sm font-bold text-black font-bold">Gaze Direction</h3>
            </div>
            <div className="flex justify-center">
              <GazeDirectionIndicator
                direction={
                  !gazeData.faceDetected || gazeData.eyeStatus === 'CLOSED' || gazeData.eyeStatus === 'BLINKING'
                    ? 'unknown'
                    : gazeData.gazeDirection
                }
                confidence={gazeData.faceDetected && gazeData.eyeStatus === 'OPEN' ? gazeData.confidence : 0}
              />
            </div>
          </div>

          {/* ── Attention Meter + Score ── */}
          <div className="bg-white border border-gray-200 shadow-sm p-5 rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              <MonitorCheck size={16} className="text-primary-400" />
              <h3 className="text-sm font-bold text-black font-bold">Attention Level</h3>
            </div>

            <div className="flex justify-center mb-4">
              <AttentionMeter
                score={gazeData.faceDetected ? gazeData.attentionScore : 0}
                status={gazeData.faceDetected ? gazeData.attentionStatus : 'focused'}
                size={130}
              />
            </div>

            {/* Attention progress bar */}
            <ProgressBar
              label="Session Attention"
              value={gazeData.faceDetected ? gazeData.sessionAttentionPct : 0}
              color={attentionColor}
            />
          </div>

          {/* ── Focus Timer ── */}
          <FocusTimer
            seconds={gazeData.focusDuration}
            isFocused={gazeData.isFocused && gazeData.faceDetected}
          />

          {/* ── Eye Status & Metrics ── */}
          <div className="bg-white border border-gray-200 shadow-sm p-5 rounded-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-primary-400" />
                <h3 className="text-sm font-bold text-black font-bold">Pipeline Metrics</h3>
              </div>
              <StatusBadge
                label={gazeData.faceDetected ? 'TRACKING' : 'IDLE'}
                variant={gazeData.faceDetected ? 'success' : 'neutral'}
                dot
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Eye Status */}
              <div className="bg-gray-50/50 rounded-lg p-3 text-center">
                <div className="text-[10px] text-gray-600 font-semibold uppercase font-mono tracking-wider">Eye Status</div>
                <div className={`text-base font-black mt-1 ${
                  !gazeData.faceDetected ? 'text-gray-400' :
                  gazeData.eyeStatus === 'CLOSED' ? 'text-rose-600 font-black' :
                  gazeData.eyeStatus === 'BLINKING' ? 'text-amber-500 font-black' :
                  gazeData.eyeStatus === 'PARTIALLY_CLOSED' ? 'text-amber-500 font-black' :
                  'text-emerald-600 font-black'
                }`}>
                  {!gazeData.faceDetected ? '—' :
                   gazeData.eyeStatus === 'CLOSED' ? '🙈 CLOSED' :
                   gazeData.eyeStatus === 'BLINKING' ? '😉 BLINKING' :
                   gazeData.eyeStatus === 'PARTIALLY_CLOSED' ? '😑 PARTIAL' :
                   '👁️ OPEN'}
                </div>
              </div>

              {/* Looking Direction */}
              <div className="bg-gray-50/50 rounded-lg p-3 text-center">
                <div className="text-[10px] text-gray-600 font-semibold uppercase font-mono tracking-wider">Direction</div>
                <div className={`text-base font-black mt-1 uppercase ${
                  !gazeData.faceDetected || gazeData.eyeStatus === 'CLOSED' || gazeData.eyeStatus === 'BLINKING' || gazeData.gazeDirection === 'unknown' ? 'text-rose-600' : 'text-black font-bold'
                }`}>
                  {!gazeData.faceDetected ? '—' :
                   gazeData.eyeStatus === 'CLOSED' ? 'UNKNOWN' :
                   gazeData.eyeStatus === 'BLINKING' ? 'UNKNOWN' :
                   gazeData.gazeDirection === 'unknown' ? 'UNKNOWN' :
                   gazeData.gazeDirection}
                </div>
              </div>

              {/* Pipeline FPS */}
              <div className="bg-gray-50/50 rounded-lg p-3 text-center">
                <div className="text-[10px] text-gray-600 font-semibold uppercase font-mono tracking-wider">FPS</div>
                <div className="text-lg font-bold font-mono text-black font-bold mt-1">
                  {isActive ? gazeData.fps : 0}
                </div>
              </div>

              {/* Latency */}
              <div className="bg-gray-50/50 rounded-lg p-3 text-center">
                <div className="text-[10px] text-gray-600 font-semibold uppercase font-mono tracking-wider">Latency</div>
                <div className="text-lg font-bold font-mono text-black font-bold mt-1">
                  {gazeData.faceDetected ? `${gazeData.processingTimeMs}ms` : '0ms'}
                </div>
              </div>

              {/* Frames Analyzed */}
              <div className="bg-gray-50/50 rounded-lg p-3 text-center">
                <div className="text-[10px] text-gray-600 font-semibold uppercase font-mono tracking-wider">Frames</div>
                <div className="text-lg font-bold font-mono text-black font-bold mt-1">
                  {gazeData.framesAnalyzed}
                </div>
              </div>

              {/* Current State */}
              <div className="bg-gray-50/50 rounded-lg p-3 text-center">
                <div className="text-[10px] text-gray-600 font-semibold uppercase font-mono tracking-wider">State</div>
                <div className="mt-1 flex items-center justify-center">
                  <StatusBadge
                    label={
                      !gazeData.faceDetected ? 'FACE NOT DETECTED' :
                      gazeData.eyeStatus === 'CLOSED' ? 'EYES CLOSED' :
                      gazeData.eyeStatus === 'BLINKING' ? 'BLINKING' :
                      gazeData.focusState || gazeData.attentionStatus?.replace('_', ' ').toUpperCase() || 'N/A'
                    }
                    variant={gazeData.faceDetected ? attentionVariant : 'danger'}
                  />
                </div>
              </div>
            </div>

            {/* EAR Metrics detail */}
            {gazeData.faceDetected && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-gray-600 font-semibold uppercase tracking-wider font-semibold">Eye Aspect Ratio (EAR)</span>
                  <span className="text-[10px] font-mono text-gray-500">Threshold: 0.21</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-gray-50/50 rounded-lg px-2 py-1.5 text-center">
                    <div className="text-[9px] text-gray-600 font-semibold font-mono">Left EAR</div>
                    <div className="text-xs font-bold font-mono text-gray-800">
                      {gazeData.leftEAR ? gazeData.leftEAR.toFixed(3) : gazeData.ear.toFixed(3)}
                    </div>
                  </div>
                  <div className="bg-gray-50/50 rounded-lg px-2 py-1.5 text-center">
                    <div className="text-[9px] text-gray-600 font-semibold font-mono">Right EAR</div>
                    <div className="text-xs font-bold font-mono text-gray-800">
                      {gazeData.rightEAR ? gazeData.rightEAR.toFixed(3) : gazeData.ear.toFixed(3)}
                    </div>
                  </div>
                  <div className="bg-gray-50/50 rounded-lg px-2 py-1.5 text-center">
                    <div className="text-[9px] text-gray-600 font-semibold font-mono">Avg EAR</div>
                    <div className={`text-xs font-bold font-mono ${gazeData.ear <= 0.21 ? 'text-rose-600 font-black' : 'text-emerald-600 font-bold'}`}>
                      {gazeData.ear.toFixed(3)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Iris position detail */}
            {gazeData.faceDetected && gazeData.eyeStatus === 'OPEN' && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowUpDown size={12} className="text-gray-600 font-semibold" />
                  <span className="text-[10px] text-gray-600 font-semibold uppercase tracking-wider font-semibold">Iris Offset</span>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1 bg-gray-50/50 rounded-lg px-3 py-2">
                    <div className="text-[10px] text-gray-600 font-semibold font-mono">H-Offset</div>
                    <div className="text-sm font-bold font-mono text-gray-800">
                      {gazeData.horizontalOffset > 0 ? '+' : ''}{gazeData.horizontalOffset.toFixed(3)}
                    </div>
                  </div>
                  <div className="flex-1 bg-gray-50/50 rounded-lg px-3 py-2">
                    <div className="text-[10px] text-gray-600 font-semibold font-mono">V-Offset</div>
                    <div className="text-sm font-bold font-mono text-gray-800">
                      {gazeData.verticalOffset > 0 ? '+' : ''}{gazeData.verticalOffset.toFixed(3)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
