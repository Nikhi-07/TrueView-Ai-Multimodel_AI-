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
import toast from 'react-hot-toast';
import { SESSION_POLICIES } from '../utils/sessionPolicies';
import useTabSwitchVerification from '../hooks/useTabSwitchVerification';
import TabSwitchIndicator from '../components/Monitoring/TabSwitchIndicator';

const CONTEXT_OPTIONS = [
  { id: 'EXAM', label: 'Examination (Moderate)' },
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
  const [socketRisk, setSocketRisk] = useState(null);

  const cameraFeedRef = useRef(null);
  const sessionIdRef = useRef(
    paramSessionId || `TRV-${roomId || 'SESS'}-${Date.now().toString(36).toUpperCase()}`
  );

  // Keep sessionIdRef and sessionType in sync if query params change
  if (paramSessionId && sessionIdRef.current !== paramSessionId) {
    sessionIdRef.current = paramSessionId;
  }

  // Expose active session ID and room ID for TrueView browser extension integration
  useEffect(() => {
    if (sessionIdRef.current) {
      window.__TRUEVIEW_SESSION_ID__ = sessionIdRef.current;
      localStorage.setItem('trueview_current_session_id', sessionIdRef.current);
    }
    if (roomId) {
      window.__TRUEVIEW_ROOM_ID__ = roomId;
      localStorage.setItem('trueview_current_room_id', roomId);
    }
  }, [paramSessionId, roomId]);

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

  // Frame scheduler & latest-frame buffer (Requirements 3, 4, 15)
  const latestFrameBufferRef = useRef(null);
  const inferenceRunningRef = useRef(false);
  const inferenceSeqRef = useRef(0);
  const latestProcessedSeqRef = useRef(0);
  const frameSamplerIntervalRef = useRef(null);

  // Performance telemetry & timing instrumentation (Requirements 1, 13, 14)
  const completedInferencesRef = useRef([]);
  const lastSocketTelemetryEmitRef = useRef(0);
  const [showPerfDetails, setShowPerfDetails] = useState(false);
  const [pipelineMetrics, setPipelineMetrics] = useState({
    cameraFps: 30,
    aiFps: 0,
    inferenceLatency: 0,
    decisionLatency: 0,
    uiLatency: 0,
    endToEndLatency: 0,
    p95Latency: 0,
    health: 'LIVE',
  });

  const recordTimingMetric = useCallback((sample) => {
    const now = performance.now();
    completedInferencesRef.current.push({ ...sample, ts: now });
    if (completedInferencesRef.current.length > 30) {
      completedInferencesRef.current.shift();
    }

    const recent = completedInferencesRef.current;
    const windowStart = now - 2000;
    const windowSamples = recent.filter(s => s.ts >= windowStart);
    const aiFps = windowSamples.length > 1 
      ? Math.round((windowSamples.length * 1000) / (now - windowSamples[0].ts))
      : Math.round(windowSamples.length / 2);

    const sortedLatencies = [...recent.map(s => s.inferenceLatency)].sort((a, b) => a - b);
    const avgLatency = sortedLatencies.length ? Math.round(sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length) : 0;
    const p95Idx = Math.min(sortedLatencies.length - 1, Math.floor(sortedLatencies.length * 0.95));
    const p95Latency = sortedLatencies[p95Idx] || avgLatency;

    const cameraFps = cameraFeedRef.current?.getCameraFps?.() || 30;

    let health = 'HEALTHY';
    if (avgLatency > 220 || (aiFps > 0 && aiFps < 5)) health = 'THROTTLED';
    else if (avgLatency > 400 || (aiFps > 0 && aiFps < 3)) health = 'DEGRADED';

    setPipelineMetrics({
      cameraFps,
      aiFps,
      inferenceLatency: sample.inferenceLatency,
      decisionLatency: sample.decisionLatency,
      uiLatency: sample.uiLatency,
      endToEndLatency: sample.endToEndLatency,
      p95Latency,
      health,
    });
  }, []);

  // Recover existing session alerts and state on page refresh
  useEffect(() => {
    const fetchExistingSession = async () => {
      try {
        const res = await api.get(`/ai-engine/sessions/${sessionIdRef.current}`);
        const loadedAlerts = res.data?.alerts || res.data?.session?.alerts;
        if (loadedAlerts?.length) {
          setAlerts(loadedAlerts.map(a => ({
            id: a.eventId || a.id || a._id || `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            title: (a.eventType || a.type || 'Violation').replace(/_/g, ' '),
            msg: a.description || a.evidence || a.message || `AI detected ${a.eventType || a.type}`,
            type: a.severity === 'CRITICAL' || a.severity === 'HIGH' ? 'danger' : 'warning',
            severity: a.severity || 'HIGH',
            confidence: a.confidence,
            time: a.timestamp ? new Date(a.timestamp).getTime() : Date.now(),
          })));
        }
      } catch (_) {}
    };
    fetchExistingSession();
  }, []);

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

  // Authoritative Tab Switch Verification Hook
  const handleTabSwitchTerminated = useCallback(async (reason) => {
    const termReason = reason || 'Maximum tab-switch limit exceeded';
    setTerminationReason(termReason);
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance("Session terminated. Maximum tab switch limit exceeded.");
        utterance.volume = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch (_) {}
    }
    await stopMonitoringDueToKickout();
  }, []);

  const {
    tabSwitchCount,
    maxAllowed: maxTabSwitches,
    tabSwitchStatus,
    lastEventTime: tabSwitchLastTime,
    isTerminated: isTabTerminated,
    currentWarning: tabWarning,
    clearWarning: clearTabWarning,
    resetTabSwitches,
    isMonitoringInitialized,
  } = useTabSwitchVerification({
    sessionId: sessionIdRef.current,
    roomId: roomId || undefined,
    studentId: user?._id || user?.id || undefined,
    enabled: isMonitoringActive && !isSessionTerminatedRef.current && isCamOn,
    maxAllowed: 3,
    minHiddenDurationMs: 500,
    gracePeriodMs: 2500,
    onTerminated: handleTabSwitchTerminated,
  });

  // Audio voice alerts on tab switch warnings
  useEffect(() => {
    if (tabWarning) {
      if (tabWarning.count === 1) {
        speakAlert("Tab switch detected. Please return to the examination window.");
      } else if (tabWarning.count === 2) {
        speakAlert("Tab switch detected. Warning 2 of 3.");
      } else if (tabWarning.count === 3) {
        speakAlert("Final warning. Warning 3 of 3. One more tab switch will terminate your session.");
      }
    }
  }, [tabWarning, speakAlert]);

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
      const joinPayload = {
        sessionId: sessionIdRef.current,
        roomId: roomId || undefined,
        role: 'participant',
        user: user ? { id: String(user._id || user.id), name: user.fullName || user.name, email: user.email, role: user.role } : null,
        sessionType,
        sessionDuration: 3600
      };
      socket.emit('ROOM_JOIN', joinPayload);
      socket.emit('join_room', joinPayload);
      socket.emit('join-session', { sessionId: sessionIdRef.current, roomId: roomId || undefined });
    });

    socket.on('session_state', (state) => {
      if (state?.alerts?.length) {
        setAlerts(state.alerts.map(a => ({
          id: a.eventId || a.id || `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          title: (a.eventType || a.type || 'Violation').replace(/_/g, ' '),
          msg: a.description || a.evidence || a.message || `AI detected ${a.eventType || a.type}`,
          type: a.severity === 'CRITICAL' || a.severity === 'HIGH' ? 'danger' : 'warning',
          severity: a.severity || 'HIGH',
          confidence: a.confidence,
          time: a.timestamp ? new Date(a.timestamp).getTime() : Date.now(),
        })));
      }
      if (state?.trustScore != null) {
        setSocketRisk(Math.max(0, 100 - state.trustScore));
      }
    });

    const handleIncomingAlert = (eventData) => {
      if (!eventData) return;
      const evtType = eventData.eventType || eventData.type || '';
      const state = String(eventData.state || eventData.status || '').toUpperCase();
      if (state === 'RESOLVED' || state === 'CLEARED') return;

      const rawSev = String(eventData.severity || 'HIGH').toUpperCase();
      const isDanger = rawSev === 'CRITICAL' || rawSev === 'HIGH';
      const newAlertItem = {
        id: eventData.id || eventData.eventId || `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        title: evtType.replace(/_/g, ' '),
        msg: eventData.message || eventData.description || eventData.evidence || `AI detected ${evtType.replace(/_/g, ' ')}`,
        type: isDanger ? 'danger' : 'warning',
        severity: rawSev,
        confidence: eventData.confidence,
        time: eventData.timestamp ? new Date(eventData.timestamp).getTime() : Date.now(),
      };
      setAlerts(prev => {
        if (prev.some(a => a.id === newAlertItem.id || (a.title === newAlertItem.title && Math.abs(a.time - newAlertItem.time) < 2000))) {
          return prev;
        }
        return [newAlertItem, ...prev].slice(0, 50);
      });
      if (eventData.riskScore != null) {
        setSocketRisk(eventData.riskScore);
      }
    };

    socket.on('proctor:event', handleIncomingAlert);
    socket.on('proctor_alert', handleIncomingAlert);
    socket.on('AI_EVENT', handleIncomingAlert);
    socket.on('ALERT_CREATED', handleIncomingAlert);

    socket.on('TRUST_SCORE_UPDATED', (data) => {
      if (data?.trustScore != null) {
        setSocketRisk(Math.max(0, 100 - data.trustScore));
      }
    });

    socket.on('RISK_SCORE_UPDATED', (data) => {
      if (data?.riskScore != null) {
        setSocketRisk(data.riskScore);
      }
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

      // Reuse existing active audio track from CameraFeed if available
      let stream = null;
      const cameraStream = cameraFeedRef.current?.getStream?.();
      const existingAudio = cameraStream?.getAudioTracks?.().find(t => t.readyState === 'live');

      if (existingAudio) {
        stream = new MediaStream([existingAudio]);
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
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
      await api.post('/reports/generate', { 
        sessionId: sessionIdRef.current,
        roomId: roomId || undefined,
        userName: user?.fullName || user?.name,
        userEmail: user?.email,
      });
    } catch (_) {}
  };

  const showCameraDisabledToast = useCallback(() => {
    toast.success(
      () => (
        <div className="flex flex-col gap-0.5">
          <span className="font-bold text-xs text-white">Camera turned off</span>
          <span className="text-[11px] text-zinc-300">
            Camera has been disabled after leaving the monitoring room.
          </span>
        </div>
      ),
      {
        id: 'camera-disabled-security-toast',
        duration: 4500,
        icon: '🔒',
        style: {
          background: '#18181b',
          color: '#f4f4f5',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '0.75rem',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
          padding: '10px 14px',
        }
      }
    );
  }, []);

  // Immediately and synchronously release all hardware tracks, media, timers, and sockets
  const releaseAllMediaResources = useCallback(() => {
    // 1. Immediately stop camera feed and hardware tracks
    if (cameraFeedRef.current?.stopCamera) {
      try {
        cameraFeedRef.current.stopCamera();
      } catch (_) {}
    }

    // 2. Immediately stop audio capture and audio context
    stopAudioCapture();

    // 3. Stop media recorder if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (_) {}
      mediaRecorderRef.current = null;
    }

    // 4. Cancel AI processing loops and timers
    monitoringActiveRef.current = false;
    aiInFlightRef.current = false;
    inferenceRunningRef.current = false;
    latestFrameBufferRef.current = null;
    if (frameSamplerIntervalRef.current) {
      clearInterval(frameSamplerIntervalRef.current);
      frameSamplerIntervalRef.current = null;
    }
    if (unifiedLoopRef.current) {
      clearTimeout(unifiedLoopRef.current);
      unifiedLoopRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // 5. Cancel any ongoing speech synthesis
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }

    // 6. Cleanly notify room and disconnect socket
    if (socketRef.current) {
      try {
        if (socketRef.current.connected) {
          socketRef.current.emit('MONITORING_STOPPED', {
            roomId: roomId || undefined,
            sessionId: sessionIdRef.current,
            candidateId: user ? String(user._id || user.id) : undefined,
          });
          socketRef.current.emit('ROOM_LEAVE', {
            roomId: roomId || undefined,
            sessionId: sessionIdRef.current,
            candidateId: user ? String(user._id || user.id) : undefined,
          });
          socketRef.current.emit('leave_room', {
            roomId: roomId || undefined,
            sessionId: sessionIdRef.current,
            candidateId: user ? String(user._id || user.id) : undefined,
          });
        }
        socketRef.current.disconnect();
      } catch (_) {}
      socketRef.current = null;
    }
  }, []);

  const stopMonitoringDueToKickout = async () => {
    if (isSessionTerminatedRef.current) return;
    isSessionTerminatedRef.current = true;
    setIsEnding(true);

    // Stop all media streams and hardware tracks synchronously and immediately
    releaseAllMediaResources();
    await stopVideoCapture();

    // Complete session in MongoDB
    try {
      await api.post(`/ai-engine/sessions/${sessionIdRef.current}/end`, {
        roomId: roomId || undefined,
      });
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

  const addAlert = (itemOrMsg, type = 'warning') => {
    setAlerts(prev => {
      let item;
      if (typeof itemOrMsg === 'object' && itemOrMsg !== null) {
        item = {
          id: itemOrMsg.id || `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          title: itemOrMsg.title || itemOrMsg.msg || 'Violation Detected',
          msg: itemOrMsg.msg || itemOrMsg.message || itemOrMsg.evidence || 'Violation Detected',
          type: itemOrMsg.type || (itemOrMsg.severity === 'CRITICAL' || itemOrMsg.severity === 'HIGH' ? 'danger' : 'warning'),
          severity: itemOrMsg.severity || (itemOrMsg.type === 'danger' ? 'HIGH' : 'MEDIUM'),
          confidence: itemOrMsg.confidence,
          time: itemOrMsg.time || Date.now(),
        };
      } else {
        item = {
          id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          title: String(itemOrMsg || '').replace(/^\[(.*?)\]/, '$1').trim() || 'Alert',
          msg: String(itemOrMsg || ''),
          type,
          severity: type === 'danger' ? 'HIGH' : 'MEDIUM',
          time: Date.now(),
        };
      }
      if (prev.length > 0 && prev[0].msg === item.msg && (Date.now() - prev[0].time) < 3000) return prev;
      return [item, ...prev].slice(0, 50);
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

    // Emit authoritative MONITORING_STARTED event to virtual room
    if (socketRef.current?.connected) {
      socketRef.current.emit('MONITORING_STARTED', {
        roomId: roomId || undefined,
        sessionId: sessionIdRef.current,
        candidateId: user ? String(user._id || user.id) : undefined,
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // HIGH-EFFICIENCY LATEST-FRAME DETECTION PIPELINE (Requirements 2, 3, 4, 12, 15)
    // ──────────────────────────────────────────────────────────────────────────

    // 1. Independent Frame Sampler: captures latest frame at ~15 FPS (every 66ms)
    // Decoupled from camera rendering. Never queues up frames; only keeps the newest frame.
    const startFrameSampler = () => {
      if (frameSamplerIntervalRef.current) clearInterval(frameSamplerIntervalRef.current);

      frameSamplerIntervalRef.current = setInterval(() => {
        if (!monitoringActiveRef.current || isSessionTerminatedRef.current) return;

        // Capture downscaled 640px JPEG frame with reused canvas (zero DOM thrashing)
        const frame = cameraFeedRef.current?.captureFrameBase64?.(640, 0.65);
        if (!frame) return;

        const captureTs = performance.now();
        const seq = ++inferenceSeqRef.current;
        const samples = audioSamplesRef.current;

        // Requirement 4 & 15: Buffer ONLY the latest frame. Intermediate unconsumed frames are discarded.
        latestFrameBufferRef.current = {
          frame,
          captureTs,
          audioSamples: samples && samples.length ? samples : null,
          seq,
        };

        // Trigger consumer worker if not already processing
        if (!inferenceRunningRef.current) {
          processLatestFrameWorker();
        }
      }, 66); // ~15 FPS sampling
    };

    // 2. Latest-Frame Consumer Worker (Processes latest frame, never creates backlog)
    const processLatestFrameWorker = async () => {
      if (inferenceRunningRef.current || !monitoringActiveRef.current) return;
      inferenceRunningRef.current = true;

      try {
        while (latestFrameBufferRef.current && monitoringActiveRef.current) {
          // Atomically grab newest available frame and clear buffer
          const frameData = latestFrameBufferRef.current;
          latestFrameBufferRef.current = null;

          await runInference(frameData);
        }
      } finally {
        inferenceRunningRef.current = false;
      }
    };

    // 3. Inference Execution with Sequence Check & Immediate Alert Reflection
    const runInference = async (frameData) => {
      const { frame, captureTs, audioSamples, seq } = frameData;
      const tInferenceStart = performance.now();

      try {
        const res = await fetch(`/ai-api/ai/session/${sessionIdRef.current}/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionIdRef.current,
            user_id: userId,
            session_type: sessionType,
            video_frame: frame,
            audio_samples: audioSamples,
            timestamp: Date.now() / 1000.0,
            capture_timestamp: captureTs / 1000.0,
          })
        });

        const tInferenceEnd = performance.now();
        const inferenceLatency = Math.round(tInferenceEnd - tInferenceStart);

        // Requirement 12: Ignore out-of-order results
        if (seq < latestProcessedSeqRef.current) {
          return;
        }
        latestProcessedSeqRef.current = seq;

        const data = await res.json();
        if (!res.ok || !data) return;

        const tUiStart = performance.now();

        // 1. FAST ALERT REFLECTION (Requirement 9): Immediate UI Update + Immediate Socket.IO Dispatch
        let hasNewEvents = false;
        if (data.behaviour?.events?.length) {
          data.behaviour.events.forEach(evt => {
            const evtState = String(evt.state || 'CONFIRMED').toUpperCase();

            // In MODERATE mode: ignore internal observations or events in cooldown
            if (evt.should_alert === false || evt.in_cooldown === true) return;
            if (evtState === 'OBSERVING' || evtState === 'COOLDOWN') return;

            if (emittedEventsRef.current[evt.type] === evtState) return;
            if (evtState === 'RESOLVED') {
              delete emittedEventsRef.current[evt.type];
            } else {
              emittedEventsRef.current[evt.type] = evtState;
            }
            hasNewEvents = true;

            // Immediate candidate alert list update
            if (evtState !== 'RESOLVED') {
              const isCritOrHigh = evt.severity === 'CRITICAL' || evt.severity === 'HIGH';
              addAlert({
                id: evt.id || evt.event_id || `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                title: evt.type ? evt.type.replace(/_/g, ' ') : 'Violation Detected',
                msg: evt.message || evt.evidence || `AI detected ${evt.type}`,
                type: isCritOrHigh ? 'danger' : 'warning',
                severity: evt.severity || 'MEDIUM',
                confidence: evt.confidence,
                duration: evt.duration,
                time: Date.now()
              });
            }

            // Spoken voice warnings for participant
            if (evt.type === 'IDENTITY_MISMATCH' || evt.type === 'POSSIBLE_USER_REPLACEMENT') {
              speakAlert("Warning! Registered candidate face not detected.");
            } else if (evt.type === 'PHONE_DETECTED' || evt.type === 'MOBILE_PHONE_DETECTED') {
              speakAlert("Warning! Mobile phone detected in camera view.");
            } else if ((evt.type === 'MULTIPLE_PERSONS' || evt.type === 'MULTIPLE_PEOPLE_DETECTED') && sessionType === 'EXAM') {
              speakAlert("Warning! Multiple persons detected in the room.");
            } else if ((evt.type === 'PROLONGED_DISTRACTION' || evt.type === 'OFFSCREEN_GLANCE') && sessionType === 'EXAM') {
              speakAlert("Warning! Please focus directly on your screen.");
            } else if (evt.type === 'EYES_CLOSED' && sessionType === 'EXAM') {
              speakAlert("Warning! Candidate eyes appear closed.");
            } else if (evt.type === 'HEAD_TURNED' && sessionType === 'EXAM') {
              speakAlert("Warning! Please face the camera directly.");
            } else if (evt.type === 'SPOOF_DETECTED' || evt.type === 'LIVENESS_FAILED') {
              speakAlert("Warning! Presentation attack detected. Live face required.");
            } else if (evt.type === 'USER_ABSENT') {
              speakAlert("Warning! Please stay in the camera view.");
            } else if (evt.severity === 'CRITICAL') {
              speakAlert(`Warning! ${evt.type.replace(/_/g, ' ')}`);
            }

            // Immediate Socket.IO dispatch to Proctor Dashboard
            if (socketRef.current?.connected) {
              const eventPayload = {
                id: evt.id || evt.event_id || `evt_${Date.now()}`,
                sessionId: sessionIdRef.current,
                roomId: roomId || undefined,
                eventType: evt.type,
                type: evt.type,
                category: evt.category || 'BEHAVIOUR',
                source: evt.source || 'AI_ENGINE',
                severity: evt.severity,
                confidence: evt.confidence || 0.9,
                evidence: evt.evidence,
                message: evt.message || evt.evidence,
                description: evt.message || evt.evidence,
                state: evt.state || 'CONFIRMED',
                should_alert: evt.should_alert,
                in_cooldown: evt.in_cooldown,
                duration: evt.duration,
                timestamp: new Date().toISOString(),
                captureTimestamp: captureTs,
                endToEndLatencyMs: Math.round(performance.now() - captureTs),
              };
              socketRef.current.emit('ai_event', eventPayload);
              socketRef.current.emit('AI_EVENT', eventPayload);
              socketRef.current.emit('ALERT_CREATED', eventPayload);
              socketRef.current.emit('proctor:event', eventPayload);
              socketRef.current.emit('proctor_alert', eventPayload);
            }
          });
        }

        // 2. Throttled Socket.IO telemetry for continuous score updates (Requirement 7)
        const nowMs = Date.now();
        if (socketRef.current?.connected && (nowMs - lastSocketTelemetryEmitRef.current >= 200)) {
          lastSocketTelemetryEmitRef.current = nowMs;
          socketRef.current.emit('telemetry_update', {
            sessionId: sessionIdRef.current,
            roomId: roomId || undefined,
            riskScore: Math.round(data.risk?.score ?? data.risk?.current ?? 0),
            attentionScore: Math.round(data.attention?.score ?? 90),
            liveness: data.liveness?.status,
            identity: data.identity?.status,
            timestamp: nowMs,
          });
        }

        // 3. Immediate State Update
        setEngineResult(data);

        // 4. Session Suspension Evaluation
        if (data.decision?.action === 'SUSPEND_SESSION' || (sessionType === 'EXAM' && data.risk?.score > 85)) {
          const kickoutReason = data.decision?.reasons?.[0] || 'High risk threshold reached in strict exam mode. Session suspended.';
          if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance("Session terminated due to high risk score and rule violations.");
            utterance.volume = 1.0;
            window.speechSynthesis.speak(utterance);
          }
          setTerminationReason(kickoutReason);
          await stopMonitoringDueToKickout();
        }

        // 5. Asynchronous Background Logging (Non-blocking fire-and-forget)
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

        const tUiEnd = performance.now();
        const uiLatency = Math.round(tUiEnd - tUiStart);
        const decisionLatency = data.performance?.latency_breakdown?.decision || 0;
        const endToEndLatency = Math.round(performance.now() - captureTs);

        // 6. Record Timing Metrics for Performance Indicator
        recordTimingMetric({
          inferenceLatency,
          decisionLatency,
          uiLatency,
          endToEndLatency,
        });

      } catch (_) {}
    };

    // Start frame sampler
    startFrameSampler();
  };

  const isMountedRef = useRef(true);

  // Start meeting automatically on mount, attach unload listeners, and guarantee cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    if (!isMonitoringActive && !terminationReason) {
      startMeeting();
    }

    const handleWindowUnload = () => {
      releaseAllMediaResources();
    };
    window.addEventListener('beforeunload', handleWindowUnload);
    window.addEventListener('pagehide', handleWindowUnload);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('beforeunload', handleWindowUnload);
      window.removeEventListener('pagehide', handleWindowUnload);
      
      // Delay unmount teardown slightly to handle React 18 Strict Mode immediate remount
      setTimeout(() => {
        if (!isMountedRef.current) {
          if (roomId) {
            api.post(`/rooms/${roomId}/leave`, {
              candidateId: user?._id || user?.id,
              sessionId: sessionIdRef.current,
            }).catch(() => {});
          }
          releaseAllMediaResources();
          showCameraDisabledToast();
          stopMonitoringDueToKickout();
        }
      }, 50);
    };
  }, [releaseAllMediaResources, showCameraDisabledToast, roomId, user]);

  const handleEndSessionManual = async () => {
    if (window.confirm("Are you sure you want to end this proctoring session? Telemetry, recording, and report will be saved.")) {
      if (socketRef.current?.connected) {
        socketRef.current.emit('leave_room', {
          roomId: roomId || undefined,
          sessionId: sessionIdRef.current,
          candidateId: user?._id || user?.id,
          user: user ? { id: String(user._id || user.id), name: user.fullName || user.name } : null
        });
      }
      if (roomId) {
        try {
          await api.post(`/rooms/${roomId}/leave`, {
            candidateId: user?._id || user?.id,
            sessionId: sessionIdRef.current,
          });
        } catch (_) {}
      }
      releaseAllMediaResources();
      showCameraDisabledToast();
      await stopMonitoringDueToKickout();
      navigate('/sessions');
    }
  };

  const currentPolicy = SESSION_POLICIES[sessionType] || SESSION_POLICIES.EXAM;
  const allowMediaToggle = currentPolicy?.allowMediaToggle === true;

  const engineRisk = Math.round(engineResult?.risk?.score ?? engineResult?.risk?.current ?? 0);
  const riskScoreVal = Math.max(engineRisk, socketRisk ?? 0);
  const isLivenessLive = engineResult?.liveness?.is_live !== false && engineResult?.liveness?.status !== 'spoof';

  const rawIdentStatus = engineResult?.identity?.status || (engineResult?.identity?.verified ? 'VERIFIED' : (engineResult?.attention?.status === 'USER_ABSENT' ? 'FACE_NOT_DETECTED' : 'UNKNOWN'));
  const isIdentityMismatch = rawIdentStatus === 'IDENTITY_MISMATCH' || rawIdentStatus === 'POSSIBLE_USER_REPLACEMENT' || rawIdentStatus === 'MISMATCH';
  const isIdentityVerified = rawIdentStatus === 'IDENTITY_VERIFIED' || rawIdentStatus === 'IDENTITY_CONSISTENT' || rawIdentStatus === 'VERIFIED' || Boolean(engineResult?.identity?.verified);
  const isFaceNotDetected = rawIdentStatus === 'FACE_NOT_DETECTED' || engineResult?.attention?.status === 'USER_ABSENT';
  const identityNote = engineResult?.identity?.note;

  return (
    <div className="fixed inset-0 z-50 bg-[#202124] text-white flex flex-col font-sans overflow-hidden">
      
      {/* Termination Modal Overlay */}
      {(terminationReason || isTabTerminated) && (
        <div className="absolute inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-[#2b2d31] border border-rose-500/40 rounded-2xl shadow-2xl max-w-md w-full p-8 text-center space-y-6">
            <div className="w-20 h-20 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto border border-rose-500/30">
              <PhoneOff size={40} />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-mono font-bold mb-3">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                SECURITY TERMINATION
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Session Terminated</h2>
              <p className="text-gray-300 text-sm font-normal leading-relaxed">
                {isTabTerminated ? 'Maximum tab-switch limit exceeded.' : (terminationReason || 'Session terminated due to security policy.')}
              </p>
              <div className="mt-3 p-3 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-zinc-300">
                Tab Switches:{' '}
                {isTabTerminated || tabSwitchCount >= maxTabSwitches ? (
                  <strong className="text-rose-400 font-bold">{tabSwitchCount} / {maxTabSwitches} (Exceeded)</strong>
                ) : (
                  <strong className="text-emerald-400 font-bold">{tabSwitchCount} / {maxTabSwitches} (Normal)</strong>
                )}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button 
                onClick={async () => {
                  if (resetTabSwitches) await resetTabSwitches();
                  setTerminationReason(null);
                  isSessionTerminatedRef.current = false;
                  startMeeting();
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 px-4 rounded-xl transition-colors cursor-pointer text-xs flex items-center justify-center gap-1.5"
              >
                <RefreshCw size={13} />
                Reset & Resume Session
              </button>
              <button 
                onClick={() => navigate('/sessions')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-xl transition-colors cursor-pointer text-xs"
              >
                View in My Sessions
              </button>
              <button 
                onClick={() => navigate('/reports')}
                className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-medium py-2.5 px-4 rounded-xl transition-colors cursor-pointer text-xs"
              >
                View Reports
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Warning Banner for Tab Switch Violations (Warnings 1, 2, 3) */}
      {tabWarning && !isTabTerminated && !terminationReason && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 max-w-md w-full mx-auto px-4">
          <div className={`p-4 rounded-2xl border shadow-2xl backdrop-blur-md flex items-start gap-3 animate-bounce ${
            tabWarning.count === 3 ? 'bg-rose-950/95 border-rose-500 text-white' : 'bg-amber-950/95 border-amber-500 text-white'
          }`}>
            <AlertTriangle size={24} className={tabWarning.count === 3 ? 'text-rose-300 shrink-0' : 'text-amber-300 shrink-0'} />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm">{tabWarning.title}</h4>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-black/40">
                  {tabWarning.count} / 3
                </span>
              </div>
              <p className="text-xs mt-1 text-slate-200">{tabWarning.text}</p>
            </div>
            <button onClick={clearTabWarning} className="text-white/60 hover:text-white text-xs font-bold px-2 py-1 cursor-pointer">
              ✕
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
          {/* Header Tab Switch Indicator */}
          <TabSwitchIndicator
            count={tabSwitchCount}
            maxAllowed={maxTabSwitches}
            status={tabSwitchStatus}
            mode={sessionType}
            compact={true}
          />

          <div className="flex items-center gap-3 px-3 py-1 bg-black/40 rounded-lg border border-white/5">
            <span className="text-emerald-400 font-bold flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              MONITORING
            </span>
            <span className="text-zinc-600">|</span>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-zinc-400">Mode:</span>
              <span className="text-sky-400 font-mono font-bold">MODERATE</span>
            </div>
            <span className="text-zinc-600">|</span>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-zinc-400">Risk:</span>
              <span className={`font-mono font-bold ${riskScoreVal > 60 ? 'text-rose-400' : riskScoreVal > 30 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {riskScoreVal} / 100
              </span>
            </div>
          </div>

          {/* Small Developer / Pipeline Performance Indicator (Requirement 14) */}
          <div className="relative">
            <button
              onClick={() => setShowPerfDetails(prev => !prev)}
              className="hidden sm:flex items-center gap-2 px-3 py-1 bg-black/40 hover:bg-black/60 rounded-lg border border-white/10 text-xs font-mono transition-all cursor-pointer"
              title="Click to view real-time latency & FPS breakdown"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="text-zinc-400">AI:</span>
              <span className="font-bold text-white">{pipelineMetrics.aiFps || 10} FPS</span>
              <span className="text-zinc-600">|</span>
              <span className="text-sky-300 font-bold">{pipelineMetrics.inferenceLatency || 75}ms</span>
              <span className="text-zinc-600">|</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                pipelineMetrics.health === 'HEALTHY' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
              }`}>
                {pipelineMetrics.health}
              </span>
            </button>

            {/* Expandable Detailed Performance Flyout */}
            {showPerfDetails && (
              <div className="absolute right-0 top-10 mt-1 w-72 bg-zinc-900/95 backdrop-blur-md border border-white/15 rounded-xl shadow-2xl p-3 z-50 text-xs space-y-2 font-mono">
                <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                  <span className="font-bold text-white text-[11px] flex items-center gap-1.5">
                    <Activity size={13} className="text-emerald-400" />
                    PIPELINE TELEMETRY
                  </span>
                  <button 
                    onClick={() => setShowPerfDetails(false)}
                    className="text-zinc-400 hover:text-white px-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Camera Native:</span>
                    <span className="text-white font-bold">{pipelineMetrics.cameraFps} FPS</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">AI Inference:</span>
                    <span className="text-emerald-400 font-bold">{pipelineMetrics.aiFps} FPS</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Inference Latency:</span>
                    <span className="text-sky-300 font-bold">{pipelineMetrics.inferenceLatency} ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">P95 Latency:</span>
                    <span className="text-sky-400">{pipelineMetrics.p95Latency} ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Decision Engine:</span>
                    <span className="text-purple-300">{pipelineMetrics.decisionLatency} ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">UI State Update:</span>
                    <span className="text-amber-300">{pipelineMetrics.uiLatency} ms</span>
                  </div>
                  <div className="flex justify-between border-t border-white/10 pt-1">
                    <span className="text-zinc-300 font-bold">End-to-End:</span>
                    <span className="text-emerald-300 font-bold">{pipelineMetrics.endToEndLatency} ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Frame Backlog:</span>
                    <span className="text-emerald-400 font-bold">0 (Latest-Frame)</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 px-3 py-1 bg-black/40 rounded-lg border border-white/5 font-mono">
            <Clock size={12} className="text-emerald-400" />
            <span className="text-white font-bold">{formatTime(elapsedTime)}</span>
          </div>

          <button
            onClick={handleEndSessionManual}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 active:bg-rose-500/30 text-rose-300 hover:text-white border border-rose-500/30 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
            title="Leave / Exit Monitoring Room"
          >
            <PhoneOff size={13} />
            <span className="hidden sm:inline">Leave Room</span>
          </button>
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
                isActive={isCamOn}
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

            {/* Floating Examination / Interview HUD Tab Switch Indicator */}
            <div className="absolute top-20 left-4 z-20 max-w-xs pointer-events-auto">
              <div className={`p-3 rounded-xl border backdrop-blur-md shadow-lg text-white transition-all ${
                tabSwitchCount >= 4
                  ? 'bg-rose-950/85 border-rose-500/50'
                  : tabSwitchCount === 3
                  ? 'bg-rose-950/85 border-rose-500/50 animate-pulse'
                  : tabSwitchCount > 0
                  ? 'bg-amber-950/85 border-amber-500/50'
                  : 'bg-black/70 border-white/10'
              }`}>
                <div className="flex items-center justify-between text-[10.5px] font-mono font-bold uppercase tracking-wider text-zinc-300 mb-1.5 gap-2">
                  <span>TAB SWITCH VERIFICATION</span>
                  <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${
                    tabSwitchCount >= 4 ? 'bg-rose-600 text-white' : tabSwitchCount === 3 ? 'bg-rose-500/30 text-rose-300' : tabSwitchCount > 0 ? 'bg-amber-500/30 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                  }`}>
                    {tabSwitchCount >= 4 ? 'TERMINATED' : tabSwitchStatus}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-zinc-400">{sessionType === 'EXAM' ? 'Warnings:' : 'Tab Switches:'}</span>
                  <span className={`font-extrabold ${tabSwitchCount >= 4 ? 'text-rose-400' : tabSwitchCount === 3 ? 'text-rose-400' : tabSwitchCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {tabSwitchCount} / {maxTabSwitches}
                  </span>
                </div>
                {tabSwitchCount > 0 && tabSwitchCount < 4 && (
                  <p className="text-[10px] text-amber-300 mt-1.5 border-t border-white/10 pt-1">
                    {tabSwitchCount === 3 ? 'Final warning: One more tab switch will terminate your session.' : 'Return to examination window.'}
                  </p>
                )}
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
              <div className="bg-black/75 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10 flex flex-col gap-1 text-xs text-white shadow-lg min-w-[130px]">
                <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1">
                  <span className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider">MONITORING</span>
                  <span className="text-[10px] font-bold text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">MODERATE</span>
                </div>
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <span className="text-[11px] text-zinc-300">Risk:</span>
                  <span className={`font-bold font-mono ${riskScoreVal > 60 ? 'text-rose-400' : riskScoreVal > 30 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {riskScoreVal} / 100
                  </span>
                </div>
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

              {/* Sidebar Tab Switch Verification Status */}
              <div className="p-3 border-b border-[#3f4147] bg-[#232428]">
                <TabSwitchIndicator
                  count={tabSwitchCount}
                  maxAllowed={maxTabSwitches}
                  status={tabSwitchStatus}
                  lastEventTime={tabSwitchLastTime}
                  mode={sessionType}
                />
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
                        alert.type === 'danger' || alert.severity === 'CRITICAL' || alert.severity === 'HIGH'
                          ? 'bg-rose-500/15 border-rose-500/40 text-rose-200' 
                          : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                          <div>
                            <span className="font-semibold block">{alert.title || alert.msg}</span>
                            {alert.title && alert.msg && alert.title !== alert.msg && !alert.msg.startsWith(`[${alert.title}]`) && (
                              <p className="text-[11px] text-zinc-300 mt-0.5">{alert.msg}</p>
                            )}
                          </div>
                        </div>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold uppercase shrink-0 ${
                          alert.severity === 'CRITICAL' || alert.severity === 'HIGH' || alert.type === 'danger'
                            ? 'bg-rose-500/30 text-rose-300'
                            : 'bg-amber-500/30 text-amber-300'
                        }`}>
                          {alert.severity || (alert.type === 'danger' ? 'HIGH' : 'MEDIUM')}
                        </span>
                      </div>
                      {alert.confidence != null && (
                        <div className="text-[10px] text-zinc-400 mt-1.5 font-mono">
                          Confidence: {Math.round(alert.confidence <= 1 ? alert.confidence * 100 : alert.confidence)}%
                        </div>
                      )}
                      <div className="text-[10px] text-gray-400 mt-1 flex justify-end font-mono">
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
