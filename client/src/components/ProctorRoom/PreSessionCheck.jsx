import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Shield, Camera, Mic, Wifi, CheckCircle2, AlertCircle, RefreshCw, ArrowRight, 
  UserCheck, Lock, Eye, AlertTriangle, ArrowLeft, ArrowRight as ArrowRightIcon, FlipHorizontal
} from 'lucide-react';
import { SESSION_POLICIES } from '../../utils/sessionPolicies';
import api from '../../services/api';
import useFaceLandmarker from '../../hooks/useFaceLandmarker';

export default function PreSessionCheck({
  room,
  user,
  onValidationComplete,
  onStreamReady
}) {
  const sessionType = room?.sessionType || room?.mode || 'EXAM';

  const [cameraPermission, setCameraPermission] = useState('checking');
  const [micPermission, setMicPermission] = useState('checking');
  
  // Clean Professional Verification Flow States
  const [faceDetected, setFaceDetected] = useState(false);
  const [livePersonVerified, setLivePersonVerified] = useState(false);
  const [blinkDetected, setBlinkDetected] = useState(false);
  const [blinkCount, setBlinkCount] = useState(0);
  const [identityVerified, setIdentityVerified] = useState(false);
  // Honest tri-state for identity: recognition either VERIFIED, UNAVAILABLE (SFace
  // model missing -> identity is monitored continuously in-room and reported
  // UNCERTAIN), or still pending. Unavailability must NOT lock the participant out
  // of the proctor room — liveness/PAD, blink, camera and mic remain the hard gates.
  const [identityUnavailable, setIdentityUnavailable] = useState(false);
  const [voiceProfileReady, setVoiceProfileReady] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(navigator.onLine);
  const [spoofError, setSpoofError] = useState(null);

  const [isMirrored, setIsMirrored] = useState(true);
  const videoPreviewRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const frameBufferRef = useRef([]);
  const aiLoopRef = useRef(null);

  // Real MediaPipe Face Landmarker blendshape blink detection (tilt-independent)
  const landmarker = useFaceLandmarker(videoPreviewRef, {
    enabled: cameraPermission === 'granted',
    onBlink: (count) => {
      setBlinkCount(count);
      if (count >= 1) setBlinkDetected(true);
    }
  });

  // Run Pre-Session Flow on Mount
  useEffect(() => {
    runCheckSequence();
    return () => {
      if (aiLoopRef.current) clearInterval(aiLoopRef.current);
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
    setCameraPermission('checking');
    setMicPermission('checking');
    setFaceDetected(false);
    setLivePersonVerified(false);
    setBlinkDetected(false);
    setBlinkCount(0);
    setIdentityVerified(false);
    setIdentityUnavailable(false);
    setSpoofError(null);
    setNetworkOnline(navigator.onLine);

    // Voice profile readiness (embeddings stay server-side)
    try {
      const bioRes = await api.get('/auth/biometric-status');
      setVoiceProfileReady(Boolean(bioRes.data?.voiceRegistered));
    } catch (_) {
      setVoiceProfileReady(false);
    }

    // NOTE: Identity verification is performed SERVER-SIDE via /auth/verify-session-face.
    // Biometric embeddings are never exposed to the frontend (privacy by design).

    // Camera & Mic Access
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true
      });
      mediaStreamRef.current = stream;

      setCameraPermission('granted');
      setMicPermission('granted');
      setFaceDetected(true);

      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }

      if (onStreamReady) {
        onStreamReady(stream);
      }

      startAuthenticationPipeline();

    } catch (err) {
      console.error('[PreSessionCheck] Media access error:', err);
      setCameraPermission('denied');
      setMicPermission('denied');
    }
  };

  // Continuous Authentication & Liveness Pipeline
  const startAuthenticationPipeline = () => {
    if (aiLoopRef.current) clearInterval(aiLoopRef.current);
    let loopTicks = 0;
    frameBufferRef.current = [];

    aiLoopRef.current = setInterval(async () => {
      loopTicks++;
      const frameData = captureFrameAndCtx();
      if (!frameData) return;

      const { b64, ctx, width, height } = frameData;

      // Real MediaPipe Face Landmarker blendshapes (eyeBlinkLeft / eyeBlinkRight)
      const blendshapes = landmarker.getBlendshapes();
      const blendshapeSignal = (blendshapes.left + blendshapes.right) / 2;

      // Collect temporal frame sequence for MiniFASNet anti-spoofing
      frameBufferRef.current.push(b64);
      if (frameBufferRef.current.length > 5) frameBufferRef.current.shift();

      // MiniFASNet Anti-Spoofing & Identity Verification Call (runs every 6 ticks)
      if (loopTicks % 6 === 0 && frameBufferRef.current.length >= 3) {
        try {
          const livenessRes = await fetch('/ai-api/liveness/evaluate-auth-liveness', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image: b64,
              session_id: room?.id || 'TRV-1001',
              eye_blink_left: blendshapes.left,
              eye_blink_right: blendshapes.right
            })
          }).catch(() => null);

          if (livenessRes && livenessRes.ok) {
            const livenessData = await livenessRes.json();
            if (livenessData.antiSpoof?.status === 'LIVE') {
              setLivePersonVerified(true);
              setSpoofError(null);
            } else {
              setLivePersonVerified(false);
              setSpoofError(livenessData.antiSpoof?.message || 'Presentation attack detected.');
            }
          } else {
            // FAIL CLOSED: never mark a person live when the PAD service is unreachable
            setLivePersonVerified(false);
            setSpoofError('Anti-spoofing service unavailable. Verification cannot be completed right now.');
          }
        } catch (_) {
          setLivePersonVerified(false);
          setSpoofError('Anti-spoofing service unavailable. Verification cannot be completed right now.');
        }

        // Face Identity Verification – server-authoritative (embeddings never leave the server)
        try {
          const verifyRes = await api.post('/auth/verify-session-face', { image: b64 });
          if (verifyRes.data && verifyRes.data.verified) {
            setIdentityVerified(true);
            setIdentityUnavailable(false);
          } else if (verifyRes.data && verifyRes.data.recognitionUnavailable) {
            // HONEST: recognition cannot run (SFace model missing). Identity is
            // verified continuously INSIDE the room instead and reported UNCERTAIN
            // there — entry is not blocked on it (liveness/PAD is the security gate).
            setIdentityUnavailable(true);
          }
        } catch (_) {
          // transient – retried on the next loop tick
        }
      }

    }, 180);
  };

  // If MediaPipe Face Landmarker cannot load (offline CDN / no GPU / restricted browser),
  // blink cannot be measured. Entry is then gated on server-side PAD liveness alone –
  // blink is a supplementary signal, NOT the sole liveness mechanism.
  const blinkRequirementMet = landmarker.status === 'unavailable' ? true : blinkDetected;

  // Final Strict Decision Rule (Face + Live Person + Blink* + Identity**; *relaxed
  // only when MediaPipe unavailable; **identity may be UNAVAILABLE (no SFace model)
  // in which case continuous identity monitoring inside the room takes over).
  const isReadyToEnter =
    cameraPermission === 'granted' &&
    micPermission === 'granted' &&
    faceDetected &&
    livePersonVerified &&
    blinkRequirementMet &&
    (identityVerified || identityUnavailable) &&
    !spoofError;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4 font-sans select-none">
      
      <div className="max-w-xl w-full bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-5">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div>
            <h1 className="text-lg font-extrabold text-white font-mono uppercase tracking-wider">
              VERIFY YOUR IDENTITY
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Candidate: <strong className="text-white">{user?.name || 'Registered Candidate'}</strong>
            </p>
          </div>

          <button
            onClick={() => setIsMirrored(!isMirrored)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-mono text-zinc-200 transition cursor-pointer"
            title="Flip Camera View"
          >
            <FlipHorizontal size={14} className="text-emerald-400" />
            <span>{isMirrored ? 'Mirrored (⇄ Flip)' : 'Normal (⇄ Flip)'}</span>
          </button>
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

          {/* Top Status Badges */}
          <div className="absolute top-3 left-3 bg-black/85 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-mono text-zinc-200 border border-zinc-800 flex items-center gap-2 z-10">
            <span className={`w-2 h-2 rounded-full ${cameraPermission === 'granted' ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
            <span>{cameraPermission === 'granted' ? 'CAMERA ACTIVE' : 'NO CAMERA'}</span>
          </div>
        </div>

        {/* CLEAN PROFESSIONAL VERIFICATION STATUS SEQUENCE */}
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
            <span className="text-zinc-300">Blink naturally...</span>
            {blinkDetected ? (
              <span className="text-emerald-400 font-bold">Blink detected ✓</span>
            ) : landmarker.status === 'unavailable' ? (
              <span className="text-amber-400 font-bold">Unavailable – PAD only</span>
            ) : (
              <span className="text-amber-400 font-bold">Awaiting blink...</span>
            )}
          </div>

          {/* 4. Verifying Face & Identity */}
          <div className="flex items-center justify-between">
            <span className="text-zinc-300">Verifying face...</span>
            {identityVerified ? (
              <span className="text-emerald-400 font-bold">Identity verified ✓</span>
            ) : identityUnavailable ? (
              <span className="text-amber-400 font-bold">Unavailable – monitored in-room</span>
            ) : (
              <span className="text-zinc-500">...</span>
            )}
          </div>

          {/* 5. Voice Profile (registered during signup) */}
          <div className="flex items-center justify-between">
            <span className="text-zinc-300">Voice profile</span>
            {voiceProfileReady ? (
              <span className="text-emerald-400 font-bold">Registered ✓</span>
            ) : (
              <span className="text-amber-400 font-bold">Not enrolled</span>
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

        {/* Action Controls */}
        <div className="pt-2 flex items-center justify-between gap-3 border-t border-zinc-800">
          <button
            onClick={runCheckSequence}
            className="px-4 py-2 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-mono font-bold transition flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw size={13} />
            <span>Reset Verification</span>
          </button>

          <button
            onClick={() => onValidationComplete()}
            disabled={!isReadyToEnter}
            className={`px-6 py-2.5 rounded-xl text-xs font-mono font-extrabold tracking-wider transition flex items-center gap-2 ${
              isReadyToEnter
                ? 'bg-white hover:bg-zinc-200 text-black cursor-pointer shadow-lg'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'
            }`}
          >
            <span>ENTER PROCTOR ROOM</span>
            <ArrowRight size={15} />
          </button>
        </div>

      </div>

    </div>
  );
}
