import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

// Socket.IO server URL resolution:
//   1. Explicit VITE_SOCKET_URL env var (production/deployed setups)
//   2. Same-origin in production builds
//   3. Vite dev proxy (empty string) or localhost:5000 fallback in development
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.PROD
    ? window.location.origin
    : (window.location.origin.includes('5173') ? '' : 'http://localhost:5000'));

export default function useProctorSocket({ sessionId, role = 'participant', user, sessionType, sessionDuration }) {
  const [isConnected, setIsConnected] = useState(false);
  const [sessionState, setSessionState] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [trustScore, setTrustScore] = useState(100);
  const [livenessChallenge, setLivenessChallenge] = useState(null);
  const [officialWarning, setOfficialWarning] = useState(null);
  const [timerWarning, setTimerWarning] = useState(null);
  const [serverClock, setServerClock] = useState({ serverNow: Date.now(), endTime: null, startedAt: null, sessionDuration: 0 });

  const socketRef = useRef(null);
  // Keep join config in a ref so a reconnect can re-join the room automatically.
  const joinConfigRef = useRef({ sessionId, role, user, sessionType, sessionDuration });
  joinConfigRef.current = { sessionId, role, user, sessionType, sessionDuration };

  useEffect(() => {
    if (!sessionId) return;

    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      auth: { token: localStorage.getItem('trueview_token') || undefined },
    });
    socketRef.current = socket;

    // Fires on initial connect AND every successful reconnect.
    const handleConnect = () => {
      console.log(`[useProctorSocket] Connected to server: ${socket.id}`);
      setIsConnected(true);
      const cfg = joinConfigRef.current;
      socket.emit('join_room', {
        sessionId: cfg.sessionId,
        role: cfg.role,
        user: cfg.user,
        sessionType: cfg.sessionType,
        sessionDuration: cfg.sessionDuration,
      });
    };

    socket.on('connect', handleConnect);
    socket.on('reconnect', handleConnect);

    socket.on('disconnect', () => {
      console.warn('[useProctorSocket] Disconnected from server');
      setIsConnected(false);
    });

    socket.on('session_state', (state) => {
      setSessionState(state);
      setTrustScore(state.trustScore || 100);
      if (state.alerts) setAlerts(state.alerts);
      if (state.serverNow) {
        setServerClock(prev => ({
          ...prev,
          serverNow: state.serverNow,
          endTime: state.endTime ?? prev.endTime,
          startedAt: state.startedAt ?? prev.startedAt,
          sessionDuration: state.sessionDuration ?? prev.sessionDuration,
        }));
      }
    });

    // Server-authoritative timer sync (browser clocks are never trusted)
    socket.on('SESSION_TIMER_SYNC', (data) => {
      setServerClock({
        serverNow: data.serverNow ?? Date.now(),
        endTime: data.endTime ?? null,
        startedAt: data.startedAt ?? null,
        sessionDuration: data.sessionDuration ?? 0,
      });
    });

    socket.on('SESSION_TIMER_UPDATE', (data) => {
      setServerClock(prev => ({ ...prev, serverNow: data.serverNow, endTime: data.endTime }));
    });

    socket.on('SESSION_TIMER_WARNING', (data) => {
      setTimerWarning(data);
      setTimeout(() => setTimerWarning(null), 60000);
    });

    socket.on('SESSION_STARTED', ({ session }) => {
      setSessionState(prev => ({ ...prev, ...session, status: 'LIVE' }));
    });

    socket.on('SESSION_STATE_CHANGED', ({ status, session }) => {
      setSessionState(prev => ({ ...prev, ...(session || {}), status }));
    });

    // Keep the participant roster fresh so reviewer/participant UI reflects who is
    // actually connected (e.g. "NO PARTICIPANT CONNECTED" must clear once a
    // participant joins AFTER the reviewer).
    socket.on('room_participants_updated', ({ participants }) => {
      setSessionState(prev => ({ ...prev, participants: participants || [] }));
    });

    // Bounded live alert buffer: the reviewer timeline keeps the last MAX_LIVE_ALERTS
    // events in memory (full history is persisted server-side). Prevents unbounded
    // React state growth during long sessions.
    const MAX_LIVE_ALERTS = 300;
    const pushAlert = (prev, newAlert) => {
      if (!newAlert || !newAlert.eventId) return prev;
      if (prev.some(a => a.eventId === newAlert.eventId)) return prev;
      const next = [newAlert, ...prev];
      return next.length > MAX_LIVE_ALERTS ? next.slice(0, MAX_LIVE_ALERTS) : next;
    };

    // Stamp the client-received time on every live alert so the performance panel
    // can measure server->socket->UI latency end to end (Section 3 of the spec).
    const stampReceived = (alert) => ({ ...alert, clientReceivedTimestamp: Date.now() });

    socket.on('AI_EVENT', (newAlert) => {
      setAlerts(prev => pushAlert(prev, stampReceived(newAlert)));
    });

    socket.on('ALERT_CREATED', (newAlert) => {
      setAlerts(prev => pushAlert(prev, stampReceived(newAlert)));
    });

    socket.on('TRUST_SCORE_UPDATED', ({ trustScore: newScore }) => {
      setTrustScore(newScore);
    });

    socket.on('SESSION_SUSPENDED', ({ session, reason, message }) => {
      setSessionState(prev => ({ ...prev, ...(session || {}), status: 'SUSPENDED', suspensionReason: reason }));
    });

    socket.on('SESSION_RESUMED', ({ session }) => {
      setSessionState(prev => ({ ...prev, ...(session || {}), status: 'LIVE', suspensionReason: null }));
    });

    socket.on('SESSION_COMPLETED', ({ session }) => {
      setSessionState(prev => ({ ...prev, ...(session || {}), status: 'COMPLETED' }));
    });

    socket.on('LIVENESS_CHALLENGE_REQUESTED', (data) => {
      setLivenessChallenge(data);
      setTimeout(() => setLivenessChallenge(null), 10000);
    });

    socket.on('OFFICIAL_WARNING_ISSUED', (data) => {
      setOfficialWarning(data);
      setTimeout(() => setOfficialWarning(null), 8000);
    });

    return () => {
      socket.disconnect();
    };
  }, [sessionId]);

  const emitMediaStatus = useCallback((deviceType, status, reason) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('update_media_status', { sessionId, deviceType, status, reason });
    }
  }, [sessionId, isConnected]);

  const emitAIEvent = useCallback((eventData) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('ai_event', { sessionId, ...eventData });
    }
  }, [sessionId, isConnected]);

  const emitReviewerCommand = useCallback((command, payload) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('reviewer_command', { sessionId, command, payload });
    }
  }, [sessionId, isConnected]);

  const startSession = useCallback((durationSeconds) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('start_session', { sessionId, sessionDuration: durationSeconds });
    }
  }, [sessionId, isConnected]);

  // WebRTC signaling helpers (server relays only to authorized reviewers)
  const subscribeStream = useCallback(() => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('subscribe_stream', { sessionId });
    }
  }, [sessionId, isConnected]);

  const emitWebRTCSignal = useCallback((target, signal) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('webrtc_signal', { sessionId, target, signal });
    }
  }, [sessionId, isConnected]);

  return {
    socket: socketRef.current,
    isConnected,
    sessionState,
    alerts,
    trustScore,
    livenessChallenge,
    officialWarning,
    timerWarning,
    serverClock,
    emitMediaStatus,
    emitAIEvent,
    emitReviewerCommand,
    startSession,
    subscribeStream,
    emitWebRTCSignal,
  };
}
