import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  Shield, Video, Users, Search, RefreshCw, AlertCircle, AlertTriangle, 
  CheckCircle2, Clock, ArrowLeft, ExternalLink, FileText, Eye, Activity, 
  Check, Copy, Share2, ChevronRight, Wifi, Bell, User, StopCircle, Radio,
  Maximize2, Minimize2, Link, ShieldCheck, X, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import PageHeader from '../components/Cards/PageHeader';
import ParticipantDetailModal from '../components/Modals/ParticipantDetailModal';
import ReportDetailModal from '../components/Modals/ReportDetailModal';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function ProctorDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedRoomId = searchParams.get('roomId');
  const { user } = useAuth();

  // Overview Data State
  const [rooms, setRooms] = useState([]);
  const [allAlerts, setAllAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'ENDED'
  const [toastMsg, setToastMsg] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  // Selected Room Monitoring State
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [roomNotFound, setRoomNotFound] = useState(false);
  const [roomForbidden, setRoomForbidden] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [roomLoading, setRoomLoading] = useState(false);
  const [endingRoom, setEndingRoom] = useState(false);

  // Top Action & Toolbar State
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showEndExamModal, setShowEndExamModal] = useState(false);
  const [copiedTopLink, setCopiedTopLink] = useState(false);
  const [copiedMonitoringLink, setCopiedMonitoringLink] = useState(false);

  // Real-time Connection State
  const [isConnected, setIsConnected] = useState(false);

  // Modals State
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [isParticipantModalOpen, setIsParticipantModalOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const socketRef = useRef(null);
  const processedAlertsRef = useRef(new Set());
  const selectedRoomIdRef = useRef(selectedRoomId);

  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);

  // Listen to browser fullscreen changes (Esc key, browser buttons, etc.)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement || document.webkitFullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // 1. Fetch overview rooms & alerts and initialize persistent socket on mount
  useEffect(() => {
    fetchOverviewData();
    setupDashboardSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // 2. Fetch specific room & join room channel when selectedRoomId changes
  useEffect(() => {
    if (selectedRoomId) {
      fetchSelectedRoom(selectedRoomId);
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('ROOM_JOIN', {
          roomId: selectedRoomId,
          sessionId: selectedRoomId,
          role: 'reviewer',
          user: user ? { id: String(user._id || user.id), name: user.fullName || user.name, role: user.role } : null,
        });
        socketRef.current.emit('join_room', {
          roomId: selectedRoomId,
          sessionId: selectedRoomId,
          role: 'reviewer',
          user: user ? { id: String(user._id || user.id), name: user.fullName || user.name, role: user.role } : null,
        });
        socketRef.current.emit('join-session', {
          roomId: selectedRoomId,
          sessionId: selectedRoomId,
        });
      }
    } else {
      setSelectedRoom(null);
      setRoomNotFound(false);
      setParticipants([]);
      setLiveAlerts([]);
    }
  }, [selectedRoomId]);

  const showNotification = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const fetchOverviewData = async () => {
    setLoading(true);
    try {
      const [roomsRes, alertsRes] = await Promise.allSettled([
        api.get('/rooms'),
        api.get('/alerts')
      ]);

      if (roomsRes.status === 'fulfilled' && roomsRes.value.data?.success) {
        setRooms(roomsRes.value.data.rooms || []);
      }
      if (alertsRes.status === 'fulfilled' && alertsRes.value.data?.success) {
        setAllAlerts(alertsRes.value.data.alerts || []);
      }
    } catch (err) {
      console.warn('[ProctorDashboard] Overview fetch notice:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSelectedRoom = async (roomId) => {
    if (!roomId) return;
    setRoomLoading(true);
    setRoomNotFound(false);
    setRoomForbidden(false);
    try {
      const [roomRes, alertsRes] = await Promise.allSettled([
        api.get(`/rooms/${roomId}`),
        api.get('/alerts')
      ]);

      let currentRoom = null;
      if (roomRes.status === 'fulfilled' && roomRes.value.data?.success && roomRes.value.data.room) {
        currentRoom = roomRes.value.data.room;
        setSelectedRoom(currentRoom);
        const roomParticipants = Array.isArray(currentRoom.participants) ? currentRoom.participants : [];
        setParticipants(roomParticipants);
      } else {
        if (roomRes.status === 'rejected' && roomRes.reason?.response?.status === 403) {
          setSelectedRoom(null);
          setRoomForbidden(true);
          return;
        }
        // Fallback: check overview rooms list cache
        const cached = rooms.find(r => (r.roomId || r.id)?.toUpperCase() === roomId?.toUpperCase());
        if (cached) {
          currentRoom = cached;
          setSelectedRoom(cached);
          setParticipants(Array.isArray(cached.participants) ? cached.participants : []);
        } else {
          setSelectedRoom(null);
          setRoomNotFound(true);
        }
      }

      // Filter historical alerts strictly belonging to this room
      if (alertsRes.status === 'fulfilled' && alertsRes.value.data?.success) {
        const fetchedAlerts = alertsRes.value.data.alerts || [];
        const participantSessionIds = new Set(
          (currentRoom?.participants || []).map(p => p.sessionId).filter(Boolean)
        );

        const roomSpecificAlerts = fetchedAlerts.filter(a => {
          if (a.roomId && a.roomId.toUpperCase() === roomId.toUpperCase()) return true;
          if (a.sessionId && (a.sessionId.toUpperCase().includes(roomId.toUpperCase()) || participantSessionIds.has(a.sessionId))) return true;
          return false;
        }).map(a => {
          const type = a.type || a.eventType || 'AI_ALERT';
          return {
            id: a.eventId || a._id || `hist_${Math.random()}`,
            candidateName: a.userName || a.candidateName || 'Candidate',
            candidateId: a.participantId || a.candidateId,
            sessionId: a.sessionId,
            type,
            severity: String(a.severity || 'MEDIUM').toUpperCase(),
            riskScore: a.riskScore || 0,
            message: a.evidence || a.description || a.message || `AI detected ${type.replace(/_/g, ' ')}`,
            timestamp: a.timestamp ? new Date(a.timestamp) : new Date(),
            status: a.status || (a.resolved ? 'RESOLVED' : 'ACTIVE'),
          };
        });

        setLiveAlerts(roomSpecificAlerts);
      }
    } catch (err) {
      console.warn('[ProctorDashboard] Room detail fetch notice:', err);
      if (!selectedRoom) {
        const cached = rooms.find(r => (r.roomId || r.id)?.toUpperCase() === roomId?.toUpperCase());
        if (cached) {
          setSelectedRoom(cached);
          setParticipants(Array.isArray(cached.participants) ? cached.participants : []);
        } else {
          setRoomNotFound(true);
        }
      }
    } finally {
      setRoomLoading(false);
    }
  };

  const setupDashboardSocket = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    const token = localStorage.getItem('trueview_token');
    const socket = io({
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      auth: { token: token || undefined },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log(`[ProctorDashboard] Connected to Socket.IO as client ${socket.id}`);
      setIsConnected(true);
      const uId = user ? String(user._id || user.id) : null;
      socket.emit('subscribe_user_dashboard', { userId: uId });

      const currentRoomId = selectedRoomIdRef.current;
      if (currentRoomId) {
        socket.emit('ROOM_JOIN', {
          roomId: currentRoomId,
          sessionId: currentRoomId,
          role: 'reviewer',
          user: user ? { id: String(user._id || user.id), name: user.fullName || user.name, role: user.role } : null,
        });
        socket.emit('join_room', {
          roomId: currentRoomId,
          sessionId: currentRoomId,
          role: 'reviewer',
          user: user ? { id: String(user._id || user.id), name: user.fullName || user.name, role: user.role } : null,
        });
        socket.emit('join-session', {
          roomId: currentRoomId,
          sessionId: currentRoomId,
        });
        fetchSelectedRoom(currentRoomId);
      }
      fetchOverviewData();
    });

    socket.on('disconnect', () => {
      console.warn('[ProctorDashboard] Socket disconnected from server');
      setIsConnected(false);
    });

    socket.on('connect_error', () => {
      setIsConnected(false);
    });

    socket.on('reconnect', () => {
      console.log('[ProctorDashboard] Socket reconnected successfully');
      setIsConnected(true);
      const uId = user ? String(user._id || user.id) : null;
      socket.emit('subscribe_user_dashboard', { userId: uId });

      const currentRoomId = selectedRoomIdRef.current;
      if (currentRoomId) {
        socket.emit('ROOM_JOIN', {
          roomId: currentRoomId,
          sessionId: currentRoomId,
          role: 'reviewer',
          user: user ? { id: String(user._id || user.id), name: user.fullName || user.name, role: user.role } : null,
        });
        socket.emit('join_room', {
          roomId: currentRoomId,
          sessionId: currentRoomId,
          role: 'reviewer',
          user: user ? { id: String(user._id || user.id), name: user.fullName || user.name, role: user.role } : null,
        });
        socket.emit('join-session', {
          roomId: currentRoomId,
          sessionId: currentRoomId,
        });
        fetchSelectedRoom(currentRoomId);
      }
      fetchOverviewData();
    });

    // Real-time room created event
    socket.on('ROOM_CREATED', (data) => {
      if (data?.room) {
        const newRoom = data.room;
        const newId = newRoom.roomId || newRoom.id;
        setRooms((prev) => {
          if (prev.some((r) => (r.roomId || r.id)?.toUpperCase() === newId?.toUpperCase())) return prev;
          return [newRoom, ...prev];
        });
        showNotification(`Room created: ${newRoom.title || newId}`);
      }
    });

    // Real-time alerts handler
    const handleIncomingAlert = (alert) => {
      if (!alert) return;

      const alertRoom = alert.roomId || (alert.sessionId && alert.sessionId.startsWith('TRV-') ? (alert.sessionId.startsWith('TRV-TRV-') ? alert.sessionId.split('-').slice(1, 3).join('-') : alert.sessionId.split('-').slice(0, 2).join('-')) : null);

      const alertType = alert.type || alert.eventType || 'AI_ALERT';
      const eventId = alert.id || alert.eventId || `${alert.sessionId || ''}_${alertType}_${Math.floor(Date.now() / 2500)}`;

      // Deduplication: prevent identical frames from spamming
      if (processedAlertsRef.current.has(eventId)) return;
      processedAlertsRef.current.add(eventId);
      if (processedAlertsRef.current.size > 500) {
        processedAlertsRef.current.clear();
      }

      const isResolved = alert.state === 'RESOLVED' || alert.status === 'CLEARED';
      const severity = String(alert.severity || (isResolved ? 'LOW' : 'MEDIUM')).toUpperCase();
      const newAlert = {
        id: eventId,
        candidateName: alert.candidateName || alert.userName || 'Candidate',
        candidateId: alert.candidateId || alert.participantId || alert.studentId,
        sessionId: alert.sessionId,
        roomId: alertRoom,
        type: alertType,
        severity,
        riskScore: alert.riskScore !== undefined ? alert.riskScore : 0,
        message: alert.message || alert.evidence || alert.description || `AI detected ${alertType.replace(/_/g, ' ')}`,
        timestamp: alert.timestamp ? new Date(alert.timestamp) : new Date(),
        status: alert.status || (isResolved ? 'RESOLVED' : 'ACTIVE'),
      };

      // Add to allAlerts so the overview KPI counters update in real-time
      setAllAlerts((prev) => [newAlert, ...prev]);

      const activeRoomId = selectedRoomIdRef.current;
      // If currently monitoring this specific room:
      if (activeRoomId && alertRoom && alertRoom.toUpperCase() === activeRoomId.toUpperCase()) {
        setLiveAlerts((prev) => [newAlert, ...prev].slice(0, 200));

        // Update participant risk, violation count, status, liveness, identity, attention
        setParticipants((prev) =>
          prev.map((p) => {
            if (p.id === alert.candidateId || p.sessionId === alert.sessionId || p.id === alert.participantId) {
              const currentViolations = (p.violations || 0) + (isResolved ? 0 : 1);
              const updatedRiskScore = alert.riskScore !== undefined ? alert.riskScore : p.riskScore;
              const updatedRiskLevel = alert.riskLevel || (updatedRiskScore > 60 ? 'HIGH' : updatedRiskScore > 20 ? 'MEDIUM' : 'NORMAL');

              let liveness = p.liveness;
              if (alertType === 'SPOOF_DETECTED') liveness = 'SPOOF';
              else if (alertType === 'LIVENESS_VERIFIED' || alertType === 'LIVENESS_CONFIRMED') liveness = 'LIVE';

              let identityStatus = p.identityStatus;
              if (alertType === 'IDENTITY_MISMATCH') identityStatus = 'MISMATCH';
              else if (alertType === 'IDENTITY_VERIFIED') identityStatus = 'VERIFIED';

              let gaze = p.gaze;
              let attention = p.attentionScore !== undefined ? p.attentionScore : 90;
              if (alertType === 'OFFSCREEN_GLANCE') {
                gaze = 'away';
                attention = Math.max(30, attention - 25);
              } else if (alertType === 'GAZE_NORMAL') {
                gaze = 'center';
                attention = Math.min(95, attention + 15);
              }

              let phone = p.phoneDetected;
              if (alertType === 'MOBILE_PHONE_DETECTED' || alertType === 'PHONE_DETECTED') phone = true;
              else if (alertType === 'MOBILE_PHONE_CLEARED' || alertType === 'PHONE_CLEARED') phone = false;

              let multiFaces = p.multipleFaces;
              if (alertType === 'MULTIPLE_PEOPLE_DETECTED') multiFaces = true;
              else if (alertType === 'MULTIPLE_PEOPLE_CLEARED' || alertType === 'MULTIPLE_PERSONS_CLEARED') multiFaces = false;

              let aiStatus = p.aiStatus || 'ONLINE';
              if (alertType === 'AI_ENGINE_OFFLINE' || alertType === 'PARTICIPANT_DISCONNECTED') aiStatus = 'OFFLINE';
              else if (alertType === 'AI_STATUS_CHANGED') aiStatus = alert.status || 'ONLINE';
              else if (p.status !== 'LEFT') aiStatus = 'ONLINE';

              let tabSwitchCount = alert.count !== undefined ? alert.count : (p.tabSwitchCount || 0);
              let tabSwitchStatus = alert.status || alert.tabSwitchStatus || p.tabSwitchStatus || 'NORMAL';
              let status = p.status || 'MONITORING';
              let terminationReason = p.terminationReason;

              if (alertType === 'TAB_SWITCH_LIMIT_EXCEEDED' || tabSwitchCount >= 4) {
                status = 'TERMINATED';
                tabSwitchCount = 4;
                tabSwitchStatus = 'TERMINATED';
                terminationReason = 'TAB SWITCH LIMIT EXCEEDED';
              } else if (alertType === 'TAB_SWITCH_DETECTED') {
                tabSwitchStatus = tabSwitchCount === 3 ? 'FINAL_WARNING' : 'WARNING';
              }

              return {
                ...p,
                riskScore: status === 'TERMINATED' ? 100 : updatedRiskScore,
                riskLevel: status === 'TERMINATED' ? 'CRITICAL' : updatedRiskLevel,
                violations: currentViolations,
                liveness,
                identityStatus,
                gaze,
                attentionScore: attention,
                phoneDetected: phone,
                multipleFaces: multiFaces,
                aiStatus,
                tabSwitchCount,
                tabSwitchStatus,
                status,
                terminationReason,
              };
            }
            return p;
          })
        );
      }
    };

    socket.on('proctor_alert', handleIncomingAlert);
    socket.on('proctor:event', handleIncomingAlert);
    socket.on('AI_EVENT', handleIncomingAlert);
    socket.on('ALERT_CREATED', handleIncomingAlert);
    socket.on('AI_ALERT_CREATED', handleIncomingAlert);
    socket.on('TAB_SWITCH_ALERT', handleIncomingAlert);
    socket.on('TAB_SWITCH_DETECTED', handleIncomingAlert);
    socket.on('TAB_SWITCH_LIMIT_EXCEEDED', handleIncomingAlert);

    // Room Joined confirmation
    socket.on('ROOM_JOINED', (data) => {
      console.log('[ProctorDashboard] Confirmed ROOM_JOINED:', data);
      if (data?.room) {
        setSelectedRoom((prev) => ({ ...(prev || {}), ...data.room }));
      }
      if (Array.isArray(data?.participants)) {
        setParticipants(data.participants);
      }
    });

    // Live participant joined
    const handleParticipantJoined = (data) => {
      if (!data) return;
      const alertRoom = data.roomId || (data.sessionId && data.sessionId.startsWith('TRV-') ? (data.sessionId.startsWith('TRV-TRV-') ? data.sessionId.split('-').slice(1, 3).join('-') : data.sessionId.split('-').slice(0, 2).join('-')) : null);

      // Update room participant count in overview
      setRooms((prev) => prev.map((r) => {
        if ((r.roomId || r.id)?.toUpperCase() === alertRoom?.toUpperCase()) {
          const nextCount = data.students !== undefined ? data.students : (data.participantsCount !== undefined ? data.participantsCount : (r.participantsCount || 0) + 1);
          return {
            ...r,
            participantsCount: nextCount,
            students: nextCount,
            activeStudents: data.activeStudents !== undefined ? data.activeStudents : r.activeStudents,
            participants: data.participants || r.participants,
          };
        }
        return r;
      }));

      const activeRoomId = selectedRoomIdRef.current;
      if (activeRoomId && alertRoom && alertRoom.toUpperCase() === activeRoomId.toUpperCase()) {
        setSelectedRoom((prev) => prev ? {
          ...prev,
          students: data.students !== undefined ? data.students : (data.participantsCount !== undefined ? data.participantsCount : ((prev.students || 0) + 1)),
          participantsCount: data.participantsCount !== undefined ? data.participantsCount : ((prev.participantsCount || 0) + 1),
          activeStudents: data.activeStudents !== undefined ? data.activeStudents : prev.activeStudents,
        } : prev);

        if (Array.isArray(data.participants)) {
          setParticipants(data.participants);
        } else if (data.participant || data.candidate || data.student || data.user) {
          const candidate = data.participant || data.candidate || data.student || data.user;
          const candidateId = candidate.id || data.studentId || data.userId || data.participantId;
          setParticipants((prev) => {
            const exists = prev.some((p) => p.id === candidateId || (data.sessionId && p.sessionId === data.sessionId));
            if (exists) {
              return prev.map((p) => (p.id === candidateId || (data.sessionId && p.sessionId === data.sessionId))
                ? { ...p, ...candidate, connectionState: 'CONNECTED', status: 'MONITORING', aiStatus: 'ONLINE' }
                : p
              );
            }
            return [
              ...prev,
              {
                id: candidateId,
                sessionId: data.sessionId,
                name: candidate.name || data.studentName || data.userName || 'Candidate',
                email: candidate.email || data.userEmail || '',
                connectionState: 'CONNECTED',
                status: 'MONITORING',
                monitoringStatus: 'ACTIVE',
                aiStatus: 'ONLINE',
                riskScore: 0,
                riskLevel: 'LOW',
                violations: 0,
                liveness: 'LIVE',
                identityStatus: 'VERIFIED',
                gaze: 'center',
                attentionScore: 92,
                joinedAt: new Date(),
              }
            ];
          });
        }
        showNotification(`${data.studentName || data.candidate?.name || data.participant?.name || 'Candidate'} joined the proctoring room.`);
      }
    };

    socket.on('ROOM_PARTICIPANT_JOINED', handleParticipantJoined);
    socket.on('participant_joined', handleParticipantJoined);
    socket.on('STUDENT_JOINED', handleParticipantJoined);

    // Participant left
    const handleParticipantLeft = (data) => {
      if (!data) return;
      const alertRoom = data.roomId || (data.sessionId && data.sessionId.startsWith('TRV-') ? (data.sessionId.startsWith('TRV-TRV-') ? data.sessionId.split('-').slice(1, 3).join('-') : data.sessionId.split('-').slice(0, 2).join('-')) : null);

      // Decrement room participant count in overview
      setRooms((prev) => prev.map((r) => {
        if ((r.roomId || r.id)?.toUpperCase() === alertRoom?.toUpperCase()) {
          const nextCount = data.students !== undefined ? data.students : Math.max(0, data.participantsCount !== undefined ? data.participantsCount : (r.participantsCount || 1) - 1);
          return {
            ...r,
            participantsCount: nextCount,
            students: nextCount,
            activeStudents: data.activeStudents !== undefined ? data.activeStudents : r.activeStudents,
            participants: data.participants || r.participants,
          };
        }
        return r;
      }));

      const activeRoomId = selectedRoomIdRef.current;
      if (activeRoomId && alertRoom && alertRoom.toUpperCase() === activeRoomId.toUpperCase()) {
        const candidateId = data.participantId || data.candidateId || data.studentId || data.userId || data.id;
        const sessionId = data.sessionId;

        setSelectedRoom((prev) => prev ? {
          ...prev,
          students: data.students !== undefined ? data.students : Math.max(0, (prev.students || 1) - 1),
          participantsCount: data.participantsCount !== undefined ? data.participantsCount : Math.max(0, (prev.participantsCount || 1) - 1),
          activeStudents: data.activeStudents !== undefined ? data.activeStudents : prev.activeStudents,
        } : prev);

        if (Array.isArray(data.participants)) {
          setParticipants(data.participants);
        } else {
          setParticipants((prev) =>
            prev.map((p) => {
              if ((candidateId && p.id === candidateId) || (sessionId && p.sessionId === sessionId)) {
                return {
                  ...p,
                  status: 'LEFT',
                  monitoringStatus: 'STOPPED',
                  connectionState: 'DISCONNECTED',
                  aiStatus: 'DISCONNECTED',
                  leftAt: new Date(),
                };
              }
              return p;
            })
          );
        }

        showNotification(`${data.studentName || data.name || 'Candidate'} left the room.`);
      }
    };

    socket.on('ROOM_PARTICIPANT_LEFT', handleParticipantLeft);
    socket.on('participant_left', handleParticipantLeft);
    socket.on('STUDENT_LEFT', handleParticipantLeft);
    socket.on('STUDENT_DISCONNECTED', handleParticipantLeft);

    // Participant reconnecting grace state
    const handleParticipantReconnecting = (data) => {
      if (!data) return;
      const alertRoom = data.roomId;
      const activeRoomId = selectedRoomIdRef.current;
      if (activeRoomId && alertRoom && alertRoom.toUpperCase() === activeRoomId.toUpperCase()) {
        const candidateId = data.participantId || data.studentId || data.userId || data.id;
        setParticipants((prev) =>
          prev.map((p) => {
            if ((candidateId && p.id === candidateId) || (data.sessionId && p.sessionId === data.sessionId)) {
              return {
                ...p,
                connectionState: 'RECONNECTING',
                aiStatus: 'RECONNECTING',
              };
            }
            return p;
          })
        );
        showNotification(`${data.studentName || 'Student'} network interrupted — reconnecting...`);
      }
    };
    socket.on('ROOM_PARTICIPANT_RECONNECTING', handleParticipantReconnecting);

    // Monitoring Started handler
    const handleMonitoringStarted = (data) => {
      if (!data) return;
      const alertRoom = data.roomId;
      const activeRoomId = selectedRoomIdRef.current;
      if (activeRoomId && alertRoom && alertRoom.toUpperCase() === activeRoomId.toUpperCase()) {
        setSelectedRoom((prev) => prev ? {
          ...prev,
          activeStudents: data.activeStudents !== undefined ? data.activeStudents : (prev.activeStudents || 0) + 1,
        } : prev);

        if (Array.isArray(data.participants)) {
          setParticipants(data.participants);
        } else {
          setParticipants((prev) =>
            prev.map((p) => {
              if (p.id === data.participantId || p.sessionId === data.sessionId) {
                return {
                  ...p,
                  status: 'MONITORING',
                  monitoringStatus: 'ACTIVE',
                  connectionState: 'CONNECTED',
                };
              }
              return p;
            })
          );
        }
      }
    };
    socket.on('MONITORING_STARTED', handleMonitoringStarted);

    // Monitoring Stopped handler
    const handleMonitoringStopped = (data) => {
      if (!data) return;
      const alertRoom = data.roomId;
      const activeRoomId = selectedRoomIdRef.current;
      if (activeRoomId && alertRoom && alertRoom.toUpperCase() === activeRoomId.toUpperCase()) {
        setSelectedRoom((prev) => prev ? {
          ...prev,
          activeStudents: data.activeStudents !== undefined ? data.activeStudents : Math.max(0, (prev.activeStudents || 1) - 1),
        } : prev);

        if (Array.isArray(data.participants)) {
          setParticipants(data.participants);
        } else {
          setParticipants((prev) =>
            prev.map((p) => {
              if (p.id === data.participantId || p.sessionId === data.sessionId) {
                return {
                  ...p,
                  status: 'COMPLETED',
                  monitoringStatus: 'STOPPED',
                };
              }
              return p;
            })
          );
        }
      }
    };
    socket.on('MONITORING_STOPPED', handleMonitoringStopped);

    // Participant risk updated
    socket.on('participant_risk_updated', (data) => {
      const activeRoomId = selectedRoomIdRef.current;
      const alertRoom = data.roomId || (data.sessionId && data.sessionId.startsWith('TRV-') ? (data.sessionId.startsWith('TRV-TRV-') ? data.sessionId.split('-').slice(1, 3).join('-') : data.sessionId.split('-').slice(0, 2).join('-')) : null);
      if (!activeRoomId || (alertRoom && alertRoom.toUpperCase() !== activeRoomId.toUpperCase())) return;

      setParticipants((prev) =>
        prev.map((p) => {
          if (p.id === data.candidateId || p.sessionId === data.sessionId) {
            return {
              ...p,
              riskScore: data.riskScore !== undefined ? data.riskScore : p.riskScore,
              riskLevel: data.riskLevel || p.riskLevel,
              violations: data.violations !== undefined ? data.violations : p.violations,
              liveness: data.liveness || p.liveness,
              identityStatus: data.identityStatus || p.identityStatus,
              gaze: data.gaze || p.gaze,
              pose: data.pose || p.pose,
              phoneDetected: data.phoneDetected !== undefined ? data.phoneDetected : p.phoneDetected,
              aiStatus: data.aiStatus || p.aiStatus || 'ONLINE',
            };
          }
          return p;
        })
      );
    });

    // Room participants list sync
    const handleRoomParticipantsUpdated = (data) => {
      const alertRoom = data?.roomId;
      if (alertRoom) {
        setRooms((prev) => prev.map((r) => {
          if ((r.roomId || r.id)?.toUpperCase() === alertRoom.toUpperCase()) {
            return {
              ...r,
              participantsCount: data.participantsCount !== undefined ? data.participantsCount : (data.students !== undefined ? data.students : r.participantsCount),
              students: data.students !== undefined ? data.students : r.students,
              activeStudents: data.activeStudents !== undefined ? data.activeStudents : r.activeStudents,
              participants: data.participants || r.participants,
            };
          }
          return r;
        }));
      }

      const activeRoomId = selectedRoomIdRef.current;
      if (activeRoomId && alertRoom && alertRoom.toUpperCase() === activeRoomId.toUpperCase()) {
        setSelectedRoom((prev) => prev ? {
          ...prev,
          students: data.students !== undefined ? data.students : prev.students,
          activeStudents: data.activeStudents !== undefined ? data.activeStudents : prev.activeStudents,
          participantsCount: data.participantsCount !== undefined ? data.participantsCount : prev.participantsCount,
        } : prev);

        if (Array.isArray(data.participants)) {
          setParticipants(data.participants);
        }
      }
    };

    socket.on('ROOM_PARTICIPANTS_UPDATED', handleRoomParticipantsUpdated);
    socket.on('room_participants_updated', handleRoomParticipantsUpdated);

    // Room ended
    socket.on('ROOM_ENDED', (data) => {
      const alertRoom = data?.roomId;
      if (alertRoom) {
        setRooms((prev) => prev.map((r) => ((r.roomId || r.id)?.toUpperCase() === alertRoom.toUpperCase() ? { ...r, status: 'ENDED' } : r)));
      }
      const activeRoomId = selectedRoomIdRef.current;
      if (activeRoomId && alertRoom && alertRoom.toUpperCase() === activeRoomId.toUpperCase()) {
        setSelectedRoom((prev) => prev ? { ...prev, status: 'ENDED' } : prev);
        showNotification('The examination has been concluded.');
      }
    });
    socket.on('room_ended', () => {
      setSelectedRoom((prev) => prev ? { ...prev, status: 'ENDED' } : prev);
      showNotification('The examination has been concluded.');
    });
  };

  // Fullscreen API toggle handler
  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        } else if (document.documentElement.webkitRequestFullscreen) {
          await document.documentElement.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('[ProctorDashboard] Fullscreen toggle error:', err);
      toast.error('Unable to toggle fullscreen mode in this browser context.');
    }
  };

  // Safe clipboard helper with secure fallback
  const copyTextToClipboard = async (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        console.warn('navigator.clipboard.writeText failed, using fallback', e);
      }
    }
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      textArea.remove();
      return successful;
    } catch (err) {
      console.error('execCommand copy failed', err);
      return false;
    }
  };

  const getFullJoinUrl = (room) => {
    const roomId = room?.roomId || room?.id;
    const token = room?.joinCode || room?.joinToken || '';
    const origin = window.location.origin;
    return `${origin}/join/${roomId}${token ? `?token=${token}` : ''}`;
  };

  // Top header & banner "Copy Student Link" handler
  const handleCopyTopStudentLink = async () => {
    if (!selectedRoom) return;
    const url = getFullJoinUrl(selectedRoom);
    const success = await copyTextToClipboard(url);
    if (success) {
      setCopiedTopLink(true);
      toast.success('Student join link copied to clipboard.');
      setTimeout(() => setCopiedTopLink(false), 2500);
    } else {
      toast.error('Failed to copy student join link. Please copy manually.');
    }
  };

  // Student Monitoring empty-state "Copy Student Join Link" handler
  const handleCopyMonitoringJoinLink = async () => {
    if (!selectedRoom) return;
    const url = getFullJoinUrl(selectedRoom);
    const success = await copyTextToClipboard(url);
    if (success) {
      setCopiedMonitoringLink(true);
      toast.success('Student join link copied to clipboard.');
      setTimeout(() => setCopiedMonitoringLink(false), 2500);
    } else {
      toast.error('Failed to copy student join link. Please copy manually.');
    }
  };

  // Room card copy link handler
  const handleCopyLink = async (room) => {
    const roomId = room?.roomId || room?.id;
    const url = getFullJoinUrl(room);
    const success = await copyTextToClipboard(url);
    if (success) {
      setCopiedId(roomId);
      toast.success('Student join link copied to clipboard.');
      setTimeout(() => setCopiedId(null), 2500);
    } else {
      toast.error('Failed to copy student join link. Please copy manually.');
    }
  };

  // Confirmed End Exam action with backend API
  const confirmEndExam = async () => {
    if (!selectedRoomId) return;
    setEndingRoom(true);
    try {
      const res = await api.post(`/rooms/${selectedRoomId}/end`);
      if (res.data?.success) {
        toast.success('Examination session ended successfully. Reports generated.');
        setSelectedRoom((prev) => (prev ? { ...prev, status: 'ENDED' } : prev));
        setRooms((prev) =>
          prev.map((r) =>
            (r.roomId || r.id)?.toUpperCase() === selectedRoomId.toUpperCase()
              ? { ...r, status: 'ENDED' }
              : r
          )
        );
        setShowEndExamModal(false);
        fetchSelectedRoom(selectedRoomId);
        fetchOverviewData();
      } else {
        toast.error(res.data?.message || 'Failed to end examination session.');
      }
    } catch (err) {
      console.error('[ProctorDashboard] End exam error:', err);
      toast.error(err.response?.data?.message || 'Failed to end examination session.');
    } finally {
      setEndingRoom(false);
    }
  };

  // Real KPI Computations (Data-driven from backend state)
  const totalRoomsCount = rooms.length;
  const activeRoomsCount = rooms.filter((r) => r.status !== 'ENDED').length;
  const studentsMonitoredCount = useMemo(() => {
    return rooms.reduce((acc, r) => {
      const count = r.participantsCount || (r.participants?.filter((p) => p.status !== 'LEFT').length) || 0;
      return acc + count;
    }, 0);
  }, [rooms]);

  const totalAlertsCount = useMemo(() => {
    if (allAlerts.length > 0) return allAlerts.length;
    return rooms.reduce((acc, r) => {
      const v = r.participants?.reduce((vAcc, p) => vAcc + (p.violations || 0), 0) || 0;
      return acc + v;
    }, 0);
  }, [allAlerts, rooms]);

  const criticalAlertsCount = useMemo(() => {
    const critInAlerts = allAlerts.filter((a) => {
      const sev = String(a.severity || '').toUpperCase();
      return sev === 'CRITICAL' || sev === 'HIGH' || sev === 'DANGER';
    }).length;

    if (critInAlerts > 0) return critInAlerts;

    return rooms.reduce((acc, r) => {
      const critInRoom = r.participants?.filter((p) => (p.riskScore || 0) >= 60 || p.riskLevel === 'HIGH').length || 0;
      return acc + critInRoom;
    }, 0);
  }, [allAlerts, rooms]);

  // Filtered Rooms for Selection
  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      const rId = r.roomId || r.id || '';
      const rTitle = r.title || '';
      const matchesSearch =
        rTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rId.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus =
        filterStatus === 'ALL'
          ? true
          : filterStatus === 'ACTIVE'
          ? r.status !== 'ENDED'
          : r.status === 'ENDED';
      return matchesSearch && matchesStatus;
    });
  }, [rooms, searchTerm, filterStatus]);

  // Specific Active Room Summary (Authoritative MongoDB Room counters + live participants state)
  const totalRoomStudents = selectedRoom?.students !== undefined ? selectedRoom.students : (selectedRoom?.participantsCount !== undefined ? selectedRoom.participantsCount : participants.filter(p => p.status !== 'LEFT').length);
  const activeRoomStudents = selectedRoom?.activeStudents !== undefined ? selectedRoom.activeStudents : participants.filter((p) => p.status === 'MONITORING' || p.status === 'ACTIVE' || p.monitoringStatus === 'ACTIVE').length;
  const totalRoomAlerts = selectedRoom?.alerts !== undefined && selectedRoom.alerts > liveAlerts.length ? selectedRoom.alerts : liveAlerts.length;
  const criticalRoomAlerts = selectedRoom?.criticalAlerts !== undefined && selectedRoom.criticalAlerts > 0 ? selectedRoom.criticalAlerts : liveAlerts.filter((a) =>
    ['CRITICAL', 'HIGH', 'DANGER'].includes(String(a.severity).toUpperCase())
  ).length;

  // Computed Room Status: 'Live' | 'Waiting' | 'Ended'
  const computedRoomState = useMemo(() => {
    if (selectedRoom?.status === 'ENDED') {
      return {
        label: 'Ended',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
        dotClass: 'bg-slate-500',
        tooltip: 'This examination session has ended and reports are archived.'
      };
    }
    if (participants.length === 0) {
      return {
        label: 'Waiting',
        badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
        dotClass: 'bg-blue-500 animate-pulse',
        tooltip: 'Room is active and waiting for students to join.'
      };
    }
    return {
      label: 'Live',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      dotClass: 'bg-emerald-500 animate-pulse',
      tooltip: 'Examination is live with active student participants.'
    };
  }, [selectedRoom?.status, participants.length]);

  // Computed Real-time Connection State: 'REAL-TIME CONNECTED' | 'CONNECTION LOST'
  const computedConnectionState = useMemo(() => {
    if (isConnected) {
      return {
        label: 'REAL-TIME CONNECTED',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dotClass: 'bg-emerald-500 animate-pulse',
        tooltip: 'Real-time WebSocket telemetry stream is actively connected.'
      };
    }
    return {
      label: 'CONNECTION LOST',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
      dotClass: 'bg-rose-500 animate-ping',
      tooltip: 'Real-time telemetry connection interrupted. Reconnecting...'
    };
  }, [isConnected]);

  return (
    <div className="space-y-6 select-none font-sans pb-12">
      {/* Toast Notification (Legacy Fallback) */}
      {toastMsg && (
        <div className="fixed top-20 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl border border-slate-700 text-xs font-semibold shadow-2xl flex items-center gap-3 animate-fade-in">
          <Shield size={16} className="text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Page Header with Action Buttons */}
      <PageHeader
        title="PROCTOR DASHBOARD"
        subtitle="Monitor your virtual rooms, students, alerts and examination reports."
        breadcrumb={[
          'TrueView AI',
          'Proctor Dashboard',
          ...(selectedRoom ? [selectedRoom.title || selectedRoom.roomId] : [])
        ]}
        actions={
          selectedRoomId ? (
            <div className="flex flex-wrap items-center gap-2">
              {/* A. All Rooms (Navigation / Back button) */}
              <button
                type="button"
                onClick={() => navigate('/rooms')}
                className="py-2 px-3.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-2 shadow-xs transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1"
                title="Back to all virtual rooms"
                aria-label="Back to all virtual rooms"
              >
                <ArrowLeft size={14} className="text-slate-600" />
                <span>All Rooms</span>
              </button>

              {/* Copy Student Link (Primary Top Header Action) */}
              <button
                type="button"
                onClick={handleCopyTopStudentLink}
                className="py-2 px-3.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 font-bold text-xs flex items-center gap-2 shadow-xs transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1"
                title="Copy the student join link to clipboard"
                aria-label="Copy student invitation link"
              >
                {copiedTopLink ? (
                  <>
                    <Check size={14} className="text-emerald-600" />
                    <span className="text-emerald-700">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} className="text-slate-600" />
                    <span>Copy Student Link</span>
                  </>
                )}
              </button>

              {/* B. Fullscreen Host View (Browser Fullscreen API Toggle) */}
              <button
                type="button"
                onClick={handleToggleFullscreen}
                className="py-2 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1"
                title={isFullscreen ? "Exit fullscreen monitoring view" : "Open fullscreen monitoring view"}
                aria-label={isFullscreen ? "Exit fullscreen monitoring view" : "Open fullscreen monitoring view"}
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 size={14} className="text-emerald-400" />
                    <span>Exit Fullscreen</span>
                  </>
                ) : (
                  <>
                    <Maximize2 size={14} className="text-emerald-400" />
                    <span>Fullscreen Host View</span>
                  </>
                )}
              </button>

              {/* C. End Exam (Confirmation Modal Trigger) */}
              {selectedRoom?.status !== 'ENDED' && (
                <button
                  type="button"
                  onClick={() => setShowEndExamModal(true)}
                  disabled={endingRoom}
                  className="py-2 px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-1"
                  title="Conclude examination session"
                  aria-label="End exam"
                >
                  <StopCircle size={14} />
                  <span>End Exam</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchOverviewData}
                disabled={loading}
                className="py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                title="Refresh Proctor Data"
                aria-label="Refresh proctor data"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>

              <button
                type="button"
                onClick={() => navigate('/rooms')}
                className="py-2 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                title="View All Virtual Rooms"
                aria-label="View virtual rooms"
              >
                <Video size={14} />
                <span>Virtual Rooms</span>
              </button>
            </div>
          )
        }
      />

      {/* Top Summary Cards (Pure Data-Driven Backend Metrics) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* TOTAL ROOMS */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-slate-500">
              Total Rooms
            </span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <Video size={14} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900 tracking-tight">
            {totalRoomsCount}
          </div>
          <div className="text-[10.5px] text-slate-400 mt-1 font-medium">
            Virtual exam rooms
          </div>
        </div>

        {/* ACTIVE ROOMS */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-emerald-600">
              Active Rooms
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-600 tracking-tight">
            {activeRoomsCount}
          </div>
          <div className="text-[10.5px] text-slate-400 mt-1 font-medium">
            Currently accepting students
          </div>
        </div>

        {/* STUDENTS MONITORED */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-blue-600">
              Students Monitored
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users size={14} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900 tracking-tight">
            {studentsMonitoredCount}
          </div>
          <div className="text-[10.5px] text-slate-400 mt-1 font-medium">
            Across active sessions
          </div>
        </div>

        {/* TOTAL ALERTS */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-amber-600">
              Total Alerts
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Bell size={14} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900 tracking-tight">
            {totalAlertsCount}
          </div>
          <div className="text-[10.5px] text-slate-400 mt-1 font-medium">
            Flagged AI perceptions
          </div>
        </div>

        {/* CRITICAL ALERTS */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-mono font-bold uppercase tracking-wider text-rose-600">
              Critical Alerts
            </span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle size={14} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-rose-600 tracking-tight">
            {criticalAlertsCount}
          </div>
          <div className="text-[10.5px] text-slate-400 mt-1 font-medium">
            High integrity violations
          </div>
        </div>
      </div>

      {/* =========================================================================
          VIEW A: ROOM SELECTION (When no roomId query param)
          ========================================================================= */}
      {!selectedRoomId && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                type="text"
                placeholder="Search examination by room name or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFilterStatus('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  filterStatus === 'ALL'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All ({rooms.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('ACTIVE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  filterStatus === 'ACTIVE'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Active ({activeRoomsCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('ENDED')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  filterStatus === 'ENDED'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Ended ({rooms.length - activeRoomsCount})
              </button>
            </div>
          </div>

          {/* Room Cards Grid */}
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-500 font-medium">Loading rooms from backend...</p>
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-4 shadow-xs">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Video size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">No Virtual Rooms Found</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Create an examination room in Virtual Rooms to begin monitoring students.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/rooms')}
                className="py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition inline-flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <Video size={14} />
                <span>Go to Virtual Rooms</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRooms.map((room) => {
                const rId = room.roomId || room.id;
                const isEnded = room.status === 'ENDED';
                const participantsCount = room.participantsCount || (room.participants?.filter((p) => p.status !== 'LEFT').length) || 0;
                const activeCount = room.participants?.filter((p) => p.status === 'MONITORING' || p.status === 'ACTIVE').length || (isEnded ? 0 : participantsCount);
                const roomViolations = room.participants?.reduce((acc, p) => acc + (p.violations || 0), 0) || 0;
                const criticalViolations = room.participants?.filter((p) => p.riskLevel === 'CRITICAL' || p.status === 'TERMINATED').length || 0;

                return (
                  <div
                    key={rId}
                    className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between shadow-xs hover:shadow-md hover:border-slate-300 transition-all space-y-4"
                  >
                    <div className="space-y-3">
                      {/* Top Badges */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-slate-900 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200">
                            {rId}
                          </span>
                          <span className="text-[10.5px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {room.mode || 'EXAM'}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${
                            isEnded
                              ? 'bg-slate-100 text-slate-600 border-slate-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {!isEnded && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                          {isEnded ? 'ENDED' : 'LIVE'}
                        </span>
                      </div>

                      {/* Room Name */}
                      <div>
                        <h3 className="text-base font-bold text-slate-900 line-clamp-1">
                          {room.title}
                        </h3>
                        <p className="text-[11.5px] text-slate-500 mt-0.5">
                          Host: <span className="font-semibold text-slate-700">{room.hostName || room.host?.name || 'Faculty Proctor'}</span>
                        </p>
                      </div>

                      {/* Room Stats */}
                      <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-slate-100 text-xs text-center">
                        <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                          <span className="text-[10px] font-mono text-slate-400 block uppercase">Students</span>
                          <span className="font-extrabold text-slate-800 text-sm">
                            {participantsCount}
                          </span>
                        </div>
                        <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                          <span className="text-[10px] font-mono text-emerald-600 block uppercase font-bold">Active</span>
                          <span className="font-extrabold text-emerald-600 text-sm">
                            {activeCount}
                          </span>
                        </div>
                        <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                          <span className="text-[10px] font-mono text-amber-600 block uppercase">Alerts</span>
                          <span className={`font-extrabold text-sm ${roomViolations > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                            {roomViolations}
                          </span>
                        </div>
                        <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                          <span className="text-[10px] font-mono text-rose-600 block uppercase font-bold">Critical</span>
                          <span className={`font-extrabold text-sm ${criticalViolations > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                            {criticalViolations}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action: Open Room Dashboard */}
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setSearchParams({ roomId: rId })}
                        className="w-full py-2.5 px-3 rounded-xl bg-[#10B981] hover:bg-[#059669] active:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
                      >
                        <Shield size={14} className="text-white" />
                        <span>Open Room Dashboard</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          VIEW B: ROOM MONITORING DASHBOARD (When roomId query param is present)
          ========================================================================= */}
      {selectedRoomId && (
        roomForbidden && !roomLoading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-4 shadow-xs">
            <div className="w-14 h-14 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center mx-auto border border-amber-100">
              <Shield size={28} />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900">You are not authorized to view this room.</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1.5">
                You do not have permission to view or manage proctor room <span className="font-mono font-bold text-slate-800">"{selectedRoomId}"</span>.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate('/rooms')}
                className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <ArrowLeft size={14} />
                <span>Return to All Rooms</span>
              </button>
            </div>
          </div>
        ) : roomNotFound && !roomLoading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-4 shadow-xs">
            <div className="w-14 h-14 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto border border-rose-100">
              <AlertCircle size={28} />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900">Room not found</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1.5">
                The proctoring room with ID <span className="font-mono font-bold text-slate-800">"{selectedRoomId}"</span> was not found in the active database.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate('/rooms')}
                className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <ArrowLeft size={14} />
                <span>Return to All Rooms</span>
              </button>
              <button
                type="button"
                onClick={() => fetchSelectedRoom(selectedRoomId)}
                className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition flex items-center gap-2 cursor-pointer border border-slate-200"
              >
                <RefreshCw size={14} />
                <span>Retry</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Specific Room Monitoring Dashboard Summary Banner */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-xs font-mono font-bold text-slate-900 px-2.5 py-0.5 rounded bg-slate-100 border border-slate-200">
                      Room ID: {selectedRoomId}
                    </span>
                    
                    {/* Status: Live | Waiting | Ended */}
                    <span
                      className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${computedRoomState.badgeClass}`}
                      title={computedRoomState.tooltip}
                    >
                      <span className={`w-2 h-2 rounded-full ${computedRoomState.dotClass}`} />
                      Status: {computedRoomState.label}
                    </span>

                    {/* Real-time Socket Connection Badge: REAL-TIME CONNECTED | CONNECTION LOST */}
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${computedConnectionState.badgeClass}`}
                      title={computedConnectionState.tooltip}
                    >
                      <span className={`w-2 h-2 rounded-full ${computedConnectionState.dotClass}`} />
                      {computedConnectionState.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500 mb-1">
                    <span className="font-semibold text-slate-700">
                      Host: {selectedRoom?.hostName || selectedRoom?.host?.name || 'Session Host'}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="font-semibold text-slate-700">
                      Mode: {selectedRoom?.mode || selectedRoom?.sessionType || 'EXAM'}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="font-semibold text-slate-700">
                      Duration: {selectedRoom?.durationMinutes || 60} mins
                    </span>
                    {selectedRoom?.createdAt && (
                      <>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-500 font-mono text-[11px]">
                          Created: {new Date(selectedRoom.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </>
                    )}
                  </div>

                  <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                    Room: {selectedRoom?.title && selectedRoom.title !== 'null' ? selectedRoom.title : `Monitored Examination ${selectedRoomId}`}
                  </h2>
                </div>

                {/* Quick Candidate Share Link Button */}
                {selectedRoom && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyTopStudentLink}
                      className="py-2 px-3.5 rounded-xl bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-slate-300 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                      title="Copy Student Link"
                      aria-label="Copy student link"
                    >
                      {copiedTopLink ? (
                        <>
                          <Check size={14} className="text-emerald-600 font-bold" />
                          <span className="text-emerald-700">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={13} className="text-slate-700" />
                          <span>Copy Student Link</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Room-level Statistics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-mono text-slate-500 uppercase block font-semibold">
                    Students
                  </span>
                  <span className="text-2xl font-extrabold text-slate-900 mt-0.5 block">
                    {totalRoomStudents}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Joined room</span>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-mono text-emerald-600 uppercase block font-semibold">
                    Active
                  </span>
                  <span className="text-2xl font-extrabold text-emerald-600 mt-0.5 block">
                    {activeRoomStudents}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Currently monitoring</span>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-mono text-amber-600 uppercase block font-semibold">
                    Alerts
                  </span>
                  <span className="text-2xl font-extrabold text-slate-900 mt-0.5 block">
                    {totalRoomAlerts}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Total AI alerts</span>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[10px] font-mono text-rose-600 uppercase block font-semibold">
                    Critical
                  </span>
                  <span className="text-2xl font-extrabold text-rose-600 mt-0.5 block">
                    {criticalRoomAlerts}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Severe violations</span>
                </div>
              </div>
            </div>

            {/* Monitoring Layout: Student Monitoring (Left 65%) + Live Alerts (Right 35%) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* STUDENT MONITORING (8 cols) */}
              <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                      <Users size={16} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">STUDENT MONITORING</h3>
                      <p className="text-[11px] text-slate-500">Live candidate verification & integrity state</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                    {participants.length} {participants.length === 1 ? 'Student' : 'Students'}
                  </span>
                </div>

                {roomLoading ? (
                  <div className="py-16 text-center space-y-2">
                    <div className="w-7 h-7 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-xs text-slate-500">Loading student participants...</p>
                  </div>
                ) : participants.length === 0 ? (
                  /* Improved Empty State */
                  <div className="p-8 text-center space-y-3 bg-slate-50/80 rounded-2xl border border-slate-200">
                    <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-1 border border-slate-200">
                      <Users size={28} className="text-slate-500" />
                    </div>
                    <div>
                      <h4 className="text-base font-extrabold text-slate-900">No students joined yet</h4>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                        Share the student join link to invite candidates to this virtual room.
                      </p>
                    </div>
                    {selectedRoom && (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={handleCopyMonitoringJoinLink}
                          className="py-2.5 px-4 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white text-xs font-bold rounded-xl transition inline-flex items-center gap-2 cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1"
                          title="Copy the link students use to join this room."
                          aria-label="Copy the link students use to join this room."
                        >
                          {copiedMonitoringLink ? (
                            <>
                              <Check size={14} className="text-emerald-400" />
                              <span>Link Copied</span>
                            </>
                          ) : (
                            <>
                              <Link size={14} className="text-slate-300" />
                              <span>Copy Student Join Link</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200/80 text-[10.5px] font-mono uppercase text-slate-400 tracking-wider">
                          <th className="py-2.5 px-3">Student Name</th>
                          <th className="py-2.5 px-2">Connection</th>
                          <th className="py-2.5 px-2">Verification</th>
                          <th className="py-2.5 px-2">Liveness</th>
                          <th className="py-2.5 px-2">Identity</th>
                          <th className="py-2.5 px-2">Attention</th>
                          <th className="py-2.5 px-2">Risk</th>
                          <th className="py-2.5 px-2">Alerts</th>
                          <th className="py-2.5 px-2">Monitoring Status</th>
                          <th className="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {participants.map((p, idx) => {
                          const isTerminated = p.status === 'TERMINATED' || (p.tabSwitchCount || 0) >= 4;
                          const riskScore = isTerminated ? 100 : (p.riskScore || 0);
                          const rawRisk = isTerminated ? 'CRITICAL' : (p.riskLevel || (riskScore > 60 ? 'HIGH' : riskScore > 20 ? 'MEDIUM' : 'LOW'));
                          const riskLevel = rawRisk === 'NORMAL' ? 'LOW' : rawRisk;
                          const isVerifiedIdentity = p.identityStatus === 'VERIFIED' || p.identityStatus === 'IDENTITY_VERIFIED';
                          const isLive = p.liveness === 'LIVE' || p.liveness === 'VERIFIED' || p.liveness === 'REAL';
                          const attentionValue = p.attentionScore !== undefined
                            ? p.attentionScore
                            : (p.attention !== undefined ? p.attention : (p.gaze === 'center' ? (riskScore > 20 ? 71 : 92) : 65));

                          const connState = p.connectionState || (p.status === 'LEFT' ? 'DISCONNECTED' : 'CONNECTED');
                          const isReconnecting = connState === 'RECONNECTING';
                          const isDisconnected = connState === 'DISCONNECTED' || p.status === 'LEFT';

                          const monitoringState = p.monitoringStatus || (isTerminated ? 'TERMINATED' : (p.status === 'LEFT' ? 'STOPPED' : (p.status || 'ACTIVE')));

                          return (
                            <tr key={p.id || p.sessionId || idx} className="hover:bg-slate-50/80 transition-colors">
                              {/* Student Name */}
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`w-2 h-2 rounded-full shrink-0 ${
                                      isTerminated
                                        ? 'bg-rose-500'
                                        : isDisconnected
                                        ? 'bg-slate-400'
                                        : isReconnecting
                                        ? 'bg-amber-500 animate-pulse'
                                        : 'bg-emerald-500 animate-pulse'
                                    }`}
                                    title={`Connection: ${connState}`}
                                  />
                                  <div className="font-bold text-slate-900 leading-tight">
                                    {p.name || 'Candidate'}
                                  </div>
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                                  <span className="truncate max-w-[140px]">{p.email || p.sessionId || 'Candidate'}</span>
                                </div>
                              </td>

                              {/* Connection */}
                              <td className="py-3 px-2">
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1.5 border ${
                                    isReconnecting
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : isDisconnected
                                      ? 'bg-slate-100 text-slate-500 border-slate-200'
                                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  }`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    isReconnecting
                                      ? 'bg-amber-500 animate-ping'
                                      : isDisconnected
                                      ? 'bg-slate-400'
                                      : 'bg-emerald-500'
                                  }`} />
                                  {isReconnecting ? 'Reconnecting' : isDisconnected ? 'Disconnected' : 'Connected'}
                                </span>
                              </td>

                              {/* Verification */}
                              <td className="py-3 px-2">
                                <span
                                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                                    isVerifiedIdentity || p.verified
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : p.status === 'VERIFYING'
                                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                                  }`}
                                >
                                  {isVerifiedIdentity || p.verified ? 'VERIFIED' : p.status === 'VERIFYING' ? 'VERIFYING' : 'PENDING'}
                                </span>
                              </td>

                              {/* Liveness */}
                              <td className="py-3 px-2">
                                <span
                                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                                    isLive
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-rose-50 text-rose-700 font-extrabold'
                                  }`}
                                >
                                  {isLive ? 'LIVE' : 'SPOOF'}
                                </span>
                              </td>

                              {/* Identity */}
                              <td className="py-3 px-2">
                                <span
                                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                                    isVerifiedIdentity
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-amber-50 text-amber-700'
                                  }`}
                                >
                                  {isVerifiedIdentity ? 'VERIFIED' : 'MISMATCH'}
                                </span>
                              </td>

                              {/* Attention */}
                              <td className="py-3 px-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-extrabold text-slate-800 font-mono text-[11px]">
                                    {attentionValue}%
                                  </span>
                                </div>
                              </td>

                              {/* Risk */}
                              <td className="py-3 px-2">
                                <span
                                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                                    riskLevel === 'CRITICAL'
                                      ? 'bg-rose-600 text-white font-black'
                                      : riskLevel === 'HIGH'
                                      ? 'bg-rose-100 text-rose-800 font-extrabold'
                                      : riskLevel === 'MEDIUM'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-emerald-50 text-emerald-700'
                                  }`}
                                >
                                  {riskLevel}
                                </span>
                              </td>

                              {/* Alerts */}
                              <td className="py-3 px-2 font-mono text-slate-700 font-semibold text-[11px]">
                                {p.violations || 0}
                              </td>

                              {/* Monitoring Status */}
                              <td className="py-3 px-2">
                                <div>
                                  <span
                                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                                      isTerminated
                                        ? 'bg-rose-100 text-rose-800 border border-rose-300 font-extrabold'
                                        : monitoringState === 'ACTIVE' || monitoringState === 'MONITORING'
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : monitoringState === 'VERIFYING'
                                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                        : monitoringState === 'STOPPED' || monitoringState === 'COMPLETED'
                                        ? 'bg-slate-100 text-slate-600 border border-slate-200'
                                        : 'bg-slate-100 text-slate-500'
                                    }`}
                                  >
                                    {isTerminated ? 'TERMINATED' : monitoringState}
                                  </span>
                                  {isTerminated && (
                                    <div className="text-[9px] text-rose-600 font-bold uppercase mt-0.5 leading-tight">
                                      {p.terminationReason || 'TAB SWITCH LIMIT EXCEEDED'}
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* Actions */}
                              <td className="py-3 px-3 text-right">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedParticipant(p);
                                      setIsParticipantModalOpen(true);
                                    }}
                                    className="py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[10.5px] transition cursor-pointer"
                                    title="Inspect Live Student Details & Perceptions"
                                  >
                                    View Student
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedSessionId(p.sessionId);
                                      setIsReportModalOpen(true);
                                    }}
                                    className="py-1 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10.5px] transition cursor-pointer flex items-center gap-1"
                                    title="Open Candidate Proctoring Integrity Report"
                                  >
                                    <FileText size={11} />
                                    <span>Report</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* LIVE ALERTS (4 cols) */}
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                      <Radio size={16} className="animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">LIVE ALERTS</h3>
                      <p className="text-[11px] text-slate-500">Real-time AI violation stream</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                    {liveAlerts.length}
                  </span>
                </div>

                {/* Real-time alert list */}
                <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                  {liveAlerts.length === 0 ? (
                    /* Improved Green / Neutral Status */
                    <div className="py-12 text-center space-y-2 bg-slate-50/80 rounded-xl border border-slate-200/80 p-5">
                      <div className="w-11 h-11 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center mx-auto mb-1">
                        <ShieldCheck size={24} />
                      </div>
                      <h4 className="text-xs font-bold text-slate-900">No violations detected</h4>
                      <p className="text-[11px] text-slate-500 max-w-[240px] mx-auto">
                        AI monitoring is active. New alerts will appear here.
                      </p>
                    </div>
                  ) : (
                    liveAlerts.map((alert) => {
                      const alertType = alert.type || alert.eventType || 'AI_ALERT';
                      const isTabDetected = alertType === 'TAB_SWITCH_DETECTED';
                      const isTabLimit = alertType === 'TAB_SWITCH_LIMIT_EXCEEDED';
                      const rawSev = String(alert.severity || (isTabLimit ? 'CRITICAL' : isTabDetected ? 'MEDIUM' : 'MEDIUM')).toUpperCase();
                      const isCritical = rawSev === 'CRITICAL' || rawSev === 'HIGH' || rawSev === 'DANGER' || isTabLimit;
                      const alertStatus = alert.status || (alert.resolved ? 'RESOLVED' : 'ACTIVE');

                      const timeStr = alert.timestamp
                        ? new Date(alert.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: true,
                          })
                        : 'Just now';

                      return (
                        <div
                          key={alert.id}
                          className={`p-3 rounded-xl border transition-all ${
                            isCritical
                              ? 'bg-rose-50/80 border-rose-200 text-rose-950 shadow-xs'
                              : 'bg-amber-50/80 border-amber-200 text-amber-950'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            {/* Severity Indicator: Warning / Critical */}
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-[9.5px] font-mono font-extrabold px-1.5 py-0.5 rounded flex items-center gap-1 uppercase tracking-wider ${
                                  isCritical
                                    ? 'bg-rose-600 text-white'
                                    : 'bg-amber-500 text-white'
                                }`}
                              >
                                {isCritical ? (
                                  <>
                                    <AlertTriangle size={10} />
                                    <span>Critical</span>
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle size={10} />
                                    <span>Warning</span>
                                  </>
                                )}
                              </span>

                              {/* Status badge */}
                              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/80 text-slate-700 border border-slate-200 uppercase">
                                {alertStatus}
                              </span>
                            </div>

                            <span className="text-[10px] font-mono text-slate-500 font-medium">
                              {timeStr}
                            </span>
                          </div>

                          {/* Alert Headline */}
                          <div className="text-xs font-bold text-slate-900 leading-snug flex items-center gap-1.5">
                            {isTabLimit ? (
                              <span className="text-rose-700 flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping inline-block" />
                                TAB SWITCH LIMIT EXCEEDED
                              </span>
                            ) : isTabDetected ? (
                              <span className="text-amber-800 flex items-center gap-1">
                                TAB SWITCH DETECTED
                              </span>
                            ) : (
                              alert.message
                            )}
                          </div>

                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            Type: <span className="font-semibold text-slate-700">{alertType.replace(/_/g, ' ')}</span>
                          </div>

                          {/* Extra Tab Switch Context */}
                          {(isTabLimit || isTabDetected) && (
                            <div className="text-[11px] font-mono text-slate-700 mt-0.5">
                              {isTabLimit ? (
                                <span className="text-rose-700 font-bold">4 / 3 — Session terminated</span>
                              ) : (
                                <span>Violations: <strong className="text-amber-800 font-bold">{alert.count || 1} / 3</strong></span>
                              )}
                            </div>
                          )}

                          <div className="text-[11px] text-slate-600 mt-1.5 pt-1.5 border-t border-slate-200/50 flex items-center justify-between">
                            <div>
                              <span className="text-slate-400">Student: </span>
                              <span className="font-bold text-slate-800">{alert.candidateName}</span>
                            </div>
                            {alert.candidateId && (
                              <span className="text-[9.5px] font-mono text-slate-400">
                                ID: {String(alert.candidateId).slice(-6)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      )}

      {/* =========================================================================
          END EXAM CONFIRMATION MODAL
          ========================================================================= */}
      <AnimatePresence>
        {showEndExamModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-exam-title"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
                  <StopCircle size={26} />
                </div>
                <div className="space-y-1">
                  <h3 id="end-exam-title" className="text-lg font-extrabold text-slate-900">
                    End Exam?
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Are you sure you want to end this examination session?
                    Students will no longer be able to continue the exam.
                  </p>
                </div>
              </div>

              {selectedRoom && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Room:</span>
                    <span className="font-bold text-slate-800">{selectedRoom.title || selectedRoomId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Active Students:</span>
                    <span className="font-bold text-slate-800 font-mono">{activeRoomStudents}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  autoFocus
                  disabled={endingRoom}
                  onClick={() => setShowEndExamModal(false)}
                  className="py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={endingRoom}
                  onClick={confirmEndExam}
                  className="py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-1"
                >
                  {endingRoom ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Ending Exam...</span>
                    </>
                  ) : (
                    <>
                      <StopCircle size={14} />
                      <span>End Exam</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =========================================================================
          MODALS: Participant Details & Student Integrity Report
          ========================================================================= */}
      {/* 1. Student Detail Inspection Modal */}
      <ParticipantDetailModal
        isOpen={isParticipantModalOpen}
        onClose={() => setIsParticipantModalOpen(false)}
        participant={selectedParticipant}
        roomId={selectedRoom?.roomId || selectedRoomId}
        roomTitle={selectedRoom?.title}
        mode={selectedRoom?.mode}
        onOpenReport={(p) => {
          setIsParticipantModalOpen(false);
          setSelectedSessionId(p?.sessionId || selectedParticipant?.sessionId);
          setIsReportModalOpen(true);
        }}
      />

      {/* 2. Official TrueView AI Proctoring Integrity Report Modal */}
      <ReportDetailModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        sessionId={selectedSessionId}
      />
    </div>
  );
}
