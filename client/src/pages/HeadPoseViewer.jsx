import { useState, useEffect, useRef } from 'react';
import {
  Play, Square, Sparkles, AlertCircle, Activity, Maximize2,
  Scan, Compass, MonitorPlay, ShieldAlert
} from 'lucide-react';
import { motion } from 'framer-motion';
import PageHeader from '../components/Cards/PageHeader';
import StatusBadge from '../components/Cards/StatusBadge';
import AngleDial from '../components/Charts/AngleDial';
import MetricGauge from '../components/Charts/MetricGauge';
import ProgressBar from '../components/Charts/ProgressBar';
import useCamera from '../hooks/useCamera';

export default function HeadPoseViewer() {
  const { videoRef, isActive, error, startCamera, stopCamera, captureFrameBase64 } = useCamera();

  // Head pose and attention states
  const [poseData, setPoseData] = useState({
    faceDetected: false,
    pitch: 0.0,
    yaw: 0.0,
    roll: 0.0,
    headDirection: 'Looking Straight',
    confidence: 0.0,
    attentionStatus: 'focused',
    screenFacingRatio: 100.0,
    screenFacingDuration: 0.0,
    headStability: 'High',
    headStabilityValue: 0.0,
    movementFrequency: 0.0,
    processingTimeMs: 0,
    fps: 0
  });

  const canvasRef = useRef(null);
  const loopRef = useRef(null);
  const framesProcessed = useRef(0);
  const lastFpsTime = useRef(Date.now());
  const activeSessionId = useRef(`pose_session_${Date.now()}`);

  const toggleCamera = () => {
    if (isActive) {
      stopCamera();
      setPoseData(prev => ({
        ...prev,
        faceDetected: false,
        pitch: 0.0,
        yaw: 0.0,
        roll: 0.0,
        headDirection: 'Looking Straight',
        confidence: 0.0,
        attentionStatus: 'focused',
        screenFacingRatio: 100.0,
        screenFacingDuration: 0.0,
        headStability: 'High',
        headStabilityValue: 0.0,
        movementFrequency: 0.0,
        fps: 0
      }));
    } else {
      activeSessionId.current = `pose_session_${Date.now()}`;
      // Reset AI head pose session tracker state
      fetch('/ai-api/head-pose/reset-pose-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: activeSessionId.current })
      }).catch(() => {});
      startCamera();
    }
  };

  const handleResetMetrics = () => {
    fetch('/ai-api/head-pose/reset-pose-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: activeSessionId.current })
    })
      .then(() => {
        setPoseData(prev => ({
          ...prev,
          screenFacingRatio: 100.0,
          screenFacingDuration: 0.0,
          movementFrequency: 0.0
        }));
      })
      .catch(() => {});
  };

  // Main real-time pipeline loop
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
        setPoseData(prev => ({ ...prev, fps: framesProcessed.current }));
        framesProcessed.current = 0;
        lastFpsTime.current = now;
      }

      try {
        const res = await fetch('/ai-api/head-pose/process-head-pose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: frame, draw_overlay: true })
        });

        const result = await res.json();

        if (active && res.ok) {
          setPoseData(prev => ({
            ...prev,
            faceDetected: result.face_detected,
            pitch: result.pitch || 0.0,
            yaw: result.yaw || 0.0,
            roll: result.roll || 0.0,
            headDirection: result.head_direction || 'Looking Straight',
            confidence: result.confidence || 0.0,
            attentionStatus: result.attention_status || 'focused',
            screenFacingRatio: result.screen_facing_ratio || 100.0,
            screenFacingDuration: result.screen_facing_duration_seconds || 0.0,
            headStability: result.head_stability || 'High',
            headStabilityValue: result.head_stability_value || 0.0,
            movementFrequency: result.movement_frequency_per_minute || 0.0,
            processingTimeMs: result.processing_time_ms || 0
          }));

          // Render response image to canvas
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

          // Optional: Log metrics to backend Node.js server
          if (result.face_detected) {
            fetch('/api/head-pose/log', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('trueview_token')}`
              },
              body: JSON.stringify({
                sessionId: activeSessionId.current,
                pitch: result.pitch,
                yaw: result.yaw,
                roll: result.roll,
                headDirection: result.head_direction,
                attentionStatus: result.attention_status,
                screenFacingRatio: result.screen_facing_ratio,
                headStability: result.head_stability,
                movementFrequency: result.movement_frequency_per_minute,
                processingTimeMs: result.processing_time_ms
              })
            }).catch(() => {});
          }
        }
      } catch (e) {
        // silent fail
      }

      // Throttle to hit target 25-30 FPS
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

  // Clean up stream on unmount
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const attentionVariantMap = {
    focused: 'success',
    distracted: 'warning',
    looking_away: 'danger'
  };

  const attentionColorMap = {
    focused: 'success',
    distracted: 'warning',
    looking_away: 'danger'
  };

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const item = { hidden: { opacity: 0, scale: 0.95 }, show: { opacity: 1, scale: 1 } };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="h-full flex flex-col gap-6">
      <PageHeader
        title="Head Pose Estimation"
        subtitle="3D orientation mapping, perspective-n-point tracking & stability analytics"
        breadcrumb={['TrueView AI', 'Head Pose']}
        actions={
          <div className="flex gap-2">
            {isActive && (
              <button
                onClick={handleResetMetrics}
                className="py-2 px-4 rounded-xl text-xs font-semibold bg-gray-50 hover:bg-gray-50 text-black font-bold border border-gray-200 transition-all"
              >
                Reset Metrics
              </button>
            )}
            <button
              onClick={toggleCamera}
              className={`py-2 px-4 rounded-xl font-medium flex items-center gap-2 transition-all ${
                isActive
                  ? 'bg-danger-500/25 hover:bg-danger-500/35 text-danger-400 border border-danger-500/30'
                  : 'bg-primary-500 hover:bg-primary-600 text-black font-bold'
              }`}
            >
              {isActive ? <Square size={16} /> : <Play size={16} />}
              {isActive ? 'Stop Stream' : 'Start Pose Stream'}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        {/* ══════════ Left Side: Stream Viewer ══════════ */}
        <motion.div variants={item} className="lg:col-span-8 flex flex-col h-[500px] lg:h-auto">
          <div className="bg-white border border-gray-200 shadow-sm flex-1 relative rounded-2xl overflow-hidden border-gray-200 h-full bg-black flex items-center justify-center">
            {/* Hidden raw video feed */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover opacity-30 ${isActive ? '' : 'hidden'}`}
            />
            {/* Canvas for 3D axis visualization */}
            <canvas
              ref={canvasRef}
              className={`absolute inset-0 w-full h-full object-cover ${isActive ? '' : 'hidden'}`}
            />

            {isActive ? (
              <div className="absolute top-4 left-4 flex gap-2">
                <span className="bg-primary-500/20 backdrop-blur-md border border-primary-500/30 text-primary-400 text-xs font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5 animate-pulse">
                  <Sparkles size={12} /> 3D POSE ESTIMATION
                </span>
                {poseData.faceDetected && (
                  <StatusBadge
                    label={poseData.attentionStatus.toUpperCase()}
                    variant={attentionVariantMap[poseData.attentionStatus] || 'neutral'}
                    dot
                  />
                )}
              </div>
            ) : (
              <div className="text-center text-gray-600 font-semibold p-8 flex flex-col items-center">
                <Compass size={64} className="mb-4 text-gray-600 font-semibold animate-spin-slow" />
                <h3 className="text-lg font-medium text-gray-600 font-semibold">Pose Stream Inactive</h3>
                <p className="text-xs text-gray-600 font-semibold max-w-xs mt-1">
                  Start the camera stream to visualize the head orientation tracking system.
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

        {/* ══════════ Right Side: Metrics & Angle Dials ══════════ */}
        <motion.div variants={item} className="lg:col-span-4 space-y-4 overflow-y-auto pr-1">
          
          {/* Gyro Angle Dials */}
          <div className="bg-white border border-gray-200 shadow-sm p-5 rounded-2xl space-y-4">
            <div className="flex items-center gap-2">
              <Scan size={16} className="text-primary-400" />
              <h3 className="text-sm font-bold text-black font-bold">Gyro Rotation Dials</h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <AngleDial
                label="Pitch (Up/Dn)"
                value={poseData.faceDetected ? poseData.pitch : 0}
              />
              <AngleDial
                label="Yaw (L/R)"
                value={poseData.faceDetected ? poseData.yaw : 0}
              />
              <AngleDial
                label="Roll (Tilt)"
                value={poseData.faceDetected ? poseData.roll : 0}
              />
            </div>
          </div>

          {/* Attention and Facing Stats */}
          <div className="bg-white border border-gray-200 shadow-sm p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MonitorPlay size={16} className="text-primary-400" />
                <h3 className="text-sm font-bold text-black font-bold">Attention Metrics</h3>
              </div>
              {poseData.faceDetected && (
                <span className="text-[10px] text-gray-600 font-semibold font-mono">
                  {(poseData.confidence * 100).toFixed(0)}% conf
                </span>
              )}
            </div>

            <div className="flex justify-center py-2">
              <MetricGauge
                value={poseData.faceDetected ? Math.round(poseData.screenFacingRatio) : 100}
                max={100}
                size={120}
                strokeWidth={8}
                label="Screen Focus %"
              />
            </div>

            <ProgressBar
              label="Facing Duration"
              value={poseData.faceDetected ? Math.min(100, (poseData.screenFacingDuration / 60) * 100) : 0}
              color={attentionColorMap[poseData.attentionStatus] || 'primary'}
            />
            
            <div className="text-[10px] text-center text-gray-600 font-semibold font-mono">
              Continuous Focused Time: {poseData.screenFacingDuration.toFixed(1)}s
            </div>
          </div>

          {/* Stability & Tracking Stats */}
          <div className="bg-white border border-gray-200 shadow-sm p-5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-primary-400" />
                <h3 className="text-sm font-bold text-black font-bold">Stability & Latency</h3>
              </div>
              <StatusBadge
                label={poseData.faceDetected ? 'STABLE' : 'N/A'}
                variant={poseData.headStability === 'High' ? 'success' : poseData.headStability === 'Medium' ? 'warning' : 'danger'}
                dot
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50/40 border border-gray-200 rounded-lg p-2.5 text-center">
                <div className="text-[9px] text-gray-600 font-semibold uppercase font-bold tracking-wider">Orientation</div>
                <div className="text-xs font-bold text-black font-bold mt-1 truncate">
                  {poseData.faceDetected ? poseData.headDirection : 'N/A'}
                </div>
              </div>
              
              <div className="bg-gray-50/40 border border-gray-200 rounded-lg p-2.5 text-center">
                <div className="text-[9px] text-gray-600 font-semibold uppercase font-bold tracking-wider">Stability Deviation</div>
                <div className="text-xs font-bold font-mono text-black font-bold mt-1">
                  {poseData.faceDetected ? `${poseData.headStabilityValue.toFixed(1)}°` : '0°'}
                </div>
              </div>

              <div className="bg-gray-50/40 border border-gray-200 rounded-lg p-2.5 text-center">
                <div className="text-[9px] text-gray-600 font-semibold uppercase font-bold tracking-wider">Movements / min</div>
                <div className="text-xs font-bold font-mono text-black font-bold mt-1">
                  {poseData.faceDetected ? poseData.movementFrequency : '0'}
                </div>
              </div>

              <div className="bg-gray-50/40 border border-gray-200 rounded-lg p-2.5 text-center">
                <div className="text-[9px] text-gray-600 font-semibold uppercase font-bold tracking-wider">Pipeline FPS</div>
                <div className="text-xs font-bold font-mono text-black font-bold mt-1">
                  {isActive ? poseData.fps : 0}
                </div>
              </div>

              <div className="bg-gray-50/40 border border-gray-200 rounded-lg p-2.5 text-center">
                <div className="text-[9px] text-gray-600 font-semibold uppercase font-bold tracking-wider">Latency</div>
                <div className="text-xs font-bold font-mono text-black font-bold mt-1">
                  {poseData.faceDetected ? `${poseData.processingTimeMs}ms` : '0ms'}
                </div>
              </div>

              <div className="bg-gray-50/40 border border-gray-200 rounded-lg p-2.5 flex items-center justify-center">
                <span className="text-[10px] text-gray-600 font-semibold flex items-center gap-1.5">
                  <ShieldAlert size={12} /> Proctor OK
                </span>
              </div>
            </div>
          </div>

        </motion.div>
      </div>
    </motion.div>
  );
}
