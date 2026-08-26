import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, Users, MessageSquare, Info,
  ShieldAlert, AlertTriangle, X, Shield, Activity, Clock, CheckCircle2, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';
import CameraFeed from '../components/Camera/CameraFeed';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { SESSION_POLICIES } from '../utils/sessionPolicies';

const CONTEXT_OPTIONS = [
  { id: 'EXAM', label: 'Examination (Strict)' },
  { id: 'INTERVIEW', label: 'Interview (Conversational)' },
  { id: 'ONLINE_CLASS', label: 'Online Class' },
  { id: 'MEETING', label: 'Meeting' },
  { id: 'WORKPLACE', label: 'Workplace' }
];

export default function LiveMonitoring() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const paramSessionId = searchParams.get('sessionId');
  const roomId = searchParams.get('roomId');
  const roomTitle = searchParams.get('title') || 'Proctored Monitoring Session';
  const initialMode = (searchParams.get('mode') || 'EXAM').toUpperCase();

  const [isMonitoringActive, setIsMonitoringActive] = useState(false);
  const [sessionType, setSessionType] = useState(initialMode);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [terminationReason, setTerminationReason] = useState(null);
  const [engineResult, setEngineResult] = useState(null);
  const [isEnding, setIsEnding] = useState(false);
  
  // UI Controls
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const [alerts, setAlerts] = useState([]);

  const cameraFeedRef = useRef(null);
  const sessionIdRef = useRef(
    paramSessionId || `TRV-${roomId || 'SESS'}-${Date.now().toString(36).toUpperCase()}`
  );

  // Keep sessionIdRef and sessionType in sync if query params change
  if (paramSessionId && sessionIdRef.current !== paramSessionId) {
    sessionIdRef.current = paramSessionId;
  }

  const timerRef = useRef(null);
  const unifiedLoopRef = useRef(null);
  const reportGeneratedRef = useRef(false);
  const audioContextRef = useRef(null);
  const audioProcessorRef = useRef(null);
  const audioStreamRef = useRef(null);
  const audioSamplesRef = useRef([]);
  const lastSpokenRef = useRef({ time: 0, text: '' });
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const isSessionTerminatedRef = useRef(false);
  const socketRef = useRef(null);

  // Latest-frame strategy: at most ONE AI request in flight.
  const aiInFlightRef = useRef(false);
  const monitoringActiveRef = useRef(false);
  const emittedEventsRef = useRef({});

  const speakAlert = useCallback((text) => {
    if (!('speechSynthesis' in window)) return;
    const now = Date.now();
    if (lastSpokenRef.current.text === text && (now - lastSpokenRef.current.time) < 4000) return;
    if ((now - lastSpokenRef.current.time) < 2500) return;

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.volume = 1.0;
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
      lastSpokenRef.current = { time: now, text };
    } catch (_) {}
  }, []);

  // Initialize Socket.IO connection for real-time live events
  useEffect(() => {
    const token = localStorage.getItem('trueview_token');
    const socket = io({
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      auth: { token: token || undefined }
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log(`[LiveMonitoring] Connected to socket room: room_${sessionIdRef.current} (Room: ${roomId})`);
      socket.emit('join_room', {
        sessionId: sessionIdRef.current,
        roomId: roomId || undefined,
        role: 'participant',
        user: user ? { id: String(user._id || user.id), name: user.fullName || user.name, email: user.email, role: user.role } : null,
        sessionType,
        sessionDuration: 3600
      });
    });

    socket.on('SESSION_SUSPENDED', (data) => {
      setTerminationReason(data.reason || 'Session suspended by host/reviewer.');
      stopMonitoringDueToKickout();
    });

    socket.on('room_ended', (data) => {
      setTerminationReason(data.message || 'The proctoring host has concluded this session.');
      stopMonitoringDueToKickout();
    });

    return () => {
      try {
        socket.disconnect();
      } catch (_) {}
    };
  }, [sessionType, user, roomId]);

  // Session Timer
  useEffect(() => {
    if (isMonitoringActive) {
      setElapsedTime(0);
      timerRef.current = setInterval(() => setElapsedTime(prev => prev + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isMonitoringActive]);

  const formatTime = (s) => {
    const h = Math.floor(s / 3600).toString().padStart(2, '0');
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    if (s < 3600) return `${m}:${sec}`;
    return `${h}:${m}:${sec}`;
  };

  const handleTrackInterrupted = useCallback((mediaType) => {
    if (!monitoringActiveRef.current || isSessionTerminatedRef.current) return;
    const typeLabel = mediaType === 'camera' ? 'Camera' : 'Microphone';
    const eventType = mediaType === 'camera' ? 'CAMERA_INTERRUPTED' : 'MICROPHONE_INTERRUPTED';
    
    addAlert(`[${eventType}] ${typeLabel} stream interrupted. Attempting automatic recovery...`, 'danger');
    speakAlert(`Warning! ${typeLabel} stream disconnected.`);

    // Emit telemetry to proctor room
    if (socketRef.current) {
      socketRef.current.emit('proctor_alert', {
        type: eventType,
        severity: sessionType === 'EXAM' ? 'CRITICAL' : 'HIGH',
        message: `${typeLabel} stream interrupted or disabled on candidate device.`,
        confidence: 1.0,
        timestamp: new Date().toISOString()
      });
    }

    // Attempt recovery
    if (mediaType === 'camera' && cameraFeedRef.current?.startCamera) {
      cameraFeedRef.current.startCamera();
    } else if (mediaType === 'microphone') {
      startAudioCapture();
    }
  }, [sessionType]);

  const startAudioCapture = async () => {
    try {
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(t => t.stop());
        audioStreamRef.current = null;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const aTrack = stream.getAudioTracks()[0];
      if (aTrack) {
        aTrack.onended = () => {
          console.warn('[LiveMonitoring] Audio track ended.');
          handleTrackInterrupted('microphone');
        };
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => {});
      }
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      audioProcessorRef.current = processor;
      source.connect(processor);
      processor.connect(audioCtx.destination);

      processor.onaudioprocess = (e) => {
        const samples = Array.from(e.inputBuffer.getChannelData(0));
        audioSamplesRef.current = samples.slice(0, 1024);
      };
    } catch (err) {
      console.warn('[LiveMonitoring] Audio capture error:', err);
    }
  };

  const stopAudioCapture = () => {
    if (audioProcessorRef.current) { 
      try { audioProcessorRef.current.disconnect(); } catch (_) {}
      audioProcessorRef.current = null; 
    }
    if (audioContextRef.current) { 
      try { audioContextRef.current.close(); } catch (_) {}
      audioContextRef.current = null; 
    }
    if (audioStreamRef.current) {
      try { audioStreamRef.current.getTracks().forEach(t => t.stop()); } catch (_) {}
      audioStreamRef.current = null;
    }
    audioSamplesRef.current = [];
  };

  const startVideoCapture = async () => {
    try {
      if (!window.MediaRecorder) return;

      // Obtain video track directly from CameraFeed's active stream
      let videoStream = cameraFeedRef.current?.getStream?.();
      if (!videoStream || videoStream.getVideoTracks().length === 0) {
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 150));
          videoStream = cameraFeedRef.current?.getStream?.();
          if (videoStream && videoStream.getVideoTracks().length > 0) break;
        }
      }

      const videoTrack = videoStream?.getVideoTracks?.()[0];
      const audioTrack = audioStreamRef.current?.getAudioTracks?.()[0];

      if (!videoTrack) {
        console.warn('[LiveMonitoring] No active video track found for session recording.');
        return;
      }

      const combinedTracks = [videoTrack];
      if (audioTrack) combinedTracks.push(audioTrack);
      const combinedStream = new MediaStream(combinedTracks);
      recordedChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : (MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : ''));

      const options = {
        mimeType: mimeType || undefined,
        videoBitsPerSecond: 1500000
      };

      const recorder = new MediaRecorder(combinedStream, options);
      
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstart = () => {
        console.log(`[LiveMonitoring] MediaRecorder started: ${recorder.mimeType || mimeType}`);
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
    } catch (err) {
      console.warn('[LiveMonitoring] MediaRecorder initialization warning:', err);
    }
  };

  const stopVideoCapture = async () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        if (recorder.state === 'recording') {
          recorder.requestData();
        }
        await new Promise((resolve) => {
          recorder.onstop = resolve;
          recorder.stop();
        });
      } catch (err) {
        console.warn('[LiveMonitoring] MediaRecorder stop error:', err);
      }
    }

    if (recordedChunksRef.current.length > 0) {
      try {
        const mime = recorder?.mimeType || 'video/webm';
        const blob = new Blob(recordedChunksRef.current, { type: mime });
        console.log(`[LiveMonitoring] Assembled recording Blob: ${blob.size} bytes (${recordedChunksRef.current.length} chunks)`);
        
        if (blob.size > 0) {
          const res = await fetch(`/api/ai-engine/sessions/${sessionIdRef.current}/recording`, {
            method: 'POST',
            headers: { 
              'Content-Type': mime,
              'Authorization': `Bearer ${localStorage.getItem('trueview_token') || ''}`
            },
            body: blob
          });
          const resData = await res.json().catch(() => ({}));
          console.log('[LiveMonitoring] Recording upload result:', resData);
        }
      } catch (uploadErr) {
        console.error('[LiveMonitoring] Recording upload failed:', uploadErr);
      } finally {
        recordedChunksRef.current = [];
      }
    }
  };

  // Generate the report from recorded alerts
  const generateHostReport = async () => {
    if (reportGeneratedRef.current) return;
    reportGeneratedRef.current = true;
    try {
      await api.post('/reports/generate', { sessionId: sessionIdRef.current });
    } catch (_) {}
  };

  const stopMonitoringDueToKickout = async () => {
    if (isSessionTerminatedRef.current) return;
    isSessionTerminatedRef.current = true;
    setIsEnding(true);

    monitoringActiveRef.current = false;
    if (unifiedLoopRef.current) clearTimeout(unifiedLoopRef.current);
    
    await stopVideoCapture();
    stopAudioCapture();
    if (cameraFeedRef.current?.stopCamera) {
      cameraFeedRef.current.stopCamera();
    }
    if (socketRef.current) {
      try { socketRef.current.disconnect(); } catch (_) {}
    }

    // Complete session in MongoDB
    try {
      await api.post(`/ai-engine/sessions/${sessionIdRef.current}/end`);
    } catch (_) {}

    await generateHostReport();

    // Leave room if roomId exists
    if (roomId) {
      try {
        await api.post(`/rooms/${roomId}/leave`);
      } catch (_) {}
    }

    await fetch(`/ai-api/ai/session/${sessionIdRef.current}/stop`, { method: 'POST' }).catch(() => {});
    setIsMonitoringActive(false);
    setIsEnding(false);
  };

  const addAlert = (msg, type) => {
    setAlerts(prev => {
      if (prev.length > 0 && prev[0].msg === msg && (Date.now() - prev[0].time) < 3000) return prev;
      return [{ id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, msg, type, time: Date.now() }, ...prev].slice(0, 50);
    });
  };

  const startMeeting = async () => {
    isSessionTerminatedRef.current = false;
    reportGeneratedRef.current = false;
    setAlerts([]);

    const userId = user ? String(user._id || user.id) : 'candidate_01';

    // Start AI service session via server-side authoritative route with registered face embeddings
    try {
      await api.post('/auth/ai-session-start', {
        sessionId: sessionIdRef.current,
        sessionType: sessionType
      });
    } catch (e) {
      console.warn('[LiveMonitoring] ai-session-start via backend warning:', e.message);
      // Direct AI service fallback
      await fetch('/ai-api/ai/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionIdRef.current,
          user_id: userId,
          session_type: sessionType
        })
      }).catch(() => {});
    }

    startAudioCapture();
    startVideoCapture();
    setIsMonitoringActive(true);
    monitoringActiveRef.current = true;

    // Latest-frame loop: one in-flight request at a time, reschedule after each iteration
    const scheduleNext = (delay = 100) => {
      if (!monitoringActiveRef.current) return;
      unifiedLoopRef.current = setTimeout(runIteration, delay);
    };

    const runIteration = async () => {
      if (!monitoringActiveRef.current) return;
      if (aiInFlightRef.current) {
        scheduleNext(60);
        return;
      }

      const frame = cameraFeedRef.current?.captureFrameBase64();
      const samples = audioSamplesRef.current;
      if (!frame) {
        scheduleNext();
        return;
      }

      aiInFlightRef.current = true;
      const captureTs = Date.now();

      try {
        const res = await fetch(`/ai-api/ai/session/${sessionIdRef.current}/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionIdRef.current,
            user_id: userId,
            session_type: sessionType,
            video_frame: frame,
            audio_samples: samples.length ? samples : null,
            timestamp: Date.now() / 1000.0,
            capture_timestamp: captureTs / 1000.0,
          })
        });

        const data = await res.json();
        if (res.ok && data) {
          setEngineResult(data);

          let shouldKickout = false;
          let kickoutReason = '';

          if (data.decision?.action === 'SUSPEND_SESSION' || (sessionType === 'EXAM' && data.risk?.score > 85)) {
             shouldKickout = true;
             kickoutReason = data.decision?.reasons?.[0] || 'High risk threshold reached in strict exam mode. Session suspended.';
          }

          // Emit alerts + persist ONLY on event state transitions (dedup).
          let hasNewEvents = false;
          if (data.behaviour?.events?.length) {
            data.behaviour.events.forEach(evt => {
              const evtState = String(evt.state || 'CONFIRMED').toUpperCase();
              if (emittedEventsRef.current[evt.type] === evtState) return;
              if (evtState === 'RESOLVED') emittedEventsRef.current = {};
              emittedEventsRef.current[evt.type] = evtState;
              hasNewEvents = true;

              addAlert(`[${evt.type.replace(/_/g, ' ')}] ${evt.evidence}`, evt.severity === 'CRITICAL' ? 'danger' : 'warning');
              
              // Spoken voice warnings for participant
              if (evt.type === 'IDENTITY_MISMATCH') {
                speakAlert("Warning! Registered candidate face not detected.");
              } else if (evt.type === 'PHONE_DETECTED') {
                speakAlert("Warning! Mobile phone detected in camera view.");
              } else if (evt.type === 'MULTIPLE_PERSONS' && sessionType === 'EXAM') {
                speakAlert("Warning! Multiple persons detected in the room.");
              } else if (evt.type === 'PROLONGED_DISTRACTION' && sessionType === 'EXAM') {
                speakAlert("Warning! Please focus directly on your screen.");
              } else if (evt.type === 'SPOOF_DETECTED' || evt.type === 'LIVENESS_FAILED') {
                speakAlert("Warning! Presentation attack detected. Live face required.");
              } else if (evt.type === 'USER_ABSENT') {
                speakAlert("Warning! Please stay in the camera view.");
              } else if (evt.severity === 'CRITICAL') {
                speakAlert(`Warning! ${evt.type.replace(/_/g, ' ')}`);
              }

              // Emit through socket to admin/reviewer and proctor room
              if (socketRef.current?.connected) {
                const eventPayload = {
                  sessionId: sessionIdRef.current,
                  roomId: roomId || undefined,
                  eventType: evt.type,
                  type: evt.type,
                  severity: evt.severity,
                  confidence: evt.confidence || 0.9,
                  evidence: evt.evidence,
                  timestamp: new Date().toISOString(),
                  captureTimestamp: captureTs,
                };
                socketRef.current.emit('ai_event', eventPayload);
                socketRef.current.emit('AI_EVENT', eventPayload);
                socketRef.current.emit('proctor_alert', eventPayload);
              }
            });
          }

          // Persist to the backend on new events or periodically
          if (hasNewEvents) {
            fetch('/api/ai-engine/log', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('trueview_token')}`
              },
              body: JSON.stringify({
                ...data,
                session_id: sessionIdRef.current,
                user_id: userId,
                session_type: sessionType,
                roomId: roomId || undefined,
                roomTitle: roomTitle || undefined
              })
            }).catch(() => {});
          }

          if (shouldKickout) {
            if ('speechSynthesis' in window) {
              window.speechSynthesis.cancel();
              const utterance = new SpeechSynthesisUtterance("Session terminated due to high risk score and rule violations.");
              utterance.volume = 1.0;
              window.speechSynthesis.speak(utterance);
            }
            setTerminationReason(kickoutReason);
            await stopMonitoringDueToKickout();
          }
        }
      } catch (_) {}
      finally {
        aiInFlightRef.current = false;
        scheduleNext();
      }
    };

    scheduleNext(100);
  };

  // Start meeting automatically on mount
  useEffect(() => {
    if (!isMonitoringActive && !terminationReason) {
      startMeeting();
    }
    return () => {
      stopMonitoringDueToKickout();
    };
  }, []);

  const handleEndSessionManual = async () => {
    if (window.confirm("Are you sure you want to end this proctoring session? Telemetry, recording, and report will be saved.")) {
      await stopMonitoringDueToKickout();
      navigate('/sessions');
    }
  };

  const currentPolicy = SESSION_POLICIES[sessionType] || SESSION_POLICIES.EXAM;
  const allowMediaToggle = currentPolicy?.allowMediaToggle === true;

  const riskScoreVal = Math.round(engineResult?.risk?.score ?? engineResult?.risk?.current ?? 0);
  const isLivenessLive = engineResult?.liveness?.is_live !== false && engineResult?.liveness?.status !== 'spoof';

  const rawIdentStatus = engineResult?.identity?.status || (engineResult?.identity?.verified ? 'VERIFIED' : (engineResult?.attention?.status === 'USER_ABSENT' ? 'FACE_NOT_DETECTED' : 'UNKNOWN'));
  const isIdentityMismatch = rawIdentStatus === 'IDENTITY_MISMATCH' || rawIdentStatus === 'POSSIBLE_USER_REPLACEMENT' || rawIdentStatus === 'MISMATCH';
  const isIdentityVerified = rawIdentStatus === 'IDENTITY_VERIFIED' || rawIdentStatus === 'IDENTITY_CONSISTENT' || rawIdentStatus === 'VERIFIED' || Boolean(engineResult?.identity?.verified);
  const isFaceNotDetected = rawIdentStatus === 'FACE_NOT_DETECTED' || engineResult?.attention?.status === 'USER_ABSENT';
  const identityNote = engineResult?.identity?.note;

  return (
    <div className="fixed inset-0 z-50 bg-[#202124] text-white flex flex-col font-sans overflow-hidden">
      
      {/* Termination Modal Overlay */}
      {terminationReason && (
        <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-[#2b2d31] border border-[#3f4147] rounded-2xl shadow-2xl max-w-md w-full p-8 text-center space-y-6">
            <div className="w-20 h-20 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
              <PhoneOff size={40} />
            </div>
            <div>
              <h2 className="text-2xl font-normal text-white mb-3">Session Terminated</h2>
              <p className="text-gray-400 font-normal leading-relaxed">{terminationReason}</p>
            </div>
            <button 
              onClick={() => navigate('/sessions')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-8 rounded-lg transition-colors"
            >
              View in My Sessions
            </button>
          </div>
        </div>
      )}

      {/* Top Participant Status Header */}
      <header className="h-14 min-h-[56px] max-h-[56px] bg-[#1a1b1e] border-b border-[#2d2f34] px-6 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse" />
            <span className="font-extrabold tracking-widest text-xs font-mono text-white">TRUEVIEW AI</span>
          </div>

          <div className="h-4 w-px bg-zinc-700 mx-1" />

          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-white truncate max-w-xs md:max-w-md">
              {roomTitle}
            </h2>
            <span className="text-[10px] font-mono text-zinc-400">({sessionIdRef.current})</span>
            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 font-mono font-bold text-[10px] rounded uppercase border border-emerald-500/30">
              {sessionType} MODE
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-2 px-3 py-1 bg-black/40 rounded-lg border border-white/5">
            <span className="text-zinc-400">STATUS:</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              MONITORING
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-black/40 rounded-lg border border-white/5">
            <span className="text-zinc-400">AI STATUS:</span>
            <span className="text-white font-bold flex items-center gap-1">
              <CheckCircle2 size={12} className="text-emerald-400" /> Operational
            </span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1 bg-black/40 rounded-lg border border-white/5 font-mono">
            <Clock size={12} className="text-emerald-400" />
            <span className="text-white font-bold">{formatTime(elapsedTime)}</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 relative flex overflow-hidden min-h-0">
        
        {/* Main Video Area */}
        <div className={`flex-1 p-4 flex items-center justify-center transition-all duration-300 ${isSidebarOpen ? 'mr-80' : ''}`}>
          <div className="w-full h-full max-w-6xl relative bg-[#3c4043] rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center group border border-[#5f6368]/30">
            
            {isCamOn ? (
              <CameraFeed
                ref={cameraFeedRef}
                isMonitoringActive={isMonitoringActive}
                onDetectionUpdate={(data) => {
                  if (data?.trackInterrupted) {
                    handleTrackInterrupted('camera');
                  }
                }}
              />
            ) : (
              <div className="w-32 h-32 rounded-full bg-blue-600 flex items-center justify-center text-4xl font-normal text-white shadow-lg">
                {(user?.fullName || user?.name || 'C').charAt(0).toUpperCase()}
              </div>
            )}

            {/* Video Status Overlays */}
            <div className="absolute top-4 left-4 flex flex-col gap-2 z-20">
              <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg flex items-center gap-2 border border-white/10">
                <span className={`w-2 h-2 rounded-full ${isLivenessLive ? 'bg-emerald-400' : 'bg-rose-400'} animate-pulse`}></span>
                <span className="text-xs font-semibold text-white tracking-wide">
                  Liveness: <strong className={isLivenessLive ? 'text-emerald-400' : 'text-rose-400'}>{isLivenessLive ? 'LIVE' : 'SPOOF'}</strong>
                </span>
              </div>

              <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg flex items-center gap-2 border border-white/10">
                <Shield size={12} className={isIdentityMismatch ? 'text-rose-400' : isIdentityVerified ? 'text-emerald-400' : 'text-amber-400'} />
                <span className="text-xs font-semibold text-white tracking-wide">
                  Identity: <strong className={isIdentityMismatch ? 'text-rose-400 font-bold' : isIdentityVerified ? 'text-emerald-400' : isFaceNotDetected ? 'text-zinc-400' : 'text-amber-400'}>
                    {isIdentityMismatch ? 'MISMATCH' : isIdentityVerified ? 'VERIFIED' : isFaceNotDetected ? 'NOT DETECTED' : 'UNKNOWN'}
                  </strong>
                </span>
              </div>
            </div>

            {/* Prominent Identity Mismatch Warning Banner */}
            {isIdentityMismatch && (
              <div className="absolute inset-x-4 top-20 z-30 bg-rose-600/95 border border-rose-400 rounded-xl p-3 shadow-2xl flex items-center justify-center gap-3 text-white text-center animate-pulse">
                <ShieldAlert size={22} className="text-white shrink-0" />
                <div className="text-xs sm:text-sm font-bold tracking-wide">
                  IDENTITY MISMATCH — REGISTERED CANDIDATE NOT DETECTED
                </div>
              </div>
            )}

            {/* Risk and Violation Overlays */}
            <div className="absolute top-4 right-4 flex flex-col items-end gap-2 z-20">
              <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2 text-xs text-white">
                <Shield size={12} className={riskScoreVal > 50 ? "text-rose-400" : "text-emerald-400"} />
                Risk: <span className={`font-bold ${riskScoreVal > 50 ? 'text-rose-400' : riskScoreVal > 20 ? 'text-amber-400' : 'text-emerald-400'}`}>{riskScoreVal}/100</span>
                <span className="text-[10px] text-zinc-400">({engineResult?.risk?.level || 'NORMAL'})</span>
              </div>

              {engineResult?.environment?.phone_detected && (
                <div className="bg-rose-600/90 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-rose-400/50 flex items-center gap-2 text-[11px] font-bold text-white shadow-lg animate-bounce">
                  <PhoneOff size={13} /> Phone Detected
                </div>
              )}

              {engineResult?.environment?.person_count > 1 && (
                <div className="bg-amber-600/90 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-amber-400/50 flex items-center gap-2 text-[11px] font-bold text-white shadow-lg">
                  <Users size={13} /> Multiple Persons ({engineResult.environment.person_count})
                </div>
              )}
            </div>

            {/* Bottom Floating Bar */}
            <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between z-20">
              <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg flex items-center gap-2 border border-white/10">
                {!isMicOn && <MicOff size={16} className="text-red-500" />}
                <span className="text-xs font-semibold text-white">{user?.fullName || user?.name || 'Candidate (You)'}</span>
              </div>

              {engineResult && (
                <div className="bg-black/70 backdrop-blur-md px-4 py-2 rounded-xl border border-white/15 flex items-center gap-3 text-xs text-gray-200 shadow-xl">
                  <span>Face: <b className={isFaceNotDetected ? "text-rose-400" : "text-emerald-400"}>
                    {isFaceNotDetected ? 'Not Detected' : 'Detected'}
                  </b></span>
                  <div className="w-px h-3 bg-zinc-600" />
                  <span>Identity: <b className={isIdentityMismatch ? 'text-rose-400' : isIdentityVerified ? 'text-emerald-400' : 'text-amber-400'}>
                    {isIdentityMismatch ? 'MISMATCH' : isIdentityVerified ? 'VERIFIED' : 'UNKNOWN'}
                  </b></span>
                  <div className="w-px h-3 bg-zinc-600" />
                  <span>Gaze: <b className="text-white capitalize">{engineResult.attention?.gaze || 'Center'}</b></span>
                  <div className="w-px h-3 bg-zinc-600" />
                  <span>Pose: <b className="text-white">{engineResult.attention?.head_pose || 'Straight'}</b></span>
                  {engineResult.audio?.speaking && (
                    <>
                      <div className="w-px h-3 bg-zinc-600" />
                      <span className="text-amber-300 font-semibold flex items-center gap-1">
                        <Activity size={12} /> Speaking
                      </span>
                    </>
                  )}
                  {engineResult.performance?.latency_ms > 0 && (
                    <>
                      <div className="w-px h-3 bg-zinc-600" />
                      <span className="text-zinc-400 text-[10px]">{Math.round(engineResult.performance.latency_ms)}ms</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Collapsible Sidebar for AI Alerts */}
        <AnimatePresence>
          {isSidebarOpen && (
            <motion.div
              initial={{ x: 320 }}
              animate={{ x: 0 }}
              exit={{ x: 320 }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="absolute right-0 top-0 bottom-0 w-80 bg-[#2b2d31] border-l border-[#3f4147] flex flex-col shadow-2xl z-40"
            >
              <div className="p-4 border-b border-[#3f4147] flex items-center justify-between shrink-0">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <ShieldAlert size={16} className="text-blue-400" />
                  Live Event Telemetry ({alerts.length})
                </h3>
                <button 
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-1 hover:bg-[#3f4147] rounded-md text-gray-400 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {alerts.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-3">
                    <ShieldAlert size={32} className="opacity-50" />
                    <p className="text-xs font-semibold">No violations detected</p>
                    <p className="text-[10px] text-gray-500 text-center max-w-[200px]">Active AI monitoring gaze, pose, liveness, objects, and speech.</p>
                  </div>
                ) : (
                  alerts.map(alert => (
                    <motion.div 
                      key={alert.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-3 rounded-lg border text-xs shadow-sm ${
                        alert.type === 'danger' 
                          ? 'bg-rose-500/15 border-rose-500/40 text-rose-200' 
                          : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                        <span className="font-semibold">{alert.msg}</span>
                      </div>
                      <div className="text-[10px] text-gray-400 mt-2 flex justify-end font-mono">
                        {new Date(alert.time).toLocaleTimeString()}
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Control Bar */}
      <div className="h-20 bg-[#202124] px-6 flex items-center justify-between shrink-0 z-50">
        
        {/* Left: Time and Info */}
        <div className="flex items-center gap-4 w-64">
          <span className="text-sm font-bold text-white font-mono">{formatTime(elapsedTime)}</span>
          <div className="w-px h-5 bg-[#5f6368]"></div>
          <span className="text-xs text-zinc-300 font-semibold">
            {sessionType} Mode Active
          </span>
        </div>

        {/* Center: Primary Controls */}
        <div className="flex items-center gap-3">
          {allowMediaToggle && (
            <>
              <button 
                onClick={() => setIsMicOn(!isMicOn)}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                  isMicOn ? 'bg-[#3c4043] hover:bg-[#4a4d51] text-white' : 'bg-[#ea4335] hover:bg-[#d93025] text-white'
                }`}
                title={isMicOn ? "Mute Microphone" : "Unmute Microphone"}
              >
                {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
              </button>

              <button 
                onClick={() => setIsCamOn(!isCamOn)}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                  isCamOn ? 'bg-[#3c4043] hover:bg-[#4a4d51] text-white' : 'bg-[#ea4335] hover:bg-[#d93025] text-white'
                }`}
                title={isCamOn ? "Turn Camera Off" : "Turn Camera On"}
              >
                {isCamOn ? <Video size={20} /> : <VideoOff size={20} />}
              </button>
            </>
          )}

          <button 
            onClick={handleEndSessionManual}
            disabled={isEnding}
            className="h-11 rounded-full bg-[#ea4335] hover:bg-[#d93025] text-white flex items-center justify-center transition-colors shadow-lg px-6 gap-2 text-xs font-bold disabled:opacity-50 cursor-pointer"
            title="End Proctoring Session"
          >
            {isEnding ? <RefreshCw size={16} className="animate-spin" /> : <PhoneOff size={18} />}
            <span>{isEnding ? 'Finalizing Session...' : 'End Session'}</span>
          </button>
        </div>

        {/* Right: Secondary Controls */}
        <div className="flex items-center justify-end gap-3 w-64 text-[#9aa0a6]">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`p-2.5 rounded-full transition-colors relative ${isSidebarOpen ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-[#3c4043]'}`}
            title="Toggle Event Telemetry Sidebar"
          >
            <ShieldAlert size={20} />
            {alerts.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full border border-[#202124]"></span>
            )}
          </button>
        </div>
      </div>
      
    </div>
  );
}
