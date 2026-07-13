import { useState, useEffect, useRef, useCallback } from 'react';
import { Shield, Settings, Activity, Cpu, ToggleLeft, ToggleRight, Sparkles, AlertCircle, Play, Square } from 'lucide-react';
import { motion } from 'framer-motion';
import PageHeader from '../components/Cards/PageHeader';
import StatusBadge from '../components/Cards/StatusBadge';
import MetricGauge from '../components/Charts/MetricGauge';
import useCamera from '../hooks/useCamera';

export default function FaceMeshViewer() {
  const { videoRef, isActive, error, startCamera, stopCamera, captureFrameBase64 } = useCamera();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showMesh, setShowMesh] = useState(true);
  const [showDots, setShowDots] = useState(true);
  
  // Analytics
  const [meshData, setMeshData] = useState({
    faceDetected: false,
    confidence: 0,
    landmarkCount: 0,
    processingTimeMs: 0,
    fps: 0
  });

  const canvasRef = useRef(null);
  const loopRef = useRef(null);
  const framesProcessed = useRef(0);
  const lastFpsTime = useRef(Date.now());
  const activeSessionId = useRef(`mesh_session_${Date.now()}`);

  const toggleCamera = () => {
    if (isActive) {
      stopCamera();
      setMeshData({
        faceDetected: false,
        confidence: 0,
        landmarkCount: 0,
        processingTimeMs: 0,
        fps: 0
      });
    } else {
      activeSessionId.current = `mesh_session_${Date.now()}`;
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
        setMeshData(prev => ({ ...prev, fps: framesProcessed.current }));
        framesProcessed.current = 0;
        lastFpsTime.current = now;
      }

      try {
        const res = await fetch('/ai-api/face-mesh/process-face-mesh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: frame,
            show_mesh: showMesh,
            show_dots: showDots
          })
        });

        const result = await res.json();
        
        if (active && res.ok) {
          setMeshData(prev => ({
            ...prev,
            faceDetected: result.face_detected,
            confidence: (result.confidence || 0) * 100,
            landmarkCount: result.landmark_count || 0,
            processingTimeMs: result.processing_time_ms || 0
          }));

          // Render response image (with overlay drawn by backend) or draw locally.
          // Since the server returns an annotated base64 image, we render that to the canvas.
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
            // If no face, clear canvas
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (canvas && ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
          }

          // Optional: Log metrics to backend Node.js server
          if (result.face_detected) {
            fetch('/api/face-mesh/log', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
              },
              body: JSON.stringify({
                sessionId: activeSessionId.current,
                landmarkCount: result.landmark_count,
                processingTimeMs: result.processing_time_ms
              })
            }).catch(() => {});
          }
        }
      } catch (e) {
        // silent fail
      }

      // Control rate of requests to hit target 20-30 FPS without choking connection
      setTimeout(() => {
        if (isActive && active) {
          loopRef.current = requestAnimationFrame(processLoop);
        }
      }, 33); // max 30 FPS
    };

    if (isActive) {
      loopRef.current = requestAnimationFrame(processLoop);
    }

    return () => {
      active = false;
      if (loopRef.current) cancelAnimationFrame(loopRef.current);
    };
  }, [isActive, showMesh, showDots, captureFrameBase64]);

  // Clean up stream on unmount
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } };
  const item = { hidden: { opacity: 0, scale: 0.95 }, show: { opacity: 1, scale: 1 } };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="h-full flex flex-col gap-6">
      <PageHeader
        title="Face Mesh & Landmarks"
        subtitle="Extract 3D facial topology & geometric keypoints in real-time"
        breadcrumb={['TrueView AI', 'Face Mesh']}
        actions={
          <button 
            onClick={toggleCamera}
            className={`py-2 px-4 rounded-xl font-medium flex items-center gap-2 transition-all ${
              isActive ? 'bg-danger-500/25 hover:bg-danger-500/35 text-danger-400 border border-danger-500/30' : 'bg-primary-500 hover:bg-primary-600 text-white'
            }`}
          >
            {isActive ? <Square size={16}/> : <Play size={16}/>}
            {isActive ? 'Stop Stream' : 'Start Mesh Stream'}
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Left Side: Stream Viewer */}
        <motion.div variants={item} className="lg:col-span-8 flex flex-col h-[500px] lg:h-auto">
          <div className="glass flex-1 relative rounded-2xl overflow-hidden border-white/[0.1] h-full bg-black flex items-center justify-center">
            {/* Hidden raw video element used for capturing frames */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover opacity-30 ${isActive ? '' : 'hidden'}`}
            />
            {/* Canvas where annotated face mesh is rendered */}
            <canvas
              ref={canvasRef}
              className={`absolute inset-0 w-full h-full object-cover ${isActive ? '' : 'hidden'}`}
            />
            
            {isActive ? (
              <>
                {/* Visual Indicators */}
                <div className="absolute top-4 left-4 flex gap-2">
                  <span className="bg-primary-500/20 backdrop-blur-md border border-primary-500/30 text-primary-400 text-xs font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5 animate-pulse">
                    <Sparkles size={12} /> REAL-TIME MESH
                  </span>
                </div>
              </>
            ) : (
              <div className="text-center text-surface-600 p-8 flex flex-col items-center">
                <Shield size={64} className="mb-4 text-surface-700" />
                <h3 className="text-lg font-medium text-gray-400">Stream Inactive</h3>
                <p className="text-xs text-gray-500 max-w-xs mt-1">Start the mesh stream to visualize the AI facial landmark engine.</p>
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

        {/* Right Side: Control Panel & Metrics */}
        <motion.div variants={item} className="lg:col-span-4 space-y-6">
          {/* Settings / Controls */}
          <div className="glass p-5 rounded-2xl space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Settings size={16} className="text-primary-400" />
              <h3 className="text-sm font-bold text-gray-200">Mesh Configuration</h3>
            </div>
            
            <div className="flex items-center justify-between py-2 border-b border-white/[0.06]">
              <div>
                <div className="text-sm font-semibold text-gray-200">Show Mesh Edges</div>
                <div className="text-[10px] text-gray-500">Render structural wireframe lines</div>
              </div>
              <button 
                onClick={() => setShowMesh(!showMesh)}
                className={`transition-colors ${showMesh ? 'text-primary-400' : 'text-gray-600'}`}
              >
                {showMesh ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
              </button>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-semibold text-gray-200">Highlight Landmarks</div>
                <div className="text-[10px] text-gray-500">Render individual keypoint coordinates</div>
              </div>
              <button 
                onClick={() => setShowDots(!showDots)}
                className={`transition-colors ${showDots ? 'text-primary-400' : 'text-gray-600'}`}
              >
                {showDots ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
              </button>
            </div>
          </div>

          {/* Real-time Analytics Gauges */}
          <div className="glass p-5 rounded-2xl bg-gradient-to-br from-surface-900 to-surface-800 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-200">Detection Metrics</h3>
              <Activity size={16} className="text-primary-400" />
            </div>

            <div className="flex justify-center py-2">
              <MetricGauge 
                value={meshData.faceDetected ? Math.round(meshData.confidence) : 0} 
                max={100} 
                size={120} 
                strokeWidth={8} 
                label={meshData.faceDetected ? "Face Detected" : "No Face"} 
              />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/[0.06]">
              <div className="text-center">
                <div className="text-[10px] text-gray-500 uppercase font-mono">Landmarks</div>
                <div className="text-xl font-bold font-mono text-gray-200 mt-1">
                  {meshData.faceDetected ? meshData.landmarkCount : 0}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-gray-500 uppercase font-mono">Latency</div>
                <div className="text-xl font-bold font-mono text-gray-200 mt-1">
                  {meshData.faceDetected ? `${meshData.processingTimeMs}ms` : '0ms'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/[0.06]">
              <div className="text-center">
                <div className="text-[10px] text-gray-500 uppercase font-mono">Pipeline FPS</div>
                <div className="text-xl font-bold font-mono text-gray-200 mt-1">
                  {isActive ? meshData.fps : 0}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-gray-500 uppercase font-mono">Status</div>
                <div className="mt-1 flex items-center justify-center">
                  <StatusBadge 
                    label={meshData.faceDetected ? "REAL" : "N/A"} 
                    variant={meshData.faceDetected ? "success" : "default"} 
                  />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
