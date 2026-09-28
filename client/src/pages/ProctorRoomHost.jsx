import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Shield, Video, Users, Copy, Share2, PhoneOff, AlertTriangle, AlertCircle, 
  CheckCircle2, RefreshCw, Eye, Play, FileText, Smartphone, Mic, Clock, 
  ExternalLink, Volume2, UserCheck, Activity, Bell, Check, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import ParticipantDetailModal from '../components/Modals/ParticipantDetailModal';
import SessionDetailModal from '../components/Modals/SessionDetailModal';
import ReportDetailModal from '../components/Modals/ReportDetailModal';

export default function ProctorRoomHost() {
  const { id: roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [highlightedCandidateId, setHighlightedCandidateId] = useState(null);
  const [showEndModal, setShowEndModal] = useState(false);
  const [activeViewTab, setActiveViewTab] = useState('GRID'); // 'GRID' | 'REPORTS'

  // Modals state
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const socketRef = useRef(null);

  useEffect(() => {
    fetchRoomDetails();
    initSocketConnection();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [roomId]);

  const showNotification = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const fetchRoomDetails = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/rooms/${roomId}`);
      if (res.data.success && res.data.room) {
        setRoom(res.data.room);
        if (Array.isArray(res.data.room.participants)) {
          setParticipants(res.data.room.participants);
        }
      }
    } catch (err) {
      console.warn('Could not fetch room details:', err);
    } finally {
      setLoading(false);
    }
  };

  const initSocketConnection = () => {
    const token = localStorage.getItem('trueview_token');
    const socket = io({
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      auth: { token: token || undefined },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log(`[ProctorHost] Connected to Socket.IO. Joining proctor:${roomId}`);
      socket.emit('join_room', {
        roomId,
        sessionId: roomId,
        role: 'reviewer',
        user: user ? { id: String(user._id || user.id), name: user.fullName || user.name, role: user.role } : null,
      });
    });

    // Real-time proctor alert listener
    socket.on('proctor_alert', (alert) => {
      console.log('[ProctorHost] Received live proctor_alert:', alert);
      const newAlert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        candidateName: alert.candidateName || 'Candidate',
        candidateId: alert.candidateId,
        type: alert.type || alert.eventType || 'AI_ALERT',
        severity: alert.severity || 'MEDIUM',
        riskScore: alert.riskScore || 0,
        message: alert.message || alert.evidence || alert.type,
        timestamp: alert.timestamp ? new Date(alert.timestamp) : new Date(),
      };

      setLiveAlerts((prev) => [newAlert, ...prev].slice(0, 100));

      // Highlight participant card
      if (alert.candidateId) {
        setHighlightedCandidateId(alert.candidateId);
        setTimeout(() => setHighlightedCandidateId(null), 4000);
      }

      // Update participant risk and violations
      setParticipants((prev) =>
        prev.map((p) => {
          if (p.id === alert.candidateId || p.sessionId === alert.sessionId) {
            return {
              ...p,
              riskScore: alert.riskScore !== undefined ? alert.riskScore : p.riskScore,
              riskLevel: alert.severity === 'CRITICAL' || alert.severity === 'HIGH' ? 'HIGH' : p.riskLevel,
              violations: (p.violations || 0) + 1,
              phoneDetected: alert.type === 'PHONE_DETECTED' ? true : p.phoneDetected,
            };
          }
          return p;
        })
      );

      // Toast notification for High/Critical
      if (alert.severity === 'CRITICAL' || alert.severity === 'HIGH') {
        showNotification(`[HIGH ALERT] ${alert.candidateName || 'Candidate'}: ${alert.type?.replace(/_/g, ' ')}`);
      }
    });

    // Participant joined
    socket.on('participant_joined', (data) => {
      if (data.candidate) {
        showNotification(`${data.candidate.name || 'Candidate'} joined the proctoring room.`);
        setParticipants((prev) => {
          const exists = prev.some((p) => p.id === data.candidate.id || p.sessionId === data.sessionId);
          if (exists) {
            return prev.map((p) => (p.id === data.candidate.id ? { ...p, ...data.candidate, status: 'MONITORING' } : p));
          }
          return [...prev, { ...data.candidate, status: 'MONITORING' }];
        });
      }
      if (data.participants) {
        setParticipants(data.participants);
      }
    });

    // Participant left
    socket.on('participant_left', (data) => {
      if (data.candidateId) {
        setParticipants((prev) =>
          prev.map((p) => (p.id === data.candidateId ? { ...p, status: 'LEFT' } : p))
        );
      }
    });

    // Risk updated
    socket.on('participant_risk_updated', (data) => {
      setParticipants((prev) =>
        prev.map((p) => {
          if (p.id === data.candidateId || p.sessionId === data.sessionId) {
            return {
              ...p,
              riskScore: data.riskScore !== undefined ? data.riskScore : p.riskScore,
              riskLevel: data.riskLevel || p.riskLevel,
              violations: data.violations !== undefined ? data.violations : p.violations,
              liveness: data.liveness || p.liveness,
              faceDetected: data.faceDetected !== undefined ? data.faceDetected : p.faceDetected,
              phoneDetected: data.phoneDetected !== undefined ? data.phoneDetected : p.phoneDetected,
            };
          }
          return p;
        })
      );
    });

    // Room participants list updated
    socket.on('room_participants_updated', (data) => {
      if (Array.isArray(data.participants)) {
        setParticipants(data.participants);
      }
    });
  };

  const getJoinUrl = () => {
    const origin = window.location.origin;
    const token = room?.joinCode || '';
    return `${origin}/join/${roomId}${token ? `?token=${token}` : ''}`;
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(getJoinUrl());
      setCopiedLink(true);
      showNotification('Join link copied');
      setTimeout(() => setCopiedLink(false), 2500);
    } catch (_) {
      showNotification('Failed to copy link.');
    }
  };

  const handleShareLink = async () => {
    const joinUrl = getJoinUrl();
    const title = room?.title || 'TrueView AI Proctoring Room';
    const text = `Join TrueView AI Proctoring Session:\n"${title}"\nRoom ID: ${roomId}\nJoin Link: ${joinUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: joinUrl });
      } catch (err) {
        if (err.name !== 'AbortError') handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  const handleEndRoom = async () => {
    try {
      const res = await api.post(`/rooms/${roomId}/end`);
      if (res.data.success) {
        setRoom((prev) => ({ ...prev, status: 'ENDED' }));
        setShowEndModal(false);
        showNotification('Examination ended. Student reports finalized.');
        fetchRoomDetails();
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to end room.');
    }
  };

  const openParticipantDetail = (participant) => {
    setSelectedParticipant(participant);
    setIsDetailModalOpen(true);
  };

  const openSessionDetail = (sessId) => {
    setSelectedSessionId(sessId);
    setIsSessionModalOpen(true);
  };

  const openReport = (sessId) => {
    setSelectedSessionId(sessId);
    setIsReportModalOpen(true);
  };

  const activeCandidates = participants.filter((p) => p.status !== 'LEFT');
  const isEnded = room?.status === 'ENDED';

  // Room Summary KPI Metrics (Real Data)
  const totalStudents = participants.length;
  const activeStudents = participants.filter((p) => p.status === 'MONITORING' || p.status === 'VERIFYING' || p.status === 'WAITING').length;
  const completedStudents = participants.filter((p) => p.status === 'COMPLETED').length;
  const studentsWithAlerts = participants.filter((p) => (p.violations || p.alertCount || 0) > 0).length;
  const criticalAlertsCount = liveAlerts.filter((a) => a.severity === 'CRITICAL' || a.severity === 'HIGH').length;
  const totalAlertsCount = participants.reduce((acc, p) => acc + (p.violations || p.alertCount || 0), 0) || liveAlerts.length;

  return (
    <div className="min-h-screen bg-[#121316] text-white flex flex-col font-sans select-none">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-18 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl border border-slate-700 text-xs font-semibold shadow-2xl flex items-center gap-3 animate-fade-in">
          <Shield size={16} className="text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="h-16 bg-[#1a1c22] border-b border-[#2a2d36] px-6 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Shield size={16} />
            <span className="font-mono font-extrabold text-xs tracking-wider">TRUEVIEW AI</span>
          </div>

          <div className="h-4 w-px bg-zinc-700" />

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white truncate max-w-md">
                {room?.title || `Proctor Room ${roomId}`}
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {room?.mode || 'EXAM'}
              </span>
              <span className="text-xs font-mono text-zinc-400">
                (ID: {roomId})
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleCopyLink}
            className="py-1.5 px-3 rounded-lg bg-[#2b2e38] hover:bg-[#353945] text-zinc-200 border border-[#3f4350] text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            title="Copy Public Candidate Join Link"
          >
            {copiedLink ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            <span>{copiedLink ? 'Copied Link' : 'Copy Invite Link'}</span>
          </button>

          <button
            onClick={handleShareLink}
            className="py-1.5 px-3 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            title="Share to WhatsApp / Candidate"
          >
            <Share2 size={13} />
            <span>Share</span>
          </button>

          <button
            onClick={() => navigate('/rooms')}
            className="py-1.5 px-3 rounded-lg bg-[#2b2e38] hover:bg-[#353945] text-zinc-400 hover:text-white text-xs font-semibold transition cursor-pointer"
          >
            Exit to Rooms
          </button>

          {!isEnded ? (
            <button
              onClick={() => setShowEndModal(true)}
              className="py-1.5 px-3.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-md cursor-pointer"
            >
              <PhoneOff size={13} />
              <span>End Examination</span>
            </button>
          ) : (
            <span className="px-3 py-1 bg-zinc-800 text-zinc-400 text-xs font-bold rounded-lg border border-zinc-700">
              ROOM ENDED
            </span>
          )}
        </div>
      </header>

      {/* ROOM SUMMARY KPI BANNER (Section 16) */}
      <div className="bg-[#171920] border-b border-[#2a2d36] px-6 py-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-[#1e2029] border border-[#2d313d] rounded-xl p-3 flex flex-col justify-between">
            <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">Total Students</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black text-white">{totalStudents}</span>
              <span className="text-[10px] text-zinc-500 font-semibold">enrolled</span>
            </div>
          </div>
          <div className="bg-[#1e2029] border border-[#2d313d] rounded-xl p-3 flex flex-col justify-between">
            <span className="text-[10px] uppercase font-mono tracking-wider text-emerald-400">Active Students</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black text-emerald-400">{activeStudents}</span>
              <span className="text-[10px] text-emerald-600 font-semibold">live</span>
            </div>
          </div>
          <div className="bg-[#1e2029] border border-[#2d313d] rounded-xl p-3 flex flex-col justify-between">
            <span className="text-[10px] uppercase font-mono tracking-wider text-blue-400">Completed</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black text-blue-400">{completedStudents}</span>
              <span className="text-[10px] text-blue-600 font-semibold">finished</span>
            </div>
          </div>
          <div className="bg-[#1e2029] border border-[#2d313d] rounded-xl p-3 flex flex-col justify-between">
            <span className="text-[10px] uppercase font-mono tracking-wider text-amber-400">Students With Alerts</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black text-amber-400">{studentsWithAlerts}</span>
              <span className="text-[10px] text-amber-600 font-semibold">flagged</span>
            </div>
          </div>
          <div className="bg-[#1e2029] border border-[#2d313d] rounded-xl p-3 flex flex-col justify-between">
            <span className="text-[10px] uppercase font-mono tracking-wider text-rose-400">Critical Alerts</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black text-rose-400">{criticalAlertsCount}</span>
              <span className="text-[10px] text-rose-600 font-semibold">high priority</span>
            </div>
          </div>
          <div className="bg-[#1e2029] border border-[#2d313d] rounded-xl p-3 flex flex-col justify-between">
            <span className="text-[10px] uppercase font-mono tracking-wider text-purple-400">Total Alerts</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black text-purple-400">{totalAlertsCount}</span>
              <span className="text-[10px] text-purple-600 font-semibold">events</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Layout: Left (Grid / Reports) + Right (Live Alerts Panel) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        
        {/* Left Area: View Switcher (Participant Cards Grid vs Student Reports Table) */}
        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveViewTab('GRID')}
                className={`py-2 px-3.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                  activeViewTab === 'GRID'
                    ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                    : 'bg-[#1f222b] text-zinc-300 hover:bg-[#282c37] border border-[#2f3340]'
                }`}
              >
                <Users size={14} />
                <span>Live Participant Grid ({activeCandidates.length})</span>
              </button>

              <button
                onClick={() => setActiveViewTab('REPORTS')}
                className={`py-2 px-3.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                  activeViewTab === 'REPORTS'
                    ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                    : 'bg-[#1f222b] text-zinc-300 hover:bg-[#282c37] border border-[#2f3340]'
                }`}
              >
                <FileText size={14} />
                <span>Student Reports ({participants.length})</span>
              </button>
            </div>

            <button
              onClick={fetchRoomDetails}
              className="p-2 rounded-xl bg-[#1f222b] hover:bg-[#282c37] text-zinc-300 hover:text-white border border-[#2f3340] transition cursor-pointer"
              title="Refresh Room & Participants"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {loading ? (
            <div className="py-24 text-center text-zinc-500 font-mono text-xs">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              SYNCHRONIZING PARTICIPANTS...
            </div>
          ) : participants.length === 0 ? (
            <div className="py-20 text-center bg-[#1a1c22] border border-[#2a2d36] rounded-2xl p-8 space-y-4">
              <div className="w-14 h-14 rounded-full bg-[#242730] text-zinc-500 flex items-center justify-center mx-auto">
                <Users size={28} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">No Candidates Connected Yet</h3>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto mt-1">
                  Share the candidate invite link so students or interviewees can join this monitored room.
                </p>
              </div>
              <button
                onClick={handleCopyLink}
                className="py-2 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition inline-flex items-center gap-2 cursor-pointer"
              >
                <Copy size={14} />
                Copy Candidate Invite Link
              </button>
            </div>
          ) : activeViewTab === 'GRID' ? (
            /* LIVE PARTICIPANT GRID (Section 9) */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {participants.map((candidate, idx) => {
                const isHighRisk = candidate.riskScore > 60 || candidate.riskLevel === 'HIGH';
                const isMediumRisk = candidate.riskScore > 20 && !isHighRisk;
                const isTargetHighlighted = highlightedCandidateId === candidate.id;
                const riskLevelLabel = candidate.riskLevel || (isHighRisk ? 'HIGH' : isMediumRisk ? 'MEDIUM' : 'LOW');

                return (
                  <motion.div
                    key={candidate.id || candidate.sessionId || idx}
                    layout
                    className={`bg-[#1a1c22] rounded-2xl p-5 border flex flex-col justify-between transition-all duration-300 relative overflow-hidden ${
                      isTargetHighlighted
                        ? 'border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.35)] ring-2 ring-rose-500'
                        : isHighRisk
                        ? 'border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
                        : 'border-[#2a2d36] hover:border-[#3f4350]'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Student Name & Status */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-[#242730] border border-[#353945] text-zinc-200 flex items-center justify-center font-bold text-sm">
                            {candidate.name?.charAt(0) || 'S'}
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-white truncate max-w-[140px]">
                              {candidate.name || 'Candidate'}
                            </h3>
                            <span className="text-[10px] text-zinc-400 block font-mono truncate max-w-[140px]">
                              {candidate.sessionId || candidate.id || 'N/A'}
                            </span>
                          </div>
                        </div>

                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                          candidate.status === 'MONITORING'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : candidate.status === 'SUSPENDED'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : candidate.status === 'COMPLETED'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                            : candidate.status === 'LEFT'
                            ? 'bg-zinc-800 text-zinc-400 border-zinc-700'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}>
                          ● {candidate.status || 'MONITORING'}
                        </span>
                      </div>

                      {/* Section 9 Grid Fields: Camera, Liveness, Identity, Attention */}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#2a2d36]/60 text-xs">
                        <div className="p-2 rounded-xl bg-[#141518] border border-[#242730] flex items-center justify-between">
                          <span className="text-[11px] text-zinc-400">Camera</span>
                          <span className={`text-xs font-bold flex items-center gap-1.5 ${candidate.cameraActive !== false ? 'text-emerald-400' : 'text-rose-400'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${candidate.cameraActive !== false ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                            {candidate.cameraActive !== false ? 'Active' : 'Offline'}
                          </span>
                        </div>

                        <div className="p-2 rounded-xl bg-[#141518] border border-[#242730] flex items-center justify-between">
                          <span className="text-[11px] text-zinc-400">Liveness</span>
                          <span className={`text-xs font-bold ${candidate.liveness === 'SPOOF' ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {candidate.liveness || 'VERIFIED'}
                          </span>
                        </div>

                        <div className="p-2 rounded-xl bg-[#141518] border border-[#242730] flex items-center justify-between">
                          <span className="text-[11px] text-zinc-400">Identity</span>
                          <span className={`text-xs font-bold ${candidate.identityStatus === 'MISMATCH' ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {candidate.identityStatus || 'VERIFIED'}
                          </span>
                        </div>

                        <div className="p-2 rounded-xl bg-[#141518] border border-[#242730] flex items-center justify-between">
                          <span className="text-[11px] text-zinc-400">Attention</span>
                          <span className="text-xs font-bold text-white">
                            {candidate.attention !== undefined ? `${candidate.attention}%` : '92%'}
                          </span>
                        </div>
                      </div>

                      {/* Risk Level and Alert Count */}
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#141518] border border-[#242730]">
                        <div>
                          <span className="text-[10px] text-zinc-400 block font-medium">Risk Level</span>
                          <span className={`text-xs font-black uppercase px-2 py-0.5 rounded border inline-block mt-0.5 ${
                            riskLevelLabel === 'HIGH'
                              ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                              : riskLevelLabel === 'MEDIUM'
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                              : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          }`}>
                            {riskLevelLabel}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-zinc-400 block font-medium">Alerts</span>
                          <span className="text-base font-black text-white font-mono">
                            {candidate.violations || candidate.alertCount || 0}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions: View Details / View Report */}
                    <div className="pt-3 border-t border-[#2a2d36] mt-4 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => openParticipantDetail(candidate)}
                        className="py-2 px-2.5 rounded-xl bg-[#242730] hover:bg-[#2e323e] border border-[#353945] text-xs font-bold text-white flex items-center justify-center gap-1.5 transition cursor-pointer"
                        title="View telemetry, verification, and alert history"
                      >
                        <Eye size={13} className="text-emerald-400" />
                        <span>View</span>
                      </button>
                      <button
                        onClick={() => openReport(candidate.sessionId)}
                        className="py-2 px-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-xs font-bold text-emerald-300 flex items-center justify-center gap-1.5 transition cursor-pointer"
                        title="Open Proctoring Integrity Report"
                      >
                        <FileText size={13} />
                        <span>Report</span>
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            /* STUDENT REPORTS TABLE (Section 15) */
            <div className="bg-[#1a1c22] border border-[#2a2d36] rounded-2xl overflow-hidden shadow-xl">
              <div className="p-4 border-b border-[#2a2d36] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <FileText size={16} className="text-emerald-400" />
                    Student Reports
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Individual candidate session reports, violations, and multimodal integrity verdicts.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#141518] border-b border-[#2a2d36] text-[11px] font-mono uppercase text-zinc-400">
                    <tr>
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-center">Alerts</th>
                      <th className="py-3 px-4 text-center">Risk</th>
                      <th className="py-3 px-4 text-right">Report</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2d36]">
                    {participants.map((p, idx) => {
                      const riskLevel = p.riskLevel || (p.riskScore > 60 ? 'HIGH' : p.riskScore > 20 ? 'MEDIUM' : 'LOW');
                      return (
                        <tr key={p.id || p.sessionId || idx} className="hover:bg-[#20222a] transition">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-[#242730] border border-[#353945] text-zinc-200 flex items-center justify-center font-bold text-xs">
                                {p.name?.charAt(0) || 'S'}
                              </div>
                              <div>
                                <span className="font-bold text-white block">{p.name || 'Candidate'}</span>
                                <span className="text-[10px] text-zinc-400 font-mono block">{p.sessionId || p.id || 'N/A'}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                              p.status === 'COMPLETED'
                                ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                                : p.status === 'MONITORING'
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                : p.status === 'LEFT'
                                ? 'bg-zinc-800 text-zinc-400 border-zinc-700'
                                : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                            }`}>
                              {p.status || 'MONITORING'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className={`inline-block font-mono font-bold px-2 py-0.5 rounded text-xs ${
                              (p.violations || 0) > 0 ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-zinc-800 text-zinc-400'
                            }`}>
                              {p.violations || 0}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              riskLevel === 'HIGH' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : riskLevel === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            }`}>
                              {riskLevel}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => openReport(p.sessionId)}
                              className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                              title="View Proctoring Integrity Report"
                            >
                              <FileText size={13} />
                              <span>View</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right Area: Real-Time Live AI Alerts Panel */}
        <div className="w-full lg:w-96 bg-[#17181c] border-t lg:border-t-0 lg:border-l border-[#2a2d36] flex flex-col shrink-0">
          
          <div className="p-4 border-b border-[#2a2d36] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Live AI Violation Stream
              </h3>
            </div>
            <span className="text-[10px] font-mono font-bold text-zinc-400 bg-[#242730] px-2 py-0.5 rounded">
              {liveAlerts.length} Events
            </span>
          </div>

          <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-2.5">
            {liveAlerts.length === 0 ? (
              <div className="py-24 text-center text-zinc-500 text-xs">
                <Shield size={24} className="mx-auto mb-2 text-zinc-600" />
                <span>Listening for real-time candidate AI events...</span>
              </div>
            ) : (
              liveAlerts.map((alert) => {
                const isCritical = alert.severity === 'CRITICAL' || alert.severity === 'HIGH';
                const isMedium = alert.severity === 'MEDIUM';

                return (
                  <motion.div
                    key={alert.id}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                      isCritical
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                        : isMedium
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                        : 'bg-blue-500/10 border-blue-500/30 text-blue-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase font-mono ${
                          isCritical ? 'bg-rose-600 text-white' : isMedium ? 'bg-amber-600 text-white' : 'bg-blue-600 text-white'
                        }`}>
                          {alert.severity}
                        </span>
                        <span className="font-bold text-white truncate max-w-[120px]">
                          {alert.candidateName}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                      </span>
                    </div>

                    <div className="font-semibold text-white text-[11px]">
                      {alert.type?.replace(/_/g, ' ')}
                    </div>

                    <div className="text-[10px] text-zinc-300 leading-snug line-clamp-2">
                      {alert.message}
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] text-zinc-400">
                      <span>Risk Impact:</span>
                      <span className="font-bold text-white">{alert.riskScore}%</span>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* END ROOM CONFIRMATION MODAL */}
      <AnimatePresence>
        {showEndModal && (
          <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-center space-y-5 shadow-2xl"
            >
              <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
                <PhoneOff size={28} />
              </div>

              <div>
                <h3 className="text-lg font-bold text-white mb-1">
                  End Examination?
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed font-medium">
                  End this examination for all participants? Active monitoring sessions will be finalized, participant statuses updated to COMPLETED, and student integrity reports generated.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => setShowEndModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEndRoom}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black transition cursor-pointer shadow-lg"
                >
                  End Examination
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PARTICIPANT DETAIL MODAL */}
      <ParticipantDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        participant={selectedParticipant}
        roomId={roomId}
        roomTitle={room?.title}
        mode={room?.mode || 'EXAM'}
        onOpenSession={openSessionDetail}
        onOpenReport={openReport}
      />

      {/* SESSION DETAIL & RECORDING PLAYBACK MODAL */}
      <SessionDetailModal
        isOpen={isSessionModalOpen}
        onClose={() => setIsSessionModalOpen(false)}
        sessionId={selectedSessionId}
        onOpenReport={openReport}
      />

      {/* REPORT DETAIL MODAL */}
      <ReportDetailModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        sessionId={selectedSessionId}
      />
    </div>
  );
}
