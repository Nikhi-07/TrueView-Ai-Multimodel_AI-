import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  Shield, Video, Users, Search, RefreshCw, AlertCircle, AlertTriangle, 
  CheckCircle2, Clock, ArrowLeft, ExternalLink, FileText, Eye, Activity, 
  Check, Copy, Share2, ChevronRight, Wifi, Bell, User, StopCircle, Radio
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';
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

  // Real-time Connection State (Section 12)
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

      // Filter historical alerts strictly belonging to this room (Section 15 & 16)
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

    // Real-time alerts handler (Section 4, 5, 10, 11, 13, 14)
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

    // Live participant joined (Section 2 & 8 & 9)
    const handleParticipantJoined = (data) => {
      if (!data) return;
      const alertRoom = data.roomId || (data.sessionId && data.sessionId.startsWith('TRV-') ? (data.sessionId.startsWith('TRV-TRV-') ? data.sessionId.split('-').slice(1, 3).join('-') : data.sessionId.split('-').slice(0, 2).join('-')) : null);

      // Update room participant count in overview
      setRooms((prev) => prev.map((r) => {
        if ((r.roomId || r.id)?.toUpperCase() === alertRoom?.toUpperCase()) {
          return {
            ...r,
            participantsCount: data.participantsCount !== undefined ? data.participantsCount : (r.participantsCount || 0) + 1,
            participants: data.participants || r.participants,
          };
        }
        return r;
      }));

      const activeRoomId = selectedRoomIdRef.current;
      if (activeRoomId && alertRoom && alertRoom.toUpperCase() === activeRoomId.toUpperCase()) {
        if (Array.isArray(data.participants)) {
          setParticipants(data.participants);
        } else if (data.candidate || data.student || data.user) {
          const candidate = data.candidate || data.student || data.user;
          const candidateId = candidate.id || data.studentId || data.userId || data.participantId;
          setParticipants((prev) => {
            const exists = prev.some((p) => p.id === candidateId || (data.sessionId && p.sessionId === data.sessionId));
            if (exists) {
              return prev.map((p) => (p.id === candidateId || (data.sessionId && p.sessionId === data.sessionId))
                ? { ...p, ...candidate, status: 'MONITORING', aiStatus: 'ONLINE' }
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
                status: 'MONITORING',
                aiStatus: 'ONLINE',
                riskScore: 0,
                riskLevel: 'NORMAL',
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
        showNotification(`${data.studentName || data.candidate?.name || 'Candidate'} joined the proctoring room.`);
      }
    };

    socket.on('participant_joined', handleParticipantJoined);
    socket.on('STUDENT_JOINED', handleParticipantJoined);

    // Participant left (Section 3 & 8 & 9)
    const handleParticipantLeft = (data) => {
      if (!data) return;
      const alertRoom = data.roomId || (data.sessionId && data.sessionId.startsWith('TRV-') ? (data.sessionId.startsWith('TRV-TRV-') ? data.sessionId.split('-').slice(1, 3).join('-') : data.sessionId.split('-').slice(0, 2).join('-')) : null);

      // Decrement room participant count in overview
      setRooms((prev) => prev.map((r) => {
        if ((r.roomId || r.id)?.toUpperCase() === alertRoom?.toUpperCase()) {
          return {
            ...r,
            participantsCount: Math.max(0, data.participantsCount !== undefined ? data.participantsCount : (r.participantsCount || 1) - 1),
          };
        }
        return r;
      }));

      const activeRoomId = selectedRoomIdRef.current;
      if (activeRoomId && alertRoom && alertRoom.toUpperCase() === activeRoomId.toUpperCase()) {
        const candidateId = data.candidateId || data.studentId || data.userId || data.id;
        const sessionId = data.sessionId;

        setParticipants((prev) =>
          prev.map((p) => {
            if ((candidateId && p.id === candidateId) || (sessionId && p.sessionId === sessionId)) {
              return {
                ...p,
                status: 'LEFT',
                aiStatus: 'DISCONNECTED',
                leftAt: new Date(),
              };
            }
            return p;
          })
        );

        showNotification(`${data.studentName || data.name || 'Candidate'} left the room.`);
      }
    };

    socket.on('participant_left', handleParticipantLeft);
    socket.on('STUDENT_LEFT', handleParticipantLeft);
    socket.on('STUDENT_DISCONNECTED', handleParticipantLeft);

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
    socket.on('room_participants_updated', (data) => {
      const alertRoom = data.roomId;
      if (alertRoom) {
        setRooms((prev) => prev.map((r) => {
          if ((r.roomId || r.id)?.toUpperCase() === alertRoom.toUpperCase()) {
            return {
              ...r,
              participantsCount: data.participantsCount !== undefined ? data.participantsCount : (r.participantsCount || 0),
              participants: data.participants || r.participants,
            };
          }
          return r;
        }));
      }

      const activeRoomId = selectedRoomIdRef.current;
      if (activeRoomId && alertRoom && alertRoom.toUpperCase() === activeRoomId.toUpperCase()) {
        if (Array.isArray(data.participants)) {
          setParticipants(data.participants);
        }
      }
    });

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

  const handleEndRoom = async () => {
    if (!selectedRoomId) return;
    if (!window.confirm(`Are you sure you want to conclude examination "${selectedRoom?.title || selectedRoomId}"? All active student sessions will be marked completed.`)) {
      return;
    }

    setEndingRoom(true);
    try {
      const res = await api.post(`/rooms/${selectedRoomId}/end`);
      if (res.data?.success) {
        showNotification(`Room ${selectedRoomId} ended. Candidate reports generated.`);
        fetchSelectedRoom(selectedRoomId);
        fetchOverviewData();
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to end examination');
    } finally {
      setEndingRoom(false);
    }
  };

  const getFullJoinUrl = (room) => {
    const roomId = room?.roomId || room?.id;
    const token = room?.joinCode || room?.joinToken || '';
    const origin = window.location.origin;
    return `${origin}/join/${roomId}${token ? `?token=${token}` : ''}`;
  };

  const handleCopyLink = async (room) => {
    const roomId = room?.roomId || room?.id;
    const url = getFullJoinUrl(room);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(roomId);
      showNotification('Candidate join link copied to clipboard');
      setTimeout(() => setCopiedId(null), 2500);
    } catch (_) {
      showNotification('Failed to copy join link');
    }
  };

  // Section 4: REAL KPI Computations (No fake or hardcoded values)
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

  // Section 5: Filtered Rooms for Selection
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

  // Section 6: Specific Active Room Summary
  const roomStatus = selectedRoom?.status === 'ENDED' ? 'ENDED' : 'LIVE';
  const totalRoomStudents = participants.length;
  const activeRoomStudents = participants.filter((p) => p.status === 'MONITORING' || p.status === 'VERIFYING').length;
  const totalRoomAlerts = liveAlerts.length;
  const criticalRoomAlerts = liveAlerts.filter((a) =>
    ['CRITICAL', 'HIGH', 'DANGER'].includes(String(a.severity).toUpperCase())
  ).length;

  return (
    <div className="space-y-6 select-none font-sans pb-12">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-20 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl border border-slate-700 text-xs font-semibold shadow-2xl flex items-center gap-3 animate-fade-in">
          <Shield size={16} className="text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Page Header (Section 4) */}
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSearchParams({})}
                className="py-2 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-2 shadow-xs transition cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>All Rooms</span>
              </button>

              <button
                onClick={() => navigate(`/proctor-room-host/${selectedRoomId}`)}
                className="py-2 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition cursor-pointer"
                title="Open Fullscreen Proctor Monitoring View"
              >
                <ExternalLink size={14} className="text-emerald-400" />
                <span>Fullscreen Host View</span>
              </button>

              {selectedRoom?.status !== 'ENDED' && (
                <button
                  onClick={handleEndRoom}
                  disabled={endingRoom}
                  className="py-2 px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50"
                  title="Conclude Examination and Finalize Student Reports"
                >
                  <StopCircle size={14} />
                  <span>{endingRoom ? 'Concluding...' : 'End Exam'}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={fetchOverviewData}
                disabled={loading}
                className="py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                title="Refresh Proctor Data"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>

              <button
                onClick={() => navigate('/rooms')}
                className="py-2 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition cursor-pointer"
              >
                <Video size={14} />
                <span>Virtual Rooms</span>
              </button>
            </div>
          )
        }
      />

      {/* Top Summary Cards (Section 4: Real Backend Data) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* TOTAL ROOMS */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
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
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
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
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
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
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
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
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs col-span-2 sm:col-span-1">
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
          VIEW A: ROOM SELECTION (Section 5)
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

          {/* Section 5: Room Selection List/Cards */}
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

                    {/* Action: Open Room Dashboard (Section 5) */}
                    <div className="pt-2">
                      <button
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
          VIEW B: ROOM MONITORING DASHBOARD (Section 6, 7, 8, 9, 10, 11)
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
                onClick={() => setSearchParams({})}
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
                onClick={() => setSearchParams({})}
                className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <ArrowLeft size={14} />
                <span>Return to All Rooms</span>
              </button>
              <button
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
          {/* Section 6: Specific Room Monitoring Dashboard Summary */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-xs font-mono font-bold text-slate-900 px-2.5 py-0.5 rounded bg-slate-100 border border-slate-200">
                    Room ID: {selectedRoomId}
                  </span>
                  <span
                    className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${
                      roomStatus === 'LIVE'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {roomStatus === 'LIVE' && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                    Status: {roomStatus}
                  </span>
                  {/* Real-time Socket Connection Badge (Section 12) */}
                  <span
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${
                      isConnected
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500 animate-ping'}`} />
                    {isConnected ? 'REAL-TIME CONNECTED' : 'REAL-TIME CONNECTION LOST'}
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
                    onClick={() => handleCopyLink(selectedRoom)}
                    className="py-2 px-3 rounded-xl bg-white hover:bg-[#F1F5F9] text-[#0F172A] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-[#CBD5E1] shadow-xs"
                    title="Copy Student Join Link"
                  >
                    {copiedId === selectedRoomId ? (
                      <Check size={13} className="text-emerald-600 font-bold" />
                    ) : (
                      <Copy size={13} className="text-[#0F172A]" />
                    )}
                    <span>{copiedId === selectedRoomId ? 'Copied' : 'Copy Student Link'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Room-level Statistics (Section 6) */}
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
            {/* Section 7: STUDENT MONITORING (8 cols) */}
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
                <div className="p-8 text-center space-y-3 bg-slate-50 rounded-xl border border-slate-200">
                  <Users size={28} className="text-slate-400 mx-auto" />
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Waiting for Students to Join</h4>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                      Share the student invitation link. Joined candidates will appear here automatically with real-time AI metrics.
                    </p>
                  </div>
                  {selectedRoom && (
                    <button
                      onClick={() => handleCopyLink(selectedRoom)}
                      className="py-2 px-3.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition inline-flex items-center gap-2 cursor-pointer shadow-xs"
                    >
                      <Copy size={13} />
                      <span>Copy Student Join Link</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200/80 text-[10.5px] font-mono uppercase text-slate-400 tracking-wider">
                        <th className="py-2.5 px-3">Student Name</th>
                        <th className="py-2.5 px-2">Status</th>
                        <th className="py-2.5 px-2">Liveness</th>
                        <th className="py-2.5 px-2">Identity</th>
                        <th className="py-2.5 px-2">Attention</th>
                        <th className="py-2.5 px-2">Risk</th>
                        <th className="py-2.5 px-2">Alerts</th>
                        <th className="py-2.5 px-2">Tab Switches</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {participants.map((p, idx) => {
                        const isTerminated = p.status === 'TERMINATED' || (p.tabSwitchCount || 0) >= 4;
                        const riskScore = isTerminated ? 100 : (p.riskScore || 0);
                        const rawRisk = isTerminated ? 'CRITICAL' : (p.riskLevel || (riskScore > 60 ? 'HIGH' : riskScore > 20 ? 'MEDIUM' : 'LOW'));
                        const riskLevel = rawRisk === 'NORMAL' ? 'LOW' : rawRisk;
                        const isVerifiedIdentity = p.identityStatus === 'VERIFIED';
                        const isLive = p.liveness === 'LIVE' || p.liveness === 'VERIFIED' || p.liveness === 'REAL';
                        const attentionValue = p.attentionScore !== undefined
                          ? p.attentionScore
                          : (p.gaze === 'center' ? (riskScore > 20 ? 71 : 92) : 65);

                        return (
                          <tr key={p.id || p.sessionId || idx} className="hover:bg-slate-50/80 transition-colors">
                            {/* Student Name & AI Status */}
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${
                                    isTerminated
                                      ? 'bg-rose-500'
                                      : p.status === 'LEFT' || p.aiStatus === 'OFFLINE' || p.aiStatus === 'DISCONNECTED'
                                      ? 'bg-slate-400'
                                      : p.aiStatus === 'PROCESSING'
                                      ? 'bg-blue-500 animate-pulse'
                                      : 'bg-emerald-500 animate-pulse'
                                  }`}
                                  title={`AI Pipeline: ${isTerminated ? 'TERMINATED' : p.status === 'LEFT' ? 'DISCONNECTED' : (p.aiStatus || 'ONLINE')}`}
                                />
                                <div className="font-bold text-slate-900 leading-tight">
                                  {p.name || 'Candidate'}
                                </div>
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                                <span className="truncate max-w-[140px]">{p.email || p.sessionId || 'Candidate'}</span>
                                <span className={`text-[9px] uppercase font-bold px-1 rounded ${
                                  isTerminated
                                    ? 'bg-rose-50 text-rose-700 font-extrabold'
                                    : p.status === 'LEFT' || p.aiStatus === 'OFFLINE' || p.aiStatus === 'DISCONNECTED'
                                    ? 'bg-slate-100 text-slate-500'
                                    : 'bg-emerald-50 text-emerald-700'
                                }`}>
                                  AI: {isTerminated ? 'TERMINATED' : p.status === 'LEFT' ? 'DISCONNECTED' : (p.aiStatus || 'ONLINE')}
                                </span>
                              </div>
                            </td>

                            {/* Status */}
                            <td className="py-3 px-2">
                              <div>
                                <span
                                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                                    isTerminated
                                      ? 'bg-rose-100 text-rose-800 border border-rose-300 font-extrabold'
                                      : p.status === 'MONITORING'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : p.status === 'SUSPENDED'
                                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                      : p.status === 'LEFT'
                                      ? 'bg-slate-100 text-slate-500'
                                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                                  }`}
                                >
                                  {isTerminated ? 'TERMINATED' : (p.status || 'MONITORING')}
                                </span>
                                {isTerminated && (
                                  <div className="text-[9px] text-rose-600 font-bold uppercase mt-0.5 leading-tight">
                                    {p.terminationReason || 'TAB SWITCH LIMIT EXCEEDED'}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Liveness */}
                            <td className="py-3 px-2">
                              <span
                                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                                  isLive
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-rose-50 text-rose-700'
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
                              {p.violations || 0} alerts
                            </td>

                            {/* Tab Switches */}
                            <td className="py-3 px-2">
                              <span className={`font-mono text-xs font-extrabold ${
                                isTerminated || (p.tabSwitchCount || 0) >= 4
                                  ? 'text-rose-600 font-black'
                                  : (p.tabSwitchCount || 0) === 3
                                  ? 'text-rose-600'
                                  : (p.tabSwitchCount || 0) > 0
                                  ? 'text-amber-600'
                                  : 'text-slate-700'
                              }`}>
                                {isTerminated ? Math.max(p.tabSwitchCount || 4, 4) : (p.tabSwitchCount || 0)} / 3
                              </span>
                            </td>

                            {/* Actions (Section 9) */}
                            <td className="py-3 px-3 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
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
                                  onClick={() => {
                                    setSelectedSessionId(p.sessionId);
                                    setIsReportModalOpen(true);
                                  }}
                                  className="py-1 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10.5px] transition cursor-pointer flex items-center gap-1"
                                  title="Open Candidate Proctoring Integrity Report"
                                >
                                  <FileText size={11} />
                                  <span>View Report</span>
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

            {/* Section 8: LIVE ALERTS (4 cols) */}
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

              {/* Real-time alert list (Section 8 & 10) */}
              <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                {liveAlerts.length === 0 ? (
                  <div className="py-12 text-center space-y-2 bg-slate-50 rounded-xl border border-slate-100 p-4">
                    <CheckCircle2 size={24} className="text-emerald-500 mx-auto" />
                    <h4 className="text-xs font-bold text-slate-800">No Violations Detected</h4>
                    <p className="text-[11px] text-slate-500">
                      All candidates in room {selectedRoomId} are adhering to examination standards.
                    </p>
                  </div>
                ) : (
                  liveAlerts.map((alert) => {
                    const alertType = alert.type || alert.eventType || '';
                    const isTabDetected = alertType === 'TAB_SWITCH_DETECTED';
                    const isTabLimit = alertType === 'TAB_SWITCH_LIMIT_EXCEEDED';
                    const sev = String(alert.severity || (isTabLimit ? 'CRITICAL' : isTabDetected ? 'MEDIUM' : 'MEDIUM')).toUpperCase();
                    const isHigh = sev === 'HIGH' || sev === 'CRITICAL' || sev === 'DANGER' || isTabLimit;
                    const isMed = sev === 'MEDIUM' || isTabDetected;

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
                          isTabLimit
                            ? 'bg-rose-100/90 border-rose-400 text-rose-950 shadow-sm'
                            : isHigh
                            ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                            : isMed
                            ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                            : 'bg-slate-50 border-slate-200 text-slate-900'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span
                            className={`text-[9.5px] font-mono font-extrabold px-1.5 py-0.5 rounded ${
                              isTabLimit || sev === 'CRITICAL'
                                ? 'bg-rose-600 text-white animate-pulse'
                                : isHigh
                                ? 'bg-rose-600 text-white'
                                : isMed
                                ? 'bg-amber-500 text-white'
                                : 'bg-slate-700 text-white'
                            }`}
                          >
                            [{sev}]
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 font-semibold">
                            Time: {timeStr}
                          </span>
                        </div>

                        {/* Alert Headline */}
                        <div className="text-xs font-bold text-slate-900 leading-snug flex items-center gap-1.5">
                          {isTabLimit ? (
                            <span className="text-rose-700 flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping inline-block" />
                              🔴 TAB SWITCH LIMIT EXCEEDED
                            </span>
                          ) : isTabDetected ? (
                            <span className="text-amber-700 flex items-center gap-1">
                              ⚠ TAB SWITCH DETECTED
                            </span>
                          ) : (
                            alert.message
                          )}
                        </div>

                        {/* Extra Tab Switch Context */}
                        {(isTabLimit || isTabDetected) && (
                          <div className="text-[11px] font-mono text-slate-700 mt-0.5">
                            {isTabLimit ? (
                              <span className="text-rose-700 font-bold">4 / 3 — Session terminated</span>
                            ) : (
                              <span>Warning: <strong className="text-amber-800 font-bold">{alert.count || 1} / 3</strong></span>
                            )}
                          </div>
                        )}

                        <div className="text-[11px] text-slate-600 mt-1 flex items-center gap-1">
                          <span>Student:</span>
                          <span className="font-semibold text-slate-800">{alert.candidateName}</span>
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
          MODALS: Participant Details & Student Integrity Report (Section 9)
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

      {/* 2. Official TrueView AI Proctoring Integrity Report Modal (Section 9) */}
      <ReportDetailModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        sessionId={selectedSessionId}
      />
    </div>
  );
}
