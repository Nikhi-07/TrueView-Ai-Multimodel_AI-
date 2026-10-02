import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  Clock, Calendar, Video, AlertTriangle, Search, RefreshCw, 
  Shield, CheckCircle2, User, Eye, FileText, Filter
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import PageHeader from '../components/Cards/PageHeader';
import api from '../services/api';
import SessionDetailModal from '../components/Modals/SessionDetailModal';
import ReportDetailModal from '../components/Modals/ReportDetailModal';

export default function Sessions() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Search & filter state (applied client-side on loaded dataset)
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'COMPLETED' | 'SUSPENDED'
  const [modeFilter, setModeFilter] = useState('ALL'); // 'ALL' | 'EXAM' | 'INTERVIEW' | 'ONLINE_CLASS' | 'MEETING' | 'WORKPLACE'
  
  // Modals state
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // Declare fetchSessions BEFORE useEffect hooks that reference it
  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/ai-engine/sessions');
      if (res.data.success && Array.isArray(res.data.sessions)) {
        const mapped = res.data.sessions.map((s) => {
          const startTime = new Date(s.startTime || s.createdAt || Date.now());
          const endTime = s.endTime ? new Date(s.endTime) : null;
          const durationSec = s.durationSeconds || (endTime ? Math.max(0, Math.round((endTime - startTime) / 1000)) : 0);
          const durationMin = Math.floor(durationSec / 60);
          const durationRem = durationSec % 60;
          const durationStr = durationMin > 0 ? `${durationMin} min${durationRem > 0 ? ` ${durationRem}s` : ''}` : `${durationRem}s`;
          const riskVal = Math.round(s.peakRiskScore || 0);
          const integrityScore = s.overallIntegrityScore ?? Math.max(0, 100 - riskVal);

          let integrityVerdict = 'PASSED';
          if (integrityScore < 60) integrityVerdict = 'FLAGGED';
          else if (integrityScore < 85) integrityVerdict = 'REVIEW REQUIRED';

          const rawStatus = (s.status || 'COMPLETED').toUpperCase();
          let canonicalStatus = 'COMPLETED';
          if (rawStatus === 'ACTIVE' || rawStatus === 'LIVE') canonicalStatus = 'ACTIVE';
          else if (rawStatus === 'SUSPENDED') canonicalStatus = 'SUSPENDED';
          else if (rawStatus === 'FAILED') canonicalStatus = 'FAILED';

          return {
            id: s.sessionId,
            sessionId: s.sessionId,
            roomId: s.roomId || '',
            roomTitle: s.roomTitle || (s.roomId ? `Room ${s.roomId}` : 'Proctor Examination'),
            host: s.hostName || s.hostEmail || 'Proctor Host',
            hostEmail: s.hostEmail || '',
            candidateName: s.userName || s.userEmail || 'Student Candidate',
            candidateEmail: s.userEmail || '',
            mode: (s.mode || s.sessionType || 'EXAM').toUpperCase(),
            startedAt: startTime,
            endedAt: endTime,
            duration: durationStr,
            durationSeconds: durationSec,
            violations: s.totalAlerts || (s.phoneDetections || 0) + (s.distractionCount || 0),
            risk: riskVal,
            integrityScore,
            integrityVerdict,
            status: canonicalStatus,
            hasReport: s.hasReport || false,
            reportId: s.reportId || null,
          };
        });
        setSessions(mapped);
      }
    } catch (error) {
      console.warn("Could not fetch sessions:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Real-time Socket.IO listener — auto-refreshes when extension starts/stops sessions
  useEffect(() => {
    const token = localStorage.getItem('trueview_token');
    const socket = io({
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      auth: { token: token || undefined }
    });
    const refresh = () => fetchSessions();
    socket.on('SESSION_STARTED', refresh);
    socket.on('SESSION_COMPLETED', refresh);
    socket.on('SESSION_TERMINATED', refresh);
    return () => { try { socket.disconnect(); } catch (_) {} };
  }, [fetchSessions]);

  // Client-side search and filtering without page reloads
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      // 1. Search matching
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchesSessionId = (s.sessionId || '').toLowerCase().includes(q);
        const matchesRoomId = (s.roomId || '').toLowerCase().includes(q);
        const matchesRoomTitle = (s.roomTitle || '').toLowerCase().includes(q);
        const matchesHost = (s.host || '').toLowerCase().includes(q);
        const matchesMode = (s.mode || '').toLowerCase().includes(q);
        const matchesCandidate = (s.candidateName || '').toLowerCase().includes(q);

        if (!matchesSessionId && !matchesRoomId && !matchesRoomTitle && !matchesHost && !matchesMode && !matchesCandidate) {
          return false;
        }
      }

      // 2. Status filter
      if (statusFilter !== 'ALL') {
        if (s.status !== statusFilter) return false;
      }

      // 3. Mode filter
      if (modeFilter !== 'ALL') {
        const normMode = s.mode.replace(/[\s-]/g, '_');
        const normFilter = modeFilter.replace(/[\s-]/g, '_');
        if (normMode !== normFilter) return false;
      }

      return true;
    });
  }, [sessions, search, statusFilter, modeFilter]);

  const openSessionDetail = (id) => {
    setSelectedSessionId(id);
    setIsDetailModalOpen(true);
  };

  const openReport = (sessId, reportId) => {
    setSelectedSessionId(sessId);
    setSelectedReportId(reportId || null);
    setIsReportModalOpen(true);
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            ACTIVE
          </span>
        );
      case 'SUSPENDED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            SUSPENDED
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            FAILED
          </span>
        );
      case 'COMPLETED':
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            COMPLETED
          </span>
        );
    }
  };

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
  const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="My Sessions" 
        subtitle="Manage, inspect, and review your authorized virtual room and proctoring sessions" 
        breadcrumb={['TrueView AI', 'My Sessions']} 
        actions={
          <div className="flex items-center gap-2">
            <button 
              onClick={fetchSessions} 
              className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin text-blue-600' : ''} /> Refresh
            </button>
            <button 
              onClick={() => navigate('/rooms')} 
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Video size={14} /> Virtual Rooms
            </button>
          </div>
        }
      />
      
      {/* Controls Bar: Search & Functional Filters */}
      <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-96">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Session ID, Room ID, Title, Host, Mode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
            />
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">Status:</span>
            {['ALL', 'ACTIVE', 'COMPLETED', 'SUSPENDED'].map((st) => (
              <button 
                key={st}
                onClick={() => setStatusFilter(st)} 
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors border shrink-0 ${
                  statusFilter === st 
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs' 
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {st === 'ALL' ? 'All' : st.charAt(0) + st.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Mode Filter Pills */}
        <div className="flex items-center gap-1 pt-2 border-t border-slate-100 overflow-x-auto pb-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">Mode:</span>
          {[
            { id: 'ALL', label: 'All Modes' },
            { id: 'EXAM', label: 'Exam' },
            { id: 'INTERVIEW', label: 'Interview' },
            { id: 'ONLINE_CLASS', label: 'Online Class' },
            { id: 'MEETING', label: 'Meeting' },
            { id: 'WORKPLACE', label: 'Workplace' },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => setModeFilter(m.id)}
              className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors border shrink-0 ${
                modeFilter === m.id
                  ? 'bg-slate-800 text-white border-slate-800 font-semibold'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {m.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-500 font-medium shrink-0 pl-2">
            Showing {filteredSessions.length} of {sessions.length} sessions
          </span>
        </div>
      </div>

      {/* Session Cards Grid */}
      {loading ? (
        <div className="text-center py-20 text-slate-500 font-semibold text-sm">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Loading your verified sessions...
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl p-8 space-y-3 shadow-xs">
          <Shield size={36} className="mx-auto text-slate-400" />
          <h3 className="text-base font-bold text-slate-800">No monitoring sessions match your search</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {sessions.length === 0
              ? 'You have not participated in any proctoring sessions yet. Join a Virtual Room or start Live Monitoring to record session events.'
              : 'Try adjusting your search criteria or resetting filters to view all sessions.'}
          </p>
          {(statusFilter !== 'ALL' || modeFilter !== 'ALL' || search) && (
            <button
              onClick={() => {
                setStatusFilter('ALL');
                setModeFilter('ALL');
                setSearch('');
              }}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredSessions.map((session) => (
            <motion.div 
              key={session.id} 
              variants={item} 
              className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between"
            >
              <div>
                {/* Header: Title & Status */}
                <div className="flex justify-between items-start gap-2 mb-3">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-1">
                      {session.roomTitle}
                    </h3>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[11px] text-slate-500 font-semibold">{session.sessionId}</span>
                      {session.roomId && (
                        <span className="font-mono text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200 font-semibold">
                          Room: {session.roomId}
                        </span>
                      )}
                    </div>
                  </div>
                  {renderStatusBadge(session.status)}
                </div>

                {/* Details Meta Grid */}
                <div className="space-y-2 py-3 border-y border-slate-100 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Mode:</span>
                    <span className="font-bold text-slate-800 px-2 py-0.5 bg-slate-100 rounded text-[11px] border border-slate-200">
                      {session.mode}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Host:</span>
                    <span className="font-semibold text-slate-800 truncate max-w-[180px]">
                      {session.host}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Date & Time:</span>
                    <span className="font-medium text-slate-700">
                      {session.startedAt.toLocaleDateString()} • {session.startedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Duration:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {session.duration}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Alerts:</span>
                    <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                      session.violations > 0 
                        ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {session.violations} alerts
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Integrity:</span>
                    <span className={`font-bold text-xs ${
                      session.integrityScore >= 85 
                        ? 'text-emerald-600' 
                        : session.integrityScore >= 60 
                        ? 'text-amber-600' 
                        : 'text-rose-600'
                    }`}>
                      {session.integrityVerdict} ({session.integrityScore}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons: [ View Session ] [ View Report ] */}
              <div className="mt-4 pt-2 flex items-center gap-2">
                <button 
                  onClick={() => openSessionDetail(session.id)}
                  className="flex-1 py-2 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-1.5"
                >
                  <Eye size={14} className="text-slate-500" />
                  View Session
                </button>

                <button 
                  onClick={() => openReport(session.id, session.reportId)}
                  className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-1.5"
                >
                  <FileText size={14} />
                  View Report
                </button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Session Detail Modal */}
      <SessionDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        sessionId={selectedSessionId}
        onOpenReport={(sessId) => {
          setSelectedSessionId(sessId);
          setIsReportModalOpen(true);
        }}
      />

      {/* Report Detail Modal */}
      <ReportDetailModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        sessionId={selectedSessionId}
        reportId={selectedReportId}
      />
    </div>
  );
}
