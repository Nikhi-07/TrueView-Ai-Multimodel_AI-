import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Square, Sparkles, AlertCircle, Activity, Boxes,
  ShieldCheck, AlertTriangle, Monitor, Smartphone, BookOpen, UserCheck, Laptop
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../components/Cards/PageHeader';
import StatusBadge from '../components/Cards/StatusBadge';
import useCamera from '../hooks/useCamera';

export default function ObjectDetectionViewer() {
  const { videoRef, isActive, error, startCamera, stopCamera, captureFrameBase64 } = useCamera();

  // YOLO detection and tracking states
  const [detectorData, setDetectorData] = useState({
    objectsDetected: 0,
    detections: [],
    summary: {
      person_count: 0,
      validating_person_count: 0,
      person_status: 'no_person',
      phone_status: 'CLEAN',
      phone_detected: false,
      laptop_status: 'CLEAN',
      laptop_detected: false,
      book_status: 'CLEAN',
      book_detected: false,
      monitor_detected: false,
      prohibited_items_count: 0,
      prohibited_items_list: []
    },
    processingTimeMs: 0,
    fps: 0
  });

  const canvasRef = useRef(null);
  const loopRef = useRef(null);
  const isProcessingRef = useRef(false);
  const lastSentTimeRef = useRef(0);
  const fpsTimestampsRef = useRef([]);
  const activeSessionId = useRef(`object_session_${Date.now()}`);
  const lastLoggedStateRef = useRef('');

  // Vector overlay renderer: Draws bounding boxes directly over native video
  const drawVectorOverlay = useCallback((detections, summary) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const displayW = video.clientWidth;
    const displayH = video.clientHeight;

    if (canvas.width !== displayW || canvas.height !== displayH) {
      canvas.width = displayW;
      canvas.height = displayH;
    }

    ctx.clearRect(0, 0, displayW, displayH);

    // Assume capture coordinate frame (standard 640x480 or native video resolution)
    const nativeW = video.videoWidth || 640;
    const nativeH = video.videoHeight || 480;
    const scaleX = displayW / nativeW;
    const scaleY = displayH / nativeH;

    detections.forEach(det => {
      const [bx1, by1, bx2, by2] = det.box;
      const x1 = bx1 * scaleX;
      const y1 = by1 * scaleY;
      const w = (bx2 - bx1) * scaleX;
      const h = (by2 - by1) * scaleY;

      const isConfirmed = det.confirmed;
      const label = det.label;
      const eventType = det.type || label.toUpperCase();
      const trackId = det.track_id;
      const conf = Math.round(det.confidence * 100);

      // Determine palette
      let strokeColor = '#94a3b8';
      let fillColor = 'rgba(148, 163, 184, 0.15)';
      let labelText = `${label.toUpperCase()} #${trackId} ${conf}%`;

      if (eventType === 'CANDIDATE') {
        strokeColor = '#10b981'; // Emerald
        fillColor = 'rgba(16, 185, 129, 0.12)';
        labelText = `CANDIDATE #${trackId} ${conf}% [VERIFIED]`;
      } else if (eventType === 'MULTIPLE_PEOPLE') {
        if (isConfirmed) {
          strokeColor = '#ef4444'; // Red
          fillColor = 'rgba(239, 68, 68, 0.20)';
          labelText = `MULTIPLE PEOPLE #${trackId} ${conf}% [VERIFIED]`;
        } else {
          strokeColor = '#f59e0b'; // Amber
          fillColor = 'rgba(245, 158, 11, 0.15)';
          labelText = `ADDITIONAL PERSON #${trackId} ${conf}% (Validating)`;
        }
      } else if (label === 'phone') {
        if (isConfirmed) {
          strokeColor = '#ef4444'; // Red
          fillColor = 'rgba(239, 68, 68, 0.25)';
          labelText = `PHONE #${trackId} ${conf}% [VERIFIED]`;
        } else {
          strokeColor = '#f59e0b'; // Amber
          fillColor = 'rgba(245, 158, 11, 0.15)';
          labelText = `PHONE #${trackId} ${conf}% (Validating)`;
        }
      } else if (label === 'remote') {
        strokeColor = '#64748b'; // Slate gray
        fillColor = 'rgba(100, 116, 139, 0.15)';
        labelText = `REMOTE #${trackId} ${conf}% (Neutral)`;
      } else if (label === 'laptop') {
        strokeColor = isConfirmed ? '#f97316' : '#94a3b8';
        fillColor = isConfirmed ? 'rgba(249, 115, 22, 0.2)' : 'rgba(148, 163, 184, 0.1)';
        labelText = `LAPTOP #${trackId} ${conf}% ${isConfirmed ? '[VERIFIED]' : '(Validating)'}`;
      } else if (label === 'book') {
        strokeColor = isConfirmed ? '#eab308' : '#94a3b8';
        fillColor = isConfirmed ? 'rgba(234, 179, 8, 0.2)' : 'rgba(148, 163, 184, 0.1)';
        labelText = `BOOK/DOC #${trackId} ${conf}% ${isConfirmed ? '[VERIFIED]' : '(Validating)'}`;
      }

      // Draw bounding box
      ctx.save();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.roundRect(x1, y1, w, h, 6);
      ctx.fill();
      ctx.stroke();

      // Draw text badge
      ctx.font = 'bold 11px Inter, sans-serif';
      const textWidth = ctx.measureText(labelText).width;
      const badgeH = 20;
      const badgeW = textWidth + 14;
      const badgeY = Math.max(0, y1 - badgeH - 3);

      ctx.fillStyle = strokeColor;
      ctx.beginPath();
      ctx.roundRect(x1, badgeY, badgeW, badgeH, 4);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, x1 + 7, badgeY + 14);
      ctx.restore();
    });
  }, [videoRef]);

  const toggleCamera = () => {
    if (isActive) {
      stopCamera();
      isProcessingRef.current = false;
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      setDetectorData(prev => ({
        ...prev,
        objectsDetected: 0,
        detections: [],
        summary: {
          person_count: 0,
          validating_person_count: 0,
          person_status: 'no_person',
          phone_status: 'CLEAN',
          phone_detected: false,
          laptop_status: 'CLEAN',
          laptop_detected: false,
          book_status: 'CLEAN',
          book_detected: false,
          monitor_detected: false,
          prohibited_items_count: 0,
          prohibited_items_list: []
        },
        fps: 0
      }));
    } else {
      activeSessionId.current = `object_session_${Date.now()}`;
      fpsTimestampsRef.current = [];
      isProcessingRef.current = false;
      lastSentTimeRef.current = 0;
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
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      })
      .catch(() => {});
  };

  // Continuous, non-blocking frame processing loop
  useEffect(() => {
    let active = true;

    const processLoop = () => {
      if (!isActive || !active) return;

      // Keep native video stream & requestAnimationFrame running uninterrupted
      loopRef.current = requestAnimationFrame(processLoop);

      const now = performance.now();

      // Adaptive throttle: Target 12-15 AI FPS (~65ms interval) with in-flight guard
      if (isProcessingRef.current || (now - lastSentTimeRef.current < 65)) {
        return;
      }

      const frame = captureFrameBase64();
      if (!frame) return;

      isProcessingRef.current = true;
      lastSentTimeRef.current = now;

      // Calculate processing FPS
      const wallNow = Date.now();
      fpsTimestampsRef.current.push(wallNow);
      fpsTimestampsRef.current = fpsTimestampsRef.current.filter(t => wallNow - t <= 1000);
      const currentFps = fpsTimestampsRef.current.length;

      fetch('/ai-api/object-detection/process-object-detection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: frame, draw_overlay: false })
      })
        .then(res => res.json())
        .then(result => {
          if (!active) return;

          if (result && !result.error) {
            const summary = result.summary || {};
            setDetectorData(prev => ({
              ...prev,
              objectsDetected: result.objects_detected || 0,
              detections: result.detections || [],
              summary: {
                person_count: summary.person_count ?? 0,
                validating_person_count: summary.validating_person_count ?? 0,
                person_status: summary.person_status ?? 'no_person',
                phone_status: summary.phone_status ?? 'CLEAN',
                phone_detected: summary.phone_detected ?? false,
                laptop_status: summary.laptop_status ?? 'CLEAN',
                laptop_detected: summary.laptop_detected ?? false,
                book_status: summary.book_status ?? 'CLEAN',
                book_detected: summary.book_detected ?? false,
                monitor_detected: summary.monitor_detected ?? false,
                prohibited_items_count: summary.prohibited_items_count ?? 0,
                prohibited_items_list: summary.prohibited_items_list ?? []
              },
              processingTimeMs: result.processing_time_ms || 0,
              fps: currentFps
            }));

            // Draw crisp vector overlay on canvas
            drawVectorOverlay(result.detections || [], summary);

            // Log state change events to backend Node.js server
            const currentStateKey = `${summary.person_count}_${summary.phone_status}_${summary.prohibited_items_count}`;
            if (currentStateKey !== lastLoggedStateRef.current) {
              lastLoggedStateRef.current = currentStateKey;
              fetch('/api/object-detection/log', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${localStorage.getItem('trueview_token')}`
                },
                body: JSON.stringify({
                  sessionId: activeSessionId.current,
                  objectsDetected: result.objects_detected,
                  personCount: summary.person_count,
                  personStatus: summary.person_status,
                  phoneDetected: summary.phone_detected,
                  laptopDetected: summary.laptop_detected,
                  bookDetected: summary.book_detected,
                  prohibitedItemsCount: summary.prohibited_items_count,
                  prohibitedItemsList: summary.prohibited_items_list,
                  processingTimeMs: result.processing_time_ms
                })
              }).catch(() => {});
            }
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
  }, [isActive, captureFrameBase64, drawVectorOverlay]);

  // Clean up on unmount
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const personStatusVariants = {
    no_person: 'warning',
    single_person: 'success',
    multiple_persons: 'danger'
  };

  const personStatusLabels = {
    no_person: 'NO CANDIDATE',
    single_person: 'OK - 1 PERSON',
    multiple_persons: 'MULTIPLE PEOPLE'
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
                className="py-2 px-4 rounded-xl text-xs font-semibold bg-gray-50 hover:bg-gray-100 text-black font-bold border border-gray-200 transition-all"
              >
                Reset Tracker
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
              {isActive ? 'Stop Monitoring' : 'Start Workspace Scan'}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        
        {/* ══════════ Left Side: Smooth Bounding Box Viewer ══════════ */}
        <motion.div variants={item} className="lg:col-span-8 flex flex-col h-[500px] lg:h-auto">
          <div className="bg-black border border-gray-200 shadow-sm flex-1 relative rounded-2xl overflow-hidden h-full flex items-center justify-center">
            
            {/* Native 60 FPS smooth video feed */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${isActive ? '' : 'hidden'}`}
            />
            {/* Transparent Canvas overlay for vector bounding boxes */}
            <canvas
              ref={canvasRef}
              className={`absolute inset-0 w-full h-full object-cover pointer-events-none ${isActive ? '' : 'hidden'}`}
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
              <div className="text-center text-gray-400 font-semibold p-8 flex flex-col items-center">
                <Boxes size={64} className="mb-4 text-gray-500 animate-pulse" />
                <h3 className="text-lg font-medium text-gray-200">Environment Scan Off</h3>
                <p className="text-xs text-gray-400 max-w-xs mt-1">
                  Start the workspace scan to initiate real-time YOLOv11 boundary tracking.
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

        {/* ══════════ Right Side: Workspace Status & Object List ══════════ */}
        <motion.div variants={item} className="lg:col-span-4 space-y-4 overflow-y-auto pr-1">
          
          {/* Workspace Status Summary */}
          <div className="bg-white border border-gray-200 shadow-sm p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-primary-500" />
                <h3 className="text-sm font-bold text-black">Workspace Status</h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500 font-bold uppercase">
                {detectorData.summary.prohibited_items_count > 0 ? 'ALERT' : 'NORMAL'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
              
              {/* Candidate Box */}
              <div className={`p-3 rounded-xl border transition-all ${
                detectorData.summary.person_status === 'single_person'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-600'
              }`}>
                <UserCheck size={18} className="mx-auto mb-1.5" />
                <div className="font-bold">Candidate</div>
                <div className="text-xs font-extrabold mt-0.5">
                  {detectorData.summary.person_count}
                </div>
                {detectorData.summary.validating_person_count > 0 && (
                  <span className="text-[9px] bg-amber-500/20 text-amber-700 px-1 py-0.5 rounded mt-1 inline-block">
                    +{detectorData.summary.validating_person_count} Validating
                  </span>
                )}
              </div>

              {/* Mobile Phone Box */}
              <div className={`p-3 rounded-xl border transition-all ${
                detectorData.summary.phone_status === 'DETECTED'
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-600 animate-pulse'
                  : detectorData.summary.phone_status === 'VALIDATING'
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-700'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
              }`}>
                <Smartphone size={18} className="mx-auto mb-1.5" />
                <div className="font-bold">Mobile Phone</div>
                <div className="text-xs font-extrabold mt-0.5">
                  {detectorData.summary.phone_status === 'DETECTED' && '⚠️ DETECTED'}
                  {detectorData.summary.phone_status === 'VALIDATING' && 'VALIDATING'}
                  {detectorData.summary.phone_status === 'CLEAN' && 'CLEAN'}
                </div>
              </div>

              {/* Books / Docs Box */}
              <div className={`p-3 rounded-xl border transition-all ${
                detectorData.summary.book_status === 'DETECTED'
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-600'
                  : detectorData.summary.book_status === 'VALIDATING'
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-700'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
              }`}>
                <BookOpen size={18} className="mx-auto mb-1.5" />
                <div className="font-bold">Books/Docs</div>
                <div className="text-xs font-extrabold mt-0.5">
                  {detectorData.summary.book_status === 'DETECTED' && '⚠️ DETECTED'}
                  {detectorData.summary.book_status === 'VALIDATING' && 'VALIDATING'}
                  {detectorData.summary.book_status === 'CLEAN' && 'CLEAN'}
                </div>
              </div>

            </div>

            <AnimatePresence>
              {(detectorData.summary.phone_status === 'DETECTED' || detectorData.summary.person_status !== 'single_person') && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-rose-500/10 border border-rose-500/25 text-rose-600 rounded-lg p-3 text-xs flex items-center gap-2"
                >
                  <AlertTriangle size={15} className="flex-shrink-0 animate-bounce text-rose-600" />
                  <div className="space-y-0.5">
                    {detectorData.summary.phone_status === 'DETECTED' && <div>• Mobile device confirmed inside candidate workspace!</div>}
                    {detectorData.summary.person_status === 'no_person' && <div>• Warning: No candidate detected in front of screen!</div>}
                    {detectorData.summary.person_status === 'multiple_persons' && <div>• Critical: Multiple people detected inside workspace!</div>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Active Objects List & Temporal Validation Table */}
          <div className="bg-white border border-gray-200 shadow-sm p-5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Boxes size={16} className="text-primary-500" />
                <h3 className="text-sm font-bold text-black">Tracked Items List</h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold">Temporal Engine</span>
            </div>

            {detectorData.detections.length > 0 ? (
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {detectorData.detections.map((det, index) => (
                  <div key={index} className="bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs space-y-1.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-extrabold text-slate-900 capitalize flex items-center gap-1.5">
                        <span>{det.label}</span>
                        <span className="text-primary-600 font-mono text-[11px]">#{det.track_id ?? 'N/A'}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                        det.confirmed
                          ? det.is_prohibited
                            ? 'bg-rose-500/15 text-rose-700 border-rose-500/30'
                            : 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-700 border-amber-500/30'
                      }`}>
                        {det.confirmed ? 'CONFIRMED' : 'VALIDATING'}
                      </span>
                    </div>

                    {/* Metrics Matrix: Class / Category, Confidence %, Tracking ms, Confirmed */}
                    <div className="grid grid-cols-4 gap-1 pt-1.5 border-t border-gray-200 text-[10px] font-mono">
                      <div>
                        <span className="text-gray-500 block text-[9px] uppercase">Type</span>
                        <span className="font-bold text-slate-800 uppercase truncate block">
                          {det.type || det.category || det.label}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-[9px] uppercase">Confidence</span>
                        <span className="font-bold text-slate-800 block">
                          {(det.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-[9px] uppercase">Tracking</span>
                        <span className="font-bold text-slate-800 block">
                          {det.tracking_duration_ms ?? 0} ms
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-[9px] uppercase">Confirmed</span>
                        <span className={`font-bold block ${det.confirmed ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {det.confirmed ? 'YES' : 'NO'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-6 text-xs font-medium">
                No active objects tracked in frame.
              </div>
            )}
          </div>

          {/* Pipeline Speed & Performance Stats */}
          <div className="bg-white border border-gray-200 shadow-sm p-5 rounded-2xl space-y-3">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-primary-500" />
              <h3 className="text-sm font-bold text-black">Processing Stats</h3>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-gray-50 rounded-lg p-2.5 text-center border border-gray-100">
                <div className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Inference Speed</div>
                <div className="text-lg font-bold font-mono text-black mt-1">
                  {detectorData.processingTimeMs} ms
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-2.5 text-center border border-gray-100">
                <div className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Processing FPS</div>
                <div className="text-lg font-bold font-mono text-black mt-1">
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

