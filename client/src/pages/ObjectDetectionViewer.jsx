import { useState, useEffect, useRef } from 'react';
import {
  Play, Square, Sparkles, AlertCircle, Activity, Boxes,
  ShieldCheck, AlertTriangle, Monitor, Smartphone, BookOpen, UserCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../components/Cards/PageHeader';
import StatusBadge from '../components/Cards/StatusBadge';
import ProgressBar from '../components/Charts/ProgressBar';
import useCamera from '../hooks/useCamera';

export default function ObjectDetectionViewer() {
  const { videoRef, isActive, error, startCamera, stopCamera, captureFrameBase64 } = useCamera();

  // YOLO detection and tracking states
  const [detectorData, setDetectorData] = useState({
    objectsDetected: 0,
    detections: [],
    summary: {
      personCount: 0,
      personStatus: 'no_person',
      phoneDetected: false,
      laptopDetected: false,
      bookDetected: false,
      monitorDetected: false,
      prohibitedItemsCount: 0,
      prohibitedItemsList: []
    },
    processingTimeMs: 0,
    fps: 0
  });

  const canvasRef = useRef(null);
  const loopRef = useRef(null);
  const framesProcessed = useRef(0);
  const lastFpsTime = useRef(Date.now());
  const activeSessionId = useRef(`object_session_${Date.now()}`);

  const toggleCamera = () => {
    if (isActive) {
      stopCamera();
      setDetectorData(prev => ({
        ...prev,
        objectsDetected: 0,
        detections: [],
        summary: {
          personCount: 0,
          personStatus: 'no_person',
          phoneDetected: false,
          laptopDetected: false,
          bookDetected: false,
          monitorDetected: false,
          prohibitedItemsCount: 0,
          prohibitedItemsList: []
        },
        fps: 0
      }));
    } else {
      activeSessionId.current = `object_session_${Date.now()}`;
      // Reset AI tracking history
      fetch('/ai-api/object-detection/reset-object-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: activeSessionId.current })
      }).catch(() => {});
      startCamera();
    }
  };

  const handleResetSession = () => {
    fetch('/ai-api/object-detection/reset-object-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: activeSessionId.current })
    })
      .then(() => {
        setDetectorData(prev => ({
          ...prev,
          detections: []
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
        setDetectorData(prev => ({ ...prev, fps: framesProcessed.current }));
        framesProcessed.current = 0;
        lastFpsTime.current = now;
      }

      try {
        const res = await fetch('/ai-api/object-detection/process-object-detection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: frame, draw_overlay: true })
        });

        const result = await res.json();

        if (active && res.ok) {
          setDetectorData(prev => ({
            ...prev,
            objectsDetected: result.objects_detected || 0,
            detections: result.detections || [],
            summary: result.summary || prev.summary,
            processingTimeMs: result.processing_time_ms || 0
          }));

          // Render response image to canvas
          if (result.objects_detected > -1 && result.annotated_image) {
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

          // Log metrics to backend Node.js server
          fetch('/api/object-detection/log', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('trueview_token')}`
            },
            body: JSON.stringify({
              sessionId: activeSessionId.current,
              objectsDetected: result.objects_detected,
              personCount: result.summary.person_count,
              personStatus: result.summary.person_status,
              phoneDetected: result.summary.phone_detected,
              laptopDetected: result.summary.laptop_detected,
              bookDetected: result.summary.book_detected,
              prohibitedItemsCount: result.summary.prohibited_items_count,
              prohibitedItemsList: result.summary.prohibited_items_list,
              processingTimeMs: result.processing_time_ms
            })
          }).catch(() => {});
        }
      } catch (e) {
        // silent fail
      }

      // Throttle to hit target 20-25 FPS
      setTimeout(() => {
        if (isActive && active) {
          loopRef.current = requestAnimationFrame(processLoop);
        }
      }, 40);
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

  // Visual variants mapping
  const personStatusVariants = {
    no_person: 'warning',
    single_person: 'success',
    multiple_persons: 'danger'
  };

  const personStatusLabels = {
    no_person: 'NO PERSON',
    single_person: 'OK - 1 PERSON',
    multiple_persons: 'MUTIPLE PEOPLE'
  };

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const item = { hidden: { opacity: 0, scale: 0.95 }, show: { opacity: 1, scale: 1 } };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="h-full flex flex-col gap-6">
      <PageHeader
        title="Object Detection & Tracking"
        subtitle="Real-time YOLOv11 environment mapping, mobile device scans, and candidate verification"
        breadcrumb={['TrueView AI', 'Workspace Detection']}
        actions={
          <div className="flex gap-2">
            {isActive && (
              <button
                onClick={handleResetSession}
                className="py-2 px-4 rounded-xl text-xs font-semibold bg-surface-800 hover:bg-surface-700 text-gray-200 border border-white/[0.06] transition-all"
              >
                Reset Tracker
              </button>
            )}
            <button
              onClick={toggleCamera}
              className={`py-2 px-4 rounded-xl font-medium flex items-center gap-2 transition-all ${
                isActive
                  ? 'bg-danger-500/25 hover:bg-danger-500/35 text-danger-400 border border-danger-500/30'
                  : 'bg-primary-500 hover:bg-primary-600 text-white'
              }`}
            >
              {isActive ? <Square size={16} /> : <Play size={16} />}
              {isActive ? 'Stop Monitoring' : 'Start Workspace Scan'}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        
        {/* ══════════ Left Side: Bounding Box Viewer ══════════ */}
        <motion.div variants={item} className="lg:col-span-8 flex flex-col h-[500px] lg:h-auto">
          <div className="glass flex-1 relative rounded-2xl overflow-hidden border-white/[0.1] h-full bg-black flex items-center justify-center">
            
            {/* Hidden raw video feed */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover opacity-30 ${isActive ? '' : 'hidden'}`}
            />
            {/* Canvas for YOLO bounding boxes overlay */}
            <canvas
              ref={canvasRef}
              className={`absolute inset-0 w-full h-full object-cover ${isActive ? '' : 'hidden'}`}
            />

            {isActive ? (
              <div className="absolute top-4 left-4 flex gap-2">
                <span className="bg-primary-500/20 backdrop-blur-md border border-primary-500/30 text-primary-400 text-xs font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5 animate-pulse">
                  <Sparkles size={12} /> YOLOv11 ACTIVE
                </span>
                <StatusBadge
                  label={personStatusLabels[detectorData.summary.person_status] || 'N/A'}
                  variant={personStatusVariants[detectorData.summary.person_status] || 'neutral'}
                  dot
                />
              </div>
            ) : (
              <div className="text-center text-surface-600 p-8 flex flex-col items-center">
                <Boxes size={64} className="mb-4 text-surface-700 animate-pulse" />
                <h3 className="text-lg font-medium text-gray-400">Environment Scan Off</h3>
                <p className="text-xs text-gray-500 max-w-xs mt-1">
                  Start the workspace scan to initiate YOLOv11 boundary tracking.
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

        {/* ══════════ Right Side: Proctor Stats & Object List ══════════ */}
        <motion.div variants={item} className="lg:col-span-4 space-y-4 overflow-y-auto pr-1">
          
          {/* Proctor Flags Summary */}
          <div className="glass p-5 rounded-2xl bg-gradient-to-br from-surface-900 to-surface-800 border-white/[0.08] space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-primary-400" />
              <h3 className="text-sm font-bold text-gray-200">Workspace Status</h3>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
              
              {/* Person Box */}
              <div className={`p-3 rounded-xl border ${
                detectorData.summary.person_status === 'single_person'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-danger-500/10 border-danger-500/20 text-danger-400'
              }`}>
                <UserCheck size={18} className="mx-auto mb-1.5" />
                <div className="font-bold">Candidate</div>
                <div className="text-xs font-extrabold mt-0.5">
                  {detectorData.summary.person_count}
                </div>
              </div>

              {/* Phone Box */}
              <div className={`p-3 rounded-xl border ${
                detectorData.summary.phone_detected
                  ? 'bg-danger-500/15 border-danger-500/30 text-danger-400'
                  : 'bg-surface-850 border-white/[0.04] text-gray-400'
              }`}>
                <Smartphone size={18} className="mx-auto mb-1.5" />
                <div className="font-bold">Mobile Phone</div>
                <div className="text-xs font-extrabold mt-0.5">
                  {detectorData.summary.phone_detected ? '⚠️ DETECTED' : 'CLEAN'}
                </div>
              </div>

              {/* Book Box */}
              <div className={`p-3 rounded-xl border ${
                detectorData.summary.book_detected
                  ? 'bg-warning-500/15 border-warning-500/30 text-warning-400'
                  : 'bg-surface-850 border-white/[0.04] text-gray-400'
              }`}>
                <BookOpen size={18} className="mx-auto mb-1.5" />
                <div className="font-bold">Books/Docs</div>
                <div className="text-xs font-extrabold mt-0.5">
                  {detectorData.summary.book_detected ? '⚠️ DETECTED' : 'CLEAN'}
                </div>
              </div>

            </div>

            <AnimatePresence>
              {(detectorData.summary.phone_detected || detectorData.summary.person_status !== 'single_person') && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-danger-500/10 border border-danger-500/20 text-danger-400 rounded-lg p-3 text-xs flex items-center gap-2"
                >
                  <AlertTriangle size={14} className="flex-shrink-0 animate-bounce" />
                  <div>
                    {detectorData.summary.phone_detected && <div>• Mobile device detected inside camera workspace!</div>}
                    {detectorData.summary.person_status === 'no_person' && <div>• Warning: No candidate detected in front of screen!</div>}
                    {detectorData.summary.person_status === 'multiple_persons' && <div>• Warning: Multiple faces detected inside proctor environment!</div>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Active Objects List */}
          <div className="glass p-5 rounded-2xl space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Boxes size={16} className="text-primary-400" />
              <h3 className="text-sm font-bold text-gray-200">Tracked Items List</h3>
            </div>

            {detectorData.detections.length > 0 ? (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {detectorData.detections.map((det, index) => (
                  <div key={index} className="bg-surface-800/40 border border-white/[0.03] rounded-lg p-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-gray-200 capitalize">
                        {det.label} <span className="text-primary-400 font-mono">#{det.track_id ?? 'N/A'}</span>
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        Duration: {det.duration_seconds ?? 0}s | Motion: {det.total_movement_px ? Math.round(det.total_movement_px) : 0}px
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <span className="bg-primary-500/15 text-primary-400 border border-primary-500/20 rounded px-1.5 py-0.5 font-mono font-bold">
                        {(det.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-6 text-xs">
                No active objects tracked in frame.
              </div>
            )}
          </div>

          {/* Pipeline Stats */}
          <div className="glass p-5 rounded-2xl space-y-3">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-primary-400" />
              <h3 className="text-sm font-bold text-gray-200">Processing Stats</h3>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-surface-800/40 rounded-lg p-2.5 text-center">
                <div className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Inference Speed</div>
                <div className="text-lg font-bold font-mono text-gray-200 mt-1">
                  {detectorData.processingTimeMs}ms
                </div>
              </div>
              
              <div className="bg-surface-800/40 rounded-lg p-2.5 text-center">
                <div className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Frames/sec (FPS)</div>
                <div className="text-lg font-bold font-mono text-gray-200 mt-1">
                  {isActive ? detectorData.fps : 0}
                </div>
              </div>
            </div>
          </div>

        </motion.div>
      </div>
    </motion.div>
  );
}
