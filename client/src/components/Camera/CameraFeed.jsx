import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import { CameraOff, AlertCircle } from 'lucide-react';

const CameraFeed = forwardRef(function CameraFeed({ onDetectionUpdate, isActive: isMonitoringActive }, ref) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const requestRef = useRef(null);
  const startedRef = useRef(false);

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
    canvas.getContext('2d').drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.7);
  }, [isCameraActive]);

  // Expose captureFrameBase64 to parent via ref
  useImperativeHandle(ref, () => ({
    captureFrameBase64
  }), [captureFrameBase64]);

  // Start camera
  const startCamera = useCallback(async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      streamRef.current = newStream;
      setIsCameraActive(true);
      setError(null);
      // We attach srcObject in a useEffect that watches isCameraActive
    } catch (err) {
      setError(err.message || 'Failed to start camera');
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

  // Attach stream to video element AFTER it renders (this is the critical fix)
  useEffect(() => {
    if (isCameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [isCameraActive]);

  // Start/Stop based on parent prop
  useEffect(() => {
    if (isMonitoringActive && !startedRef.current) {
      startedRef.current = true;
      startCamera();
    }
    if (!isMonitoringActive && startedRef.current) {
      startedRef.current = false;
      stopCamera();
    }
  }, [isMonitoringActive, startCamera, stopCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  // Frame processing loop (face detection)
  useEffect(() => {
    let isProcessing = false;

    const processFrame = async () => {
      if (!isCameraActive || !videoRef.current || !canvasRef.current) {
        requestRef.current = requestAnimationFrame(processFrame);
        return;
      }

      framesProcessed.current++;
      const now = Date.now();
      if (now - lastFpsTime.current >= 1000) {
        setFps(framesProcessed.current);
        framesProcessed.current = 0;
        lastFpsTime.current = now;
      }

      if (isProcessing) {
        requestRef.current = requestAnimationFrame(processFrame);
        return;
      }
      isProcessing = true;

      try {
        const frameBase64 = captureFrameBase64();
        if (frameBase64) {
          const response = await fetch('/ai-api/face-detection/process-frame', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: frameBase64 })
          });
          const result = await response.json();
          if (response.ok) {
            onDetectionUpdate && onDetectionUpdate(result, fps);
            drawBoundingBoxes(result.faces, result.imageWidth, result.imageHeight);
          }
        }
      } catch (err) {
        // silent
      } finally {
        isProcessing = false;
        setTimeout(() => {
          requestRef.current = requestAnimationFrame(processFrame);
        }, 50);
      }
    };

    if (isCameraActive) {
      requestRef.current = requestAnimationFrame(processFrame);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isCameraActive, captureFrameBase64, onDetectionUpdate, fps]);

  const drawBoundingBoxes = (faces, originalWidth, originalHeight) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scaleX = canvas.width / originalWidth;
    const scaleY = canvas.height / originalHeight;
    faces.forEach(face => {
      const { x, y, width, height } = face.box;
      const conf = (face.confidence * 100).toFixed(1);
      const sX = x * scaleX, sY = y * scaleY, sW = width * scaleX, sH = height * scaleY;
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.strokeRect(sX, sY, sW, sH);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
      ctx.fillRect(sX, sY - 20, 100, 20);
      ctx.fillStyle = '#10b981';
      ctx.font = '10px monospace';
      ctx.fillText(`Face: ${conf}%`, sX + 4, sY - 6);
    });
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-surface-900 rounded-2xl text-danger-400">
        <AlertCircle size={48} className="mb-4" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden bg-black flex items-center justify-center group">
      {/* ALWAYS render the video element — just hide it when inactive */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover ${isCameraActive ? '' : 'hidden'}`}
      />
      <canvas
        ref={canvasRef}
        className={`absolute top-0 left-0 w-full h-full pointer-events-none ${isCameraActive ? '' : 'hidden'}`}
      />

      {!isCameraActive && (
        <div className="flex flex-col items-center text-surface-600">
          <CameraOff size={64} className="mb-4" />
          <p className="text-sm font-medium">Camera Offline</p>
        </div>
      )}

      {isCameraActive && (
        <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-lg text-xs font-mono text-gray-300">
          FPS: {fps}
        </div>
      )}
    </div>
  );
});

export default CameraFeed;
