import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Shield, Camera, Mic, Wifi, CheckCircle2, AlertCircle, RefreshCw, ArrowRight, 
  UserCheck, Lock, Eye, AlertTriangle, ArrowLeft, FlipHorizontal, LogIn, UserPlus
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import useFaceLandmarker from '../../hooks/useFaceLandmarker';

export default function PreSessionCheck({
  room,
  user: initialUser,
  onValidationComplete,
  onExit
}) {
  const navigate = useNavigate();
  const { user: authUser, isAuthenticated, loading: authLoading } = useAuth();

  const sessionType = room?.sessionType || room?.mode || 'EXAM';
  const effectiveUser = authUser || initialUser;
  const candidateName = effectiveUser?.fullName || effectiveUser?.name || 'Registered Candidate';

  const [authChecking, setAuthChecking] = useState(true);
  const [authError, setAuthError] = useState(false);

  const [cameraPermission, setCameraPermission] = useState('checking');
  const [micPermission, setMicPermission] = useState('checking');
  
  // Verification States
  const [faceDetected, setFaceDetected] = useState(false);
  const [livePersonVerified, setLivePersonVerified] = useState(false);
  const [blinkDetected, setBlinkDetected] = useState(false);
  const [blinkCount, setBlinkCount] = useState(0);
  const [identityVerified, setIdentityVerified] = useState(false);
  const [identityMismatch, setIdentityMismatch] = useState(false);
  const [identityUnavailable, setIdentityUnavailable] = useState(false);
  const [voiceProfileReady, setVoiceProfileReady] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(navigator.onLine);
  const [spoofError, setSpoofError] = useState(null);

  const [isMirrored, setIsMirrored] = useState(true);
  const videoPreviewRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioStreamRef = useRef(null);
  const frameBufferRef = useRef([]);
  const aiLoopRef = useRef(null);
  const isUnmountedRef = useRef(false);

  // Real MediaPipe Face Landmarker blendshape blink detection
  const landmarker = useFaceLandmarker(videoPreviewRef, {
    enabled: cameraPermission === 'granted',
    onBlink: (count) => {
      setBlinkCount(count);
      if (count >= 1) setBlinkDetected(true);
    }
  });

  // Stop all camera and microphone tracks cleanly
  const stopVerificationCamera = useCallback(() => {
    if (aiLoopRef.current) {
      clearInterval(aiLoopRef.current);
      aiLoopRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (_) {}
      });
      mediaStreamRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (_) {}
      });
      audioStreamRef.current = null;
    }
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
    }
    setCameraPermission('idle');
    setMicPermission('idle');
  }, []);

  // Check Registration & Authentication on Mount
  useEffect(() => {
    isUnmountedRef.current = false;

    const checkBackendRegistration = async () => {
      setAuthChecking(true);
      try {
        const res = await api.get('/auth/me');
        if (res.data && res.data.authenticated && res.data.registered) {
          setAuthError(false);
          runCheckSequence();
        } else {
          setAuthError(true);
        }
      } catch (err) {
        console.warn('[PreSessionCheck] Auth validation error:', err);
        setAuthError(true);
      } finally {
        setAuthChecking(false);
      }
    };

    checkBackendRegistration();

    const handleOnline = () => setNetworkOnline(true);
    const handleOffline = () => setNetworkOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      isUnmountedRef.current = true;
      stopVerificationCamera();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const captureFrameAndCtx = useCallback(() => {
    const video = videoPreviewRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    
    if (isMirrored) {
      ctx.translate(320, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, 320, 240);
    return {
      b64: canvas.toDataURL('image/jpeg', 0.65),
      ctx,
      width: 320,
      height: 240
    };
  }, [isMirrored]);

  const runCheckSequence = async () => {
    stopVerificationCamera();

    setCameraPermission('checking');
    setMicPermission('checking');
    setFaceDetected(false);
    setLivePersonVerified(false);
    setBlinkDetected(false);
    setBlinkCount(0);
    setIdentityVerified(false);
    setIdentityMismatch(false);
    setIdentityUnavailable(false);
    setSpoofError(null);
    setNetworkOnline(navigator.onLine);

    // Voice profile readiness
    try {
      const bioRes = await api.get('/auth/biometric-status');
      setVoiceProfileReady(Boolean(bioRes.data?.voiceRegistered));
    } catch (_) {
      setVoiceProfileReady(false);
    }

    // Camera & Mic Access
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true
      });

      if (isUnmountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      mediaStreamRef.current = stream;
      setCameraPermission('granted');
      setMicPermission('granted');
      setFaceDetected(true);

      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }

      startAuthenticationPipeline();

    } catch (err) {
      console.error('[PreSessionCheck] Media access error:', err);
      if (!isUnmountedRef.current) {
        setCameraPermission('denied');
        setMicPermission('denied');
      }
    }
  };

  // Continuous Authentication & Liveness Pipeline
  const startAuthenticationPipeline = () => {
    if (aiLoopRef.current) clearInterval(aiLoopRef.current);
    let loopTicks = 0;
    frameBufferRef.current = [];

    aiLoopRef.current = setInterval(async () => {
      if (isUnmountedRef.current) return;
      loopTicks++;
      const frameData = captureFrameAndCtx();
      if (!frameData) return;

      const { b64 } = frameData;

      // Blendshapes for eye blink
      const blendshapes = landmarker.getBlendshapes();

      frameBufferRef.current.push(b64);
      if (frameBufferRef.current.length > 5) frameBufferRef.current.shift();

      // ConvNeXt Anti-Spoofing & Identity Verification Call (runs every 4 ticks)
      if (loopTicks % 4 === 0 && frameBufferRef.current.length >= 2) {
        try {
          const livenessRes = await fetch('/ai-api/liveness/evaluate-auth-liveness', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image: b64,
              session_id: room?.roomId || room?.id || 'TRV-1001',
              eye_blink_left: blendshapes.left,
              eye_blink_right: blendshapes.right
            })
          }).catch(() => null);

          if (livenessRes && livenessRes.ok) {
            const livenessData = await livenessRes.json();
            const isLive = livenessData.is_live !== false && livenessData.status === 'LIVE' && livenessData.antiSpoof?.status !== 'SPOOF';
            
            if (livenessData.face?.detected !== false) {
              setFaceDetected(true);
            }

            if (livenessData.blink?.detected || (livenessData.blink?.count || 0) >= 1) {
              setBlinkDetected(true);
            }

            if (isLive) {
              setLivePersonVerified(true);
              setSpoofError(null);
            } else {
              setLivePersonVerified(false);
              const attackType = livenessData.attack_type || livenessData.antiSpoof?.attack_type;
              const reason = attackType && attackType !== 'NONE'
                ? `Presentation attack detected (${attackType.replace(/_/g, ' ')}). Live human face required.`
                : (livenessData.antiSpoof?.message || 'Presentation attack detected. Live human face required.');
              setSpoofError(reason);
            }
          } else {
            setLivePersonVerified(false);
            setSpoofError('Anti-spoofing service unavailable. Verification cannot be completed right now.');
          }
        } catch (_) {
          setLivePersonVerified(false);
          setSpoofError('Anti-spoofing service unavailable. Verification cannot be completed right now.');
        }

        // Face Identity Verification – server-authoritative
        try {
          const verifyRes = await api.post('/auth/verify-session-face', { image: b64 });
          if (verifyRes.data && verifyRes.data.verified) {
            setIdentityVerified(true);
            setIdentityMismatch(false);
            setIdentityUnavailable(false);
          } else if (verifyRes.data && verifyRes.data.recognitionUnavailable) {
            setIdentityVerified(true); // Fallback to in-room monitoring if recognition service disabled
            setIdentityMismatch(false);
            setIdentityUnavailable(true);
          } else if (verifyRes.data && verifyRes.data.verified === false) {
            setIdentityVerified(false);
            setIdentityMismatch(true);
            setIdentityUnavailable(false);
          }
        } catch (_) {}
      }

    }, 200);
  };

  const handleExitClick = () => {
    stopVerificationCamera();
    if (onExit) {
      onExit();
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/rooms');
    }
  };

  const blinkRequirementMet = landmarker.status === 'unavailable' ? true : blinkDetected;

  // Strict Decision Gate
  const isReadyToEnter =
    !authError &&
    cameraPermission === 'granted' &&
    micPermission === 'granted' &&
    faceDetected &&
    livePersonVerified &&
    blinkRequirementMet &&
    (identityVerified || identityUnavailable) &&
    !identityMismatch &&
    networkOnline &&
    !spoofError;

  const handleEnterProctorRoom = () => {
    if (!isReadyToEnter) return;
    stopVerificationCamera();
    onValidationComplete();
  };

  // UNREGISTERED / UNAUTHENTICATED SCREEN
  if (authError || (!authLoading && !isAuthenticated)) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4 font-sans select-none">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-8 space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
            <Lock size={32} />
          </div>

          <div>
            <span className="text-[10px] font-mono font-bold tracking-widest text-amber-400 uppercase block mb-1">
              ACCOUNT NOT REGISTERED
            </span>
            <h2 className="text-xl font-black text-white">
              Registration Required
            </h2>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              This proctoring session is available only to registered TrueView AI users. Please register or login before continuing.
            </p>
          </div>

          <div className="space-y-2.5 pt-2">
            <button
              onClick={() => navigate('/login')}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogIn size={15} />
              <span>Login to Account</span>
            </button>

            <button
              onClick={() => navigate('/register')}
              className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <UserPlus size={15} />
              <span>Register Candidate</span>
            </button>

            <button
              onClick={handleExitClick}
              className="w-full py-2 text-xs text-zinc-400 hover:text-white transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft size={13} />
              <span>Exit</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // LOADING AUTH SCREEN
  if (authChecking) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center font-mono">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 bg-emerald-400 rounded-full animate-ping" />
          <span className="text-xs tracking-wider">VALIDATING REGISTERED ACCOUNT...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4 font-sans select-none">
      
      <div className="max-w-xl w-full bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-5">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold text-white font-mono uppercase tracking-wider">
                VERIFY YOUR IDENTITY
              </h1>
              <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-mono font-bold rounded">
                {sessionType}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Candidate: <strong className="text-white">{candidateName}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMirrored(!isMirrored)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-mono text-zinc-200 transition cursor-pointer"
              title="Flip Camera View"
            >
              <FlipHorizontal size={14} className="text-emerald-400" />
              <span>{isMirrored ? 'Mirrored' : 'Normal'}</span>
            </button>
            <button
              onClick={handleExitClick}
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition cursor-pointer"
              title="Exit Proctor Room"
            >
              <ArrowLeft size={16} />
            </button>
          </div>
        </div>

        {/* CAMERA PREVIEW STAGE */}
        <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-zinc-800 shadow-xl flex items-center justify-center">
          
          <video
            ref={videoPreviewRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover transition-transform duration-300 ${isMirrored ? 'scale-x-[-1]' : 'scale-x-[1]'} ${cameraPermission === 'granted' ? 'block' : 'hidden'}`}
          />

          {cameraPermission !== 'granted' && (
            <div className="flex flex-col items-center justify-center p-6 text-center space-y-2 text-zinc-500">
              <Camera size={38} className="text-zinc-600 animate-pulse" />
              <p className="text-xs text-zinc-400">Loading Camera Stream...</p>
            </div>
          )}

          {/* SPOOF ERROR OVERLAY */}
          {spoofError && (
            <div className="absolute top-3 left-3 right-3 bg-red-950/95 border border-red-500 text-red-100 p-2.5 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-2 z-30 animate-bounce">
              <AlertTriangle size={18} className="text-red-400 shrink-0" />
              <span className="text-xs font-mono font-bold leading-tight">{spoofError}</span>
            </div>
          )}

          {/* IDENTITY MISMATCH OVERLAY */}
          {identityMismatch && (
            <div className="absolute top-3 left-3 right-3 bg-rose-950/95 border border-rose-500 text-rose-100 p-2.5 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-2 z-30 animate-bounce">
              <AlertCircle size={18} className="text-rose-400 shrink-0" />
              <span className="text-xs font-mono font-bold leading-tight">
                IDENTITY MISMATCH: The detected person does not match the registered candidate.
              </span>
            </div>
          )}

          {/* Top Status Badges */}
          <div className="absolute top-3 left-3 bg-black/85 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-mono text-zinc-200 border border-zinc-800 flex items-center gap-2 z-10">
            <span className={`w-2 h-2 rounded-full ${cameraPermission === 'granted' ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
            <span>{cameraPermission === 'granted' ? 'CAMERA ACTIVE' : 'NO CAMERA'}</span>
          </div>
        </div>

        {/* VERIFICATION STATUS SEQUENCE */}
        <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl space-y-2.5 font-mono text-xs">
          
          {/* 1. Face Detected */}
          <div className="flex items-center justify-between">
            <span className="text-zinc-300">Face detected</span>
            {faceDetected ? (
              <span className="text-emerald-400 font-bold">✓</span>
            ) : (
              <span className="text-zinc-500">...</span>
            )}
          </div>

          {/* 2. Live Person Check */}
          <div className="flex items-center justify-between">
            <span className="text-zinc-300">Live person check</span>
            {livePersonVerified ? (
              <span className="text-emerald-400 font-bold">✓</span>
            ) : spoofError ? (
              <span className="text-red-400 font-bold">FAILED ✕</span>
            ) : (
              <span className="text-amber-400 font-bold animate-pulse">Checking...</span>
            )}
          </div>

          {/* 3. Blink Naturally */}
          <div className="flex items-center justify-between">
            <span className="text-zinc-300">Blink naturally</span>
            {blinkDetected ? (
              <span className="text-emerald-400 font-bold">Blink detected ✓</span>
            ) : landmarker.status === 'unavailable' ? (
              <span className="text-amber-400 font-bold">Unavailable – PAD active</span>
            ) : (
              <span className="text-amber-400 font-bold">Awaiting blink...</span>
            )}
          </div>

          {/* 4. Verifying Face & Identity */}
          <div className="flex items-center justify-between">
            <span className="text-zinc-300">Verifying face</span>
            {identityMismatch ? (
              <span className="text-rose-400 font-bold">MISMATCH ✕</span>
            ) : identityVerified ? (
              <span className="text-emerald-400 font-bold">Identity verified ✓</span>
            ) : identityUnavailable ? (
              <span className="text-amber-400 font-bold">Unavailable – monitored in-room</span>
            ) : (
              <span className="text-zinc-500">...</span>
            )}
          </div>

          {/* 5. Voice Profile */}
          <div className="flex items-center justify-between">
            <span className="text-zinc-300">Voice profile</span>
            {voiceProfileReady ? (
              <span className="text-emerald-400 font-bold">Registered ✓</span>
            ) : (
              <span className="text-zinc-400 font-bold">Not enrolled (Optional)</span>
            )}
          </div>

          {/* 6. Network */}
          <div className="flex items-center justify-between">
            <span className="text-zinc-300">Network connection</span>
            {networkOnline ? (
              <span className="text-emerald-400 font-bold">Online ✓</span>
            ) : (
              <span className="text-red-400 font-bold">Offline ✕</span>
            )}
          </div>

        </div>

        {/* Action Controls: EXIT, RESET, ENTER PROCTOR ROOM */}
        <div className="pt-2 flex items-center justify-between gap-3 border-t border-zinc-800">
          <div className="flex items-center gap-2">
            <button
              onClick={handleExitClick}
              className="px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer"
              title="Exit to Virtual Rooms"
            >
              <ArrowLeft size={13} />
              <span>EXIT</span>
            </button>

            <button
              onClick={runCheckSequence}
              className="px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer"
              title="Restart camera & checks"
            >
              <RefreshCw size={13} />
              <span>Reset Verification</span>
            </button>
          </div>

          <button
            onClick={handleEnterProctorRoom}
            disabled={!isReadyToEnter}
            className={`px-5 py-2.5 rounded-xl text-xs font-mono font-extrabold tracking-wider transition flex items-center gap-2 ${
              isReadyToEnter
                ? 'bg-white hover:bg-zinc-200 text-black cursor-pointer shadow-lg'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'
            }`}
          >
            <span>ENTER PROCTOR ROOM</span>
            <ArrowRight size={14} />
          </button>
        </div>

      </div>

    </div>
  );
}
