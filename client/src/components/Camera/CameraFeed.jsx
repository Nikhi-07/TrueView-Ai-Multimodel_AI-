
import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

const CameraFeed = forwardRef(function CameraFeed({ onDetectionUpdate, isActive }, ref) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);


  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isAcquiring, setIsAcquiring] = useState(false);
  const [error, setError] = useState(null);
  const [fps, setFps] = useState(0);
  const framesProcessed = useRef(0);

  const isMountedRef = useRef(true);
  const isAcquiringRef = useRef(false);
  const acquiringPromiseRef = useRef(null);
  const shouldStopRef = useRef(false);
  const onDetectionUpdateRef = useRef(onDetectionUpdate);

  useEffect(() => {
    onDetectionUpdateRef.current = onDetectionUpdate;
  }, [onDetectionUpdate]);

  // Capture a frame as base64 JPEG
  const captureFrameBase64 = useCallback(() => {
    const video = videoRef.current;
    if (!video || !isCameraActive || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  }, [isCameraActive]);

  // Stop camera and release all hardware tracks cleanly (idempotent)
  const stopCamera = useCallback(() => {
    shouldStopRef.current = true;
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach(t => {
        try {
          t.stop();
        } catch (_) { }
      });
      streamRef.current = null;
    }
    setIsCameraActive(false);
    setIsAcquiring(false);
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch (_) { }
    }
    console.log("[TrueView Camera] Camera stopped");
  }, []);

  // Start camera (re-entrant safe, handles StrictMode race conditions & prevents duplicate streams)
  const startCamera = useCallback(async () => {
    shouldStopRef.current = false;

    // If an existing live stream is already active and healthy, reuse it without requesting again
    if (streamRef.current) {
      const activeVideo = streamRef.current.getVideoTracks().some(t => t.readyState === 'live');
      if (activeVideo) {
        setIsCameraActive(true);
        setIsAcquiring(false);
        setError(null);
        if (videoRef.current && videoRef.current.srcObject !== streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.muted = true;
          videoRef.current.playsInline = true;
          videoRef.current.autoplay = true;
          try {
            await videoRef.current.play();
          } catch (_) { }
          console.log("[TrueView Camera] Video attached");
        }
        console.log("[TrueView Camera] Camera active");
        return streamRef.current;
      }

      // Stale stream with ended tracks — cleanly release before reacquiring
      streamRef.current.getTracks().forEach(t => {
        try { t.stop(); } catch (_) { }
      });
      streamRef.current = null;
    }

    // Strict Mode / deduplication: if getUserMedia is currently in flight, await existing promise
    if (acquiringPromiseRef.current) {
      try {
        const inFlightStream = await acquiringPromiseRef.current;
        if (!shouldStopRef.current && isMountedRef.current && inFlightStream) {
          if (videoRef.current && videoRef.current.srcObject !== inFlightStream) {
            videoRef.current.srcObject = inFlightStream;
            videoRef.current.muted = true;
            videoRef.current.playsInline = true;
            videoRef.current.autoplay = true;
            try {
              await videoRef.current.play();
            } catch (_) { }
            console.log("[TrueView Camera] Video attached");
          }
          setIsCameraActive(true);
          console.log("[TrueView Camera] Camera active");
        }
        return inFlightStream;
      } catch (err) {
        return null;
      }
    }

    console.log("[TrueView Camera] Requesting camera");
    isAcquiringRef.current = true;
    setIsAcquiring(true);
    setError(null);

    const acquireStream = async () => {
      const constraints = {
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          facingMode: 'user'
        },
        audio: true
      };

      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        // Fallback to video only if combined video+audio request fails
        console.warn("[TrueView Camera] Combined audio+video request failed, falling back to video only:", err.message);
        return await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            facingMode: 'user'
          },
          audio: false
        });
      }
    };

    acquiringPromiseRef.current = acquireStream();

    try {
      const newStream = await acquiringPromiseRef.current;
      console.log("[TrueView Camera] Stream acquired");

      // Guard: if stopCamera was called while waiting for getUserMedia, or component unmounted
      if (shouldStopRef.current || !isMountedRef.current) {
        newStream.getTracks().forEach(t => {
          try { t.stop(); } catch (_) { }
        });
        return null;
      }

      streamRef.current = newStream;

      const vTrack = newStream.getVideoTracks()[0];
      if (vTrack) {
        vTrack.onended = () => {
          console.warn("[TrueView Camera] Video track ended.");
          setIsCameraActive(false);
          if (onDetectionUpdateRef.current) {
            onDetectionUpdateRef.current({ trackInterrupted: true, mediaType: 'camera' });
          }
        };
      }

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        videoRef.current.autoplay = true;
        try {
          const playPromise = videoRef.current.play();
          if (playPromise !== undefined) {
            await playPromise;
          }
        } catch (playErr) {
          console.warn("[TrueView Camera] video.play() caught:", playErr);
        }
        console.log("[TrueView Camera] Video attached");
      }

      setIsCameraActive(true);
      setError(null);
      console.log("[TrueView Camera] Camera active");
      return newStream;
    } catch (err) {
      if (!shouldStopRef.current && isMountedRef.current) {
        console.error("[TrueView Camera] MediaDevices error:", err);
        setError(err.message || 'Camera permission denied or camera device unavailable.');
        setIsCameraActive(false);
      }
      return null;
    } finally {
      isAcquiringRef.current = false;
      setIsAcquiring(false);
      acquiringPromiseRef.current = null;
    }
  }, []);

  // Expose captureFrameBase64, active MediaStream, startCamera and stopCamera to parent via ref
  useImperativeHandle(ref, () => ({
    captureFrameBase64,
    getStream: () => streamRef.current,
    startCamera,
    stopCamera
  }), [captureFrameBase64, startCamera, stopCamera]);

  // Attach stream to video element whenever active if not already attached
  useEffect(() => {
    if (isCameraActive && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        videoRef.current.autoplay = true;
        videoRef.current.play().catch(() => { });
      }
    }
  }, [isCameraActive]);

  // Auto-start camera preview on mount and ensure clean shutdown on unmount
  useEffect(() => {
    isMountedRef.current = true;
    shouldStopRef.current = false;
    startCamera();

    const handleWindowUnload = () => {
      stopCamera();
    };
    window.addEventListener('beforeunload', handleWindowUnload);
    window.addEventListener('pagehide', handleWindowUnload);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('beforeunload', handleWindowUnload);
      window.removeEventListener('pagehide', handleWindowUnload);

      // In React Strict Mode, unmount is immediately followed by remount.
      // Defer stopping briefly so Strict Mode remount doesn't kill the active stream.
      setTimeout(() => {
        if (!isMountedRef.current) {
          stopCamera();
        }
      }, 50);
    };
  }, [startCamera, stopCamera]);

  // Handle explicit isActive prop toggle safely
  useEffect(() => {
    if (isActive === false) {
      stopCamera();
    } else if (isActive === true && !isCameraActive && !isAcquiringRef.current) {
      startCamera();
    }
  }, [isActive, isCameraActive, startCamera, stopCamera]);

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

      {/* Permission Denied / Error State */}
      {!isCameraActive && error && (
        <div className="flex flex-col items-center justify-center p-6 text-center text-gray-400 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-surface-800/80 border border-white/10 flex items-center justify-center text-rose-400">
            <AlertCircle size={32} />
          </div>
          <div>
            <h4 className="text-base font-semibold text-gray-200">
              Camera Access Required
            </h4>
            <p className="text-xs text-gray-400 mt-1 max-w-sm">
              Please allow camera access to continue monitoring.
            </p>
          </div>
          <button
            onClick={startCamera}
            className="btn-primary py-2 px-4 text-xs flex items-center gap-2 cursor-pointer bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition"
          >
            <RefreshCw size={14} />
            Enable Camera
          </button>
        </div>
      )}

      {/* Connecting / Initializing State (Not Offline) */}
      {!isCameraActive && !error && (
        <div className="flex flex-col items-center justify-center p-6 text-center text-gray-400 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-surface-800/80 border border-white/10 flex items-center justify-center text-emerald-400">
            <RefreshCw size={28} className="animate-spin text-emerald-400" />
          </div>
          <div>
            <h4 className="text-base font-semibold text-gray-200">
              {isAcquiring ? 'Starting Camera Feed...' : 'Connecting Camera Feed...'}
            </h4>
            <p className="text-xs text-gray-400 mt-1 max-w-sm">
              Requesting camera permission and connecting live video feed.
            </p>
          </div>
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
