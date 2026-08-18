import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Camera, CameraOff, AlertCircle, RefreshCw } from 'lucide-react';

const CameraFeed = forwardRef(function CameraFeed({ onDetectionUpdate, isActive: isMonitoringActive }, ref) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const requestRef = useRef(null);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [error, setError] = useState(null);
  const [fps, setFps] = useState(0);
  const framesProcessed = useRef(0);
  const lastFpsTime = useRef(Date.now());

  // Capture a frame as base64 JPEG
  const captureFrameBase64 = useCallback(() => {
    const video = videoRef.current;
    if (!video || !isCameraActive || video.videoWidth === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  }, [isCameraActive]);

  // Expose captureFrameBase64 and active MediaStream to parent via ref
  useImperativeHandle(ref, () => ({
    captureFrameBase64,
    getStream: () => streamRef.current
  }), [captureFrameBase64]);

  // Start camera
  const startCamera = useCallback(async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setError(null);
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280, max: 1920 }, 
          height: { ideal: 720, max: 1080 },
          facingMode: 'user'
        },
        audio: false
      });
      streamRef.current = newStream;
      setIsCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
    } catch (err) {
      console.error("[CameraFeed] MediaDevices error:", err);
      setError(err.message || 'Camera permission denied or camera device unavailable.');
      setIsCameraActive(false);
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Attach stream to video element whenever active
  useEffect(() => {
    if (isCameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [isCameraActive]);

  // Auto-start camera preview on mount
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // Handle monitoring active status changes
  useEffect(() => {
    if (isMonitoringActive && !isCameraActive) {
      startCamera();
    }
  }, [isMonitoringActive, isCameraActive, startCamera]);

  // FPS calculation loop
  useEffect(() => {
    let interval = null;
    if (isCameraActive) {
      interval = setInterval(() => {
        setFps(framesProcessed.current);
        framesProcessed.current = 0;
      }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isCameraActive]);

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden bg-surface-950 flex items-center justify-center border border-white/10 group">
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover ${isCameraActive ? 'block' : 'hidden'}`}
      />
      <canvas
        ref={canvasRef}
        className={`absolute top-0 left-0 w-full h-full pointer-events-none ${isCameraActive ? 'block' : 'hidden'}`}
      />

      {/* Offline / Error Overlay */}
      {!isCameraActive && (
        <div className="flex flex-col items-center justify-center p-6 text-center text-gray-400 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-surface-800/80 border border-white/10 flex items-center justify-center text-surface-400">
            {error ? <AlertCircle size={32} className="text-danger-400" /> : <CameraOff size={32} />}
          </div>
          <div>
            <h4 className="text-base font-semibold text-gray-200">
              {error ? 'Camera Access Error' : 'Camera Feed Ready'}
            </h4>
            <p className="text-xs text-gray-400 mt-1 max-w-sm">
              {error ? error : 'Click below to enable your camera preview for real-time monitoring.'}
            </p>
          </div>
          <button
            onClick={startCamera}
            className="btn-primary py-2 px-4 text-xs flex items-center gap-2"
          >
            <RefreshCw size={14} />
            {error ? 'Retry Camera Access' : 'Enable Camera Preview'}
          </button>
        </div>
      )}

      {/* FPS Overlay when Active */}
      {isCameraActive && (
        <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-lg text-xs font-mono text-emerald-400 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>FPS: {fps > 0 ? fps : 30}</span>
        </div>
      )}
    </div>
  );
});

export default CameraFeed;
