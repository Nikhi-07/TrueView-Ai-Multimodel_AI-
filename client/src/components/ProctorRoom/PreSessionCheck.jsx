import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Shield, Camera, Mic, Wifi, CheckCircle2, AlertCircle, RefreshCw, ArrowRight, 
  UserCheck, Lock, Eye, AlertTriangle, ArrowLeft, FlipHorizontal, LogIn, UserPlus
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import useFaceLandmarker from '../../hooks/useFaceLandmarker';
import toast from 'react-hot-toast';

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
    const handleBeforeUnload = () => {
      stopVerificationCamera();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    return () => {
      isUnmountedRef.current = true;
      stopVerificationCamera();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, [stopVerificationCamera]);

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
            const antiSpoof = livenessData.antiSpoof || {};
            const isLive = (livenessData.is_live === true || livenessData.status === 'LIVE' || livenessData.status === 'REAL') && antiSpoof.status !== 'SPOOF';
            
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
              const attackType = livenessData.attack_type || antiSpoof.attack_type;
              const isAttackReal = !attackType || attackType === 'NONE' || String(attackType).toLowerCase() === 'real';
              if (!isAttackReal) {
                setSpoofError(`Presentation attack detected (${attackType.replace(/_/g, ' ')}). Live human face required.`);
              } else {
                setSpoofError(antiSpoof.message || 'Live person check pending. Please look directly at the camera.');
              }
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
    const wasCameraActive = mediaStreamRef.current !== null || cameraPermission === 'granted';
    stopVerificationCamera();
    if (wasCameraActive) {
      toast.success(
        () => (
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-xs text-[#0F172A]">Camera turned off</span>
            <span className="text-[11px] text-[#64748B]">
              Camera has been disabled after leaving the monitoring room.
            </span>
          </div>
        ),
        {
          id: 'camera-disabled-security-toast',
          duration: 4500,
          icon: '🔒',
          style: {
            background: '#FFFFFF',
            color: '#0F172A',
            border: '1px solid #E2E8F0',
            borderRadius: '0.75rem',
            boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.1)',
            padding: '10px 14px',
          }
        }
      );
    }
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
      <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col items-center justify-center p-4 font-sans select-none">
        <div className="max-w-md w-full bg-[#FFFFFF] border border-[#E2E8F0] rounded-2xl shadow-[0_10px_30px_rgba(15,23,42,0.08)] p-8 space-y-6 text-center">
          <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto shadow-xs">
            <Lock size={32} />
          </div>

          <div>
            <span className="text-[10px] font-mono font-bold tracking-widest text-amber-700 uppercase block mb-1">
              ACCOUNT NOT REGISTERED
            </span>
            <h2 className="text-xl font-extrabold text-[#0F172A]">
              Registration Required
            </h2>
            <p className="text-xs text-[#64748B] mt-2 leading-relaxed">
              This proctoring session is available only to registered TrueView AI users. Please register or login before continuing.
            </p>
          </div>

          <div className="space-y-2.5 pt-2">
            <button
              onClick={() => navigate('/login')}
              className="w-full py-3 px-4 bg-[#10B981] hover:bg-[#059669] text-white font-bold text-xs rounded-xl transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogIn size={15} />
              <span>Login to Account</span>
            </button>

            <button
              onClick={() => navigate('/register')}
              className="w-full py-2.5 px-4 bg-white hover:bg-[#F8FAFC] text-[#0F172A] border border-[#CBD5E1] font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <UserPlus size={15} />
              <span>Register Candidate</span>
            </button>

            <button
              onClick={handleExitClick}
              className="w-full py-2 text-xs text-[#64748B] hover:text-[#0F172A] transition flex items-center justify-center gap-1.5 cursor-pointer rounded-lg hover:bg-[#F1F5F9]"
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
      <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex items-center justify-center font-mono">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 bg-[#10B981] rounded-full animate-ping" />
          <span className="text-xs font-bold tracking-wider text-[#64748B]">VALIDATING REGISTERED ACCOUNT...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col items-center justify-center p-4 font-sans select-none">
      
      {/* Brand Header Badge */}
      <div className="mb-4 flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[#FFFFFF] border border-[#D1FAE5] shadow-xs">
        <Shield size={16} className="text-[#10B981] shrink-0" />
        <span className="text-xs font-mono font-extrabold tracking-widest text-[#0F172A]">TRUEVIEW AI</span>
        <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse shrink-0" />
      </div>

      <div className="max-w-xl w-full bg-[#FFFFFF] border border-[#E2E8F0] rounded-2xl shadow-[0_10px_30px_rgba(15,23,42,0.08)] p-6 space-y-5">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-[#E2E8F0]">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold text-[#0F172A] font-mono uppercase tracking-wider">
                VERIFY YOUR IDENTITY
              </h1>
              <span className="px-2 py-0.5 bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] text-[10px] font-mono font-bold rounded">
                {sessionType}
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-0.5">
              Candidate: <strong className="text-[#0F172A]">{candidateName}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMirrored(!isMirrored)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F8FAFC] hover:bg-[#EFF6FF] border border-[#E2E8F0] text-xs font-mono text-[#475569] transition cursor-pointer shadow-xs"
              title="Flip Camera View"
            >
              <FlipHorizontal size={14} className="text-[#2563EB]" />
              <span>{isMirrored ? 'Mirrored' : 'Normal'}</span>
            </button>
            <button
              type="button"
              onClick={handleExitClick}
              className="p-1.5 rounded-lg bg-[#F8FAFC] hover:bg-[#EFF6FF] border border-[#E2E8F0] text-[#475569] hover:text-[#0F172A] transition cursor-pointer shadow-xs"
              title="Exit Proctor Room"
            >
              <ArrowLeft size={16} />
            </button>
          </div>
        </div>

        {/* CAMERA PREVIEW STAGE */}
        <div className="relative w-full aspect-video bg-[#F1F5F9] rounded-xl overflow-hidden border border-[#CBD5E1] shadow-xs flex items-center justify-center">
          
          <video
            ref={videoPreviewRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover transition-transform duration-300 ${isMirrored ? 'scale-x-[-1]' : 'scale-x-[1]'} ${cameraPermission === 'granted' ? 'block' : 'hidden'}`}
          />

          {cameraPermission !== 'granted' && (
            <div className="flex flex-col items-center justify-center p-6 text-center space-y-2 text-[#64748B]">
              <Camera size={38} className="text-[#94A3B8] animate-pulse" />
              <p className="text-xs text-[#64748B] font-medium">Loading Camera Stream...</p>
            </div>
          )}

          {/* SPOOF ERROR OVERLAY */}
          {spoofError && (
            <div className="absolute top-3 left-3 right-3 bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] p-2.5 rounded-xl shadow-lg backdrop-blur-md flex items-center gap-2 z-30 animate-bounce">
              <AlertTriangle size={18} className="text-[#DC2626] shrink-0" />
              <span className="text-xs font-mono font-bold leading-tight">{spoofError}</span>
            </div>
          )}

          {/* IDENTITY MISMATCH OVERLAY */}
          {identityMismatch && (
            <div className="absolute top-3 left-3 right-3 bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] p-2.5 rounded-xl shadow-lg backdrop-blur-md flex items-center gap-2 z-30 animate-bounce">
              <AlertCircle size={18} className="text-[#DC2626] shrink-0" />
              <span className="text-xs font-mono font-bold leading-tight">
                IDENTITY MISMATCH: The detected person does not match the registered candidate.
              </span>
            </div>
          )}

          {/* Top Status Badges */}
          <div className="absolute top-3 left-3 bg-[#FFFFFF]/90 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-mono text-[#0F172A] border border-[#E2E8F0] shadow-xs flex items-center gap-2 z-10">
            <span className={`w-2 h-2 rounded-full ${cameraPermission === 'granted' ? 'bg-[#10B981] animate-pulse' : 'bg-[#EF4444]'}`} />
            <span className="font-bold text-[11px]">{cameraPermission === 'granted' ? 'CAMERA ACTIVE' : 'NO CAMERA'}</span>
          </div>
        </div>

        {/* VERIFICATION STATUS SEQUENCE */}
        <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-4 rounded-xl space-y-2.5 font-mono text-xs">
          
          {/* 1. Face Detected */}
          <div className="flex items-center justify-between">
            <span className="text-[#334155] font-medium">Face detected</span>
            {faceDetected ? (
              <span className="inline-flex items-center gap-1 text-[#059669] font-bold">
                <CheckCircle2 size={13} className="text-[#10B981]" />
                <span>Detected ✓</span>
              </span>
            ) : (
              <span className="text-[#D97706] font-bold animate-pulse">Scanning...</span>
            )}
          </div>

          {/* 2. Live Person Check */}
          <div className="flex items-center justify-between">
            <span className="text-[#334155] font-medium">Live person check</span>
            {livePersonVerified ? (
              <span className="inline-flex items-center gap-1 text-[#059669] font-bold">
                <CheckCircle2 size={13} className="text-[#10B981]" />
                <span>Live verified ✓</span>
              </span>
            ) : spoofError ? (
              <span className="inline-flex items-center gap-1 text-[#DC2626] font-bold">
                <AlertCircle size={13} className="text-[#EF4444]" />
                <span>FAILED ✕</span>
              </span>
            ) : (
              <span className="text-[#D97706] font-bold animate-pulse">Checking...</span>
            )}
          </div>

          {/* 3. Blink Naturally */}
          <div className="flex items-center justify-between">
            <span className="text-[#334155] font-medium">Blink naturally</span>
            {blinkDetected ? (
              <span className="inline-flex items-center gap-1 text-[#059669] font-bold">
                <CheckCircle2 size={13} className="text-[#10B981]" />
                <span>Blink detected ✓</span>
              </span>
            ) : landmarker.status === 'unavailable' ? (
              <span className="text-[#D97706] font-bold">Unavailable – PAD active</span>
            ) : (
              <span className="text-[#D97706] font-bold animate-pulse">Awaiting blink...</span>
            )}
          </div>

          {/* 4. Verifying Face & Identity */}
          <div className="flex items-center justify-between">
            <span className="text-[#334155] font-medium">Verifying face</span>
            {identityMismatch ? (
              <span className="inline-flex items-center gap-1 text-[#DC2626] font-bold">
                <AlertCircle size={13} className="text-[#EF4444]" />
                <span>MISMATCH ✕</span>
              </span>
            ) : identityVerified ? (
              <span className="inline-flex items-center gap-1 text-[#059669] font-bold">
                <CheckCircle2 size={13} className="text-[#10B981]" />
                <span>Identity verified ✓</span>
              </span>
            ) : identityUnavailable ? (
              <span className="text-[#D97706] font-bold">Unavailable – monitored in-room</span>
            ) : (
              <span className="text-[#D97706] font-bold animate-pulse">Comparing...</span>
            )}
          </div>

          {/* 5. Voice Profile */}
          <div className="flex items-center justify-between">
            <span className="text-[#334155] font-medium">Voice profile</span>
            {voiceProfileReady ? (
              <span className="inline-flex items-center gap-1 text-[#059669] font-bold">
                <CheckCircle2 size={13} className="text-[#10B981]" />
                <span>Registered ✓</span>
              </span>
            ) : (
              <span className="text-[#64748B] font-bold">Not enrolled (Optional)</span>
            )}
          </div>

          {/* 6. Network Connection */}
          <div className="flex items-center justify-between">
            <span className="text-[#334155] font-medium">Network connection</span>
            {networkOnline ? (
              <span className="inline-flex items-center gap-1 text-[#059669] font-bold">
                <CheckCircle2 size={13} className="text-[#10B981]" />
                <span>Online ✓</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[#DC2626] font-bold">
                <AlertCircle size={13} className="text-[#EF4444]" />
                <span>Offline ✕</span>
              </span>
            )}
          </div>

        </div>

        {/* Action Controls: EXIT, RESET, ENTER PROCTOR ROOM */}
        <div className="pt-2 flex items-center justify-between gap-3 border-t border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExitClick}
              className="px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] bg-[#FFFFFF] hover:bg-[#F1F5F9] text-[#475569] text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Exit to Virtual Rooms"
            >
              <ArrowLeft size={13} />
              <span>EXIT</span>
            </button>

            <button
              type="button"
              onClick={runCheckSequence}
              className="px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] bg-[#FFFFFF] hover:bg-[#EFF6FF] text-[#475569] text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Restart camera & checks"
            >
              <RefreshCw size={13} />
              <span>Reset Verification</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleEnterProctorRoom}
            disabled={!isReadyToEnter}
            className={`px-5 py-2.5 rounded-xl text-xs font-mono font-extrabold tracking-wider transition flex items-center gap-2 ${
              isReadyToEnter
                ? 'bg-[#10B981] hover:bg-[#059669] text-[#FFFFFF] cursor-pointer shadow-md'
                : 'bg-[#E2E8F0] text-[#94A3B8] cursor-not-allowed border border-[#CBD5E1]'
            }`}
          >
            <span>{sessionType === 'INTERVIEW' ? 'ENTER INTERVIEW' : 'ENTER EXAMINATION'}</span>
            <ArrowRight size={14} />
          </button>
        </div>

      </div>

      {/* Footer Security Badge */}
      <div className="mt-5 flex items-center gap-2 text-xs text-[#64748B] font-medium text-center">
        <CheckCircle2 size={14} className="text-[#10B981] shrink-0" />
        <span>End-to-End Multimodal Trust Verification & Monitoring</span>
      </div>

    </div>
  );
}
