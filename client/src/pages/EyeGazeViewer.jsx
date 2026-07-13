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

export default function EyeGazeViewer() {
  const { videoRef, isActive, error, startCamera, stopCamera, captureFrameBase64 } = useCamera();

  // Gaze & attention state
  const [gazeData, setGazeData] = useState({
    faceDetected: false,
    gazeDirection: 'center',
    confidence: 0,
    attentionStatus: 'focused',
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
  const framesProcessed = useRef(0);
  const lastFpsTime = useRef(Date.now());
  const activeSessionId = useRef(`gaze_session_${Date.now()}`);

  const toggleCamera = () => {
    if (isActive) {
      stopCamera();
      setGazeData(prev => ({
        ...prev,
        faceDetected: false,
        gazeDirection: 'center',
        confidence: 0,
        attentionStatus: 'focused',
        attentionScore: 0,
        isFocused: false,
        fps: 0,
      }));
    } else {
      activeSessionId.current = `gaze_session_${Date.now()}`;
      // Reset AI session state
      fetch('/ai-api/eye-gaze/reset-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: activeSessionId.current }),
      }).catch(() => {});
      startCamera();
    }
  };

  // Main processing loop
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
      framesProcessed.current++;
      const now = Date.now();
      if (now - lastFpsTime.current >= 1000) {
        setGazeData(prev => ({ ...prev, fps: framesProcessed.current }));
        framesProcessed.current = 0;
        lastFpsTime.current = now;
      }

      try {
        const res = await fetch('/ai-api/eye-gaze/process-eye-gaze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: frame, draw_overlay: true }),
        });

        const result = await res.json();

        if (active && res.ok) {
          setGazeData(prev => ({
            ...prev,
            faceDetected: result.face_detected,
            gazeDirection: result.gaze_direction || 'center',
            confidence: result.confidence || 0,
            attentionStatus: result.attention_status || 'focused',
            attentionScore: result.attention_score || 0,
            focusDuration: result.focus_duration_seconds || 0,
            sessionAttentionPct: result.session_attention_pct || 0,
            horizontalOffset: result.horizontal_offset || 0,
            verticalOffset: result.vertical_offset || 0,
            isFocused: result.is_currently_focused || false,
            processingTimeMs: result.processing_time_ms || 0,
            framesAnalyzed: result.frames_analyzed || 0,
          }));

          // Render annotated image to canvas
          if (result.face_detected && result.annotated_image) {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            const video = videoRef.current;

            if (canvas && ctx && video) {
              canvas.width = video.clientWidth;
              canvas.height = video.clientHeight;

              const img = new Image();
              img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              };
              img.src = result.annotated_image;
            }
          } else {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (canvas && ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
          }

          // Log to backend
          if (result.face_detected) {
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
                attentionScore: result.attention_score,
                focusDuration: result.focus_duration_seconds,
                confidence: result.confidence,
                processingTimeMs: result.processing_time_ms,
              }),
            }).catch(() => {});
          }
        }
      } catch (e) {
        // silent fail – maintain loop
      }

      // Throttle to ~30 FPS
      setTimeout(() => {
        if (isActive && active) {
          loopRef.current = requestAnimationFrame(processLoop);
        }
      }, 33);
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
  }, [stopCamera]);

  // Determine attention badge variant
  const attentionVariant = {
    focused: 'success',
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
                : 'bg-primary-500 hover:bg-primary-600 text-white'
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
          <div className="glass flex-1 relative rounded-2xl overflow-hidden border-white/[0.1] h-full bg-black flex items-center justify-center">
            {/* Hidden video element for frame capture */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover opacity-30 ${isActive ? '' : 'hidden'}`}
            />
            {/* Canvas for annotated overlay */}
            <canvas
              ref={canvasRef}
              className={`absolute inset-0 w-full h-full object-cover ${isActive ? '' : 'hidden'}`}
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
                      label={gazeData.attentionStatus?.replace('_', ' ').toUpperCase() || 'N/A'}
                      variant={attentionVariant}
                      dot
                    />
                  )}
                </div>

                {/* Direction overlay (bottom-left) */}
                {gazeData.faceDetected && (
                  <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/10">
                    <div className="flex items-center gap-2">
                      <Eye size={14} className="text-primary-400" />
                      <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                        {gazeData.gazeDirection}
                      </span>
                      <span className="text-[10px] text-gray-500 font-mono">
                        {(gazeData.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-surface-600 p-8 flex flex-col items-center">
                <Eye size={64} className="mb-4 text-surface-700" />
                <h3 className="text-lg font-medium text-gray-400">Eye Tracking Inactive</h3>
                <p className="text-xs text-gray-500 max-w-xs mt-1">
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
          <div className="glass p-5 rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              <Focus size={16} className="text-primary-400" />
              <h3 className="text-sm font-bold text-gray-200">Gaze Direction</h3>
            </div>
            <div className="flex justify-center">
              <GazeDirectionIndicator
                direction={gazeData.faceDetected ? gazeData.gazeDirection : 'center'}
                confidence={gazeData.faceDetected ? gazeData.confidence : 0}
              />
            </div>
          </div>

          {/* ── Attention Meter + Score ── */}
          <div className="glass p-5 rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              <MonitorCheck size={16} className="text-primary-400" />
              <h3 className="text-sm font-bold text-gray-200">Attention Level</h3>
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
          <div className="glass p-5 rounded-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-primary-400" />
                <h3 className="text-sm font-bold text-gray-200">Pipeline Metrics</h3>
              </div>
              <StatusBadge
                label={gazeData.faceDetected ? 'TRACKING' : 'IDLE'}
                variant={gazeData.faceDetected ? 'success' : 'neutral'}
                dot
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Eye Status */}
              <div className="bg-surface-800/50 rounded-lg p-3 text-center">
                <div className="text-[10px] text-gray-500 uppercase font-mono tracking-wider">Eye Status</div>
                <div className="text-lg font-bold text-gray-200 mt-1">
                  {gazeData.faceDetected ? '👁️ Open' : '—'}
                </div>
              </div>

              {/* Looking Direction */}
              <div className="bg-surface-800/50 rounded-lg p-3 text-center">
                <div className="text-[10px] text-gray-500 uppercase font-mono tracking-wider">Direction</div>
                <div className="text-lg font-bold text-gray-200 mt-1 uppercase">
                  {gazeData.faceDetected ? gazeData.gazeDirection : '—'}
                </div>
              </div>

              {/* Pipeline FPS */}
              <div className="bg-surface-800/50 rounded-lg p-3 text-center">
                <div className="text-[10px] text-gray-500 uppercase font-mono tracking-wider">FPS</div>
                <div className="text-lg font-bold font-mono text-gray-200 mt-1">
                  {isActive ? gazeData.fps : 0}
                </div>
              </div>

              {/* Latency */}
              <div className="bg-surface-800/50 rounded-lg p-3 text-center">
                <div className="text-[10px] text-gray-500 uppercase font-mono tracking-wider">Latency</div>
                <div className="text-lg font-bold font-mono text-gray-200 mt-1">
                  {gazeData.faceDetected ? `${gazeData.processingTimeMs}ms` : '0ms'}
                </div>
              </div>

              {/* Frames Analyzed */}
              <div className="bg-surface-800/50 rounded-lg p-3 text-center">
                <div className="text-[10px] text-gray-500 uppercase font-mono tracking-wider">Frames</div>
                <div className="text-lg font-bold font-mono text-gray-200 mt-1">
                  {gazeData.framesAnalyzed}
                </div>
              </div>

              {/* Current State */}
              <div className="bg-surface-800/50 rounded-lg p-3 text-center">
                <div className="text-[10px] text-gray-500 uppercase font-mono tracking-wider">State</div>
                <div className="mt-1 flex items-center justify-center">
                  <StatusBadge
                    label={gazeData.faceDetected ? gazeData.attentionStatus?.replace('_', ' ').toUpperCase() : 'N/A'}
                    variant={gazeData.faceDetected ? attentionVariant : 'neutral'}
                  />
                </div>
              </div>
            </div>

            {/* Iris position detail */}
            {gazeData.faceDetected && (
              <div className="mt-3 pt-3 border-t border-white/[0.06]">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowUpDown size={12} className="text-gray-500" />
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Iris Offset</span>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1 bg-surface-800/50 rounded-lg px-3 py-2">
                    <div className="text-[10px] text-gray-500 font-mono">H-Offset</div>
                    <div className="text-sm font-bold font-mono text-gray-300">
                      {gazeData.horizontalOffset > 0 ? '+' : ''}{gazeData.horizontalOffset.toFixed(3)}
                    </div>
                  </div>
                  <div className="flex-1 bg-surface-800/50 rounded-lg px-3 py-2">
                    <div className="text-[10px] text-gray-500 font-mono">V-Offset</div>
                    <div className="text-sm font-bold font-mono text-gray-300">
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
