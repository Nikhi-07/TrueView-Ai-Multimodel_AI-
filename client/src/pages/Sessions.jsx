import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, Calendar, Video, PlayCircle, AlertTriangle, Search, RefreshCw, Eye, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/Cards/PageHeader';
import StatusBadge from '../components/Cards/StatusBadge';
import api from '../services/api';
import SessionDetailModal from '../components/Modals/SessionDetailModal';
import ReportDetailModal from '../components/Modals/ReportDetailModal';

export default function Sessions() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'FLAGGED'
  const [search, setSearch] = useState('');
  
  // Modals state
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  useEffect(() => {
    fetchSessions();
  }, [filter, search]);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/ai-engine/sessions?filter=${filter}&search=${encodeURIComponent(search)}`);
      if (res.data.success && Array.isArray(res.data.sessions)) {
        const mapped = res.data.sessions.map((s) => {
          const startTime = new Date(s.startTime || s.createdAt || Date.now());
          const endTime = s.endTime ? new Date(s.endTime) : null;
          const durationSec = s.durationSeconds || (endTime ? Math.round((endTime - startTime) / 1000) : 0);
          const durationMin = Math.floor(durationSec / 60);
          const durationRem = durationSec % 60;
          const durationStr = `${durationMin}m ${durationRem.toString().padStart(2, '0')}s`;
          const riskVal = Math.round(s.peakRiskScore || 0);

          return {
            id: s.sessionId,
            user: s.userName || s.userEmail || 'Student Candidate',
            email: s.userEmail,
            mode: s.mode || s.sessionType || 'EXAM',
            startedAt: startTime.toISOString(),
            duration: durationStr,
            violations: s.totalAlerts || (s.phoneDetections || 0) + (s.distractionCount || 0),
            risk: riskVal,
            recordingUrl: s.recordingUrl,
            status: s.status === 'ACTIVE' || s.status === 'LIVE' ? 'Active' : (riskVal > 60 || s.status === 'FLAGGED' ? 'Flagged' : 'Completed'),
          };
        });
        setSessions(mapped);
      }
    } catch (error) {
      console.warn("Could not fetch sessions:", error);
    } finally {
      setLoading(false);
    }
  };

  const openSessionDetail = (id) => {
    setSelectedSessionId(id);
    setIsDetailModalOpen(true);
  };

  const openReport = (sessId) => {
    setSelectedSessionId(sessId);
    setIsReportModalOpen(true);
  };

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const item = { hidden: { opacity: 0, scale: 0.96 }, show: { opacity: 1, scale: 1 } };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Monitoring Sessions" 
        subtitle="Real-time and archived proctoring sessions tracked in MongoDB" 
        breadcrumb={['TrueView AI', 'Sessions']} 
        actions={
          <div className="flex items-center gap-2">
            <button 
              onClick={fetchSessions} 
              className="btn-ghost text-xs flex items-center gap-1.5"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button 
              onClick={() => navigate('/rooms')} 
              className="btn-primary text-xs flex items-center gap-1.5 font-bold"
            >
              <Video size={14} /> Virtual Rooms
            </button>
          </div>
        }
      />
      
      {/* Controls Bar: Search & Filter Tabs */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="relative w-full md:w-80">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Session ID, candidate, or mode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-glass pl-9 py-2 text-xs w-full text-white font-medium"
          />
        </div>

        <div className="flex items-center gap-2">
          {['ALL', 'ACTIVE', 'FLAGGED'].map((tab) => (
            <button 
              key={tab}
              onClick={() => setFilter(tab)} 
              className={`text-xs font-semibold px-4 py-2 rounded-lg transition-colors border ${
                filter === tab 
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm' 
                  : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-white'
              }`}
            >
              {tab === 'ALL' ? 'All Sessions' : tab === 'ACTIVE' ? 'Active Only' : 'Flagged'}
            </button>
          ))}
        </div>
      </div>

      {/* Session Cards Grid */}
      {loading ? (
        <div className="text-center py-20 text-slate-400 font-semibold text-sm">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Loading verified session records...
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 text-slate-400 font-semibold text-sm bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-2">
          <Shield size={32} className="mx-auto text-slate-600 mb-2" />
          <p className="text-base text-slate-200">No monitoring sessions found.</p>
          <p className="text-xs text-slate-500">Sessions are automatically created and tracked when candidates enter Virtual Proctor Rooms or Live Monitoring.</p>
        </div>
      ) : (
        <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sessions.map((session) => (
            <motion.div 
              key={session.id} 
              variants={item} 
              onClick={() => openSessionDetail(session.id)}
              className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl group hover:border-emerald-500/40 transition-all flex flex-col justify-between cursor-pointer hover:shadow-lg shadow-black/20"
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="text-xs font-mono text-slate-400 block mb-0.5">{session.id}</span>
                    <h3 className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">{session.user}</h3>
                  </div>
                  <StatusBadge 
                    label={session.status} 
                    variant={session.status === 'Active' ? 'success' : session.status === 'Flagged' ? 'danger' : 'info'} 
                    dot={session.status === 'Active'}
                  />
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800 text-xs text-slate-400">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <Calendar size={13} className="text-slate-500" /> Date:
                    </span>
                    <span className="text-slate-200 font-medium">{new Date(session.startedAt).toLocaleDateString()}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <Clock size={13} className="text-slate-500" /> Duration:
                    </span>
                    <span className="font-mono text-slate-200 font-semibold">{session.duration}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <AlertTriangle size={13} className={session.violations > 0 ? "text-rose-400" : "text-slate-500"} /> Violations:
                    </span>
                    <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${session.violations > 0 ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-slate-800 text-slate-300'}`}>
                      {session.violations}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Risk</span>
                  <span className={`text-xs font-bold ${session.risk > 60 ? 'text-rose-400' : session.risk > 20 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {session.risk}/100
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      openSessionDetail(session.id);
                    }}
                    className="p-2 bg-slate-800 text-emerald-400 rounded-lg hover:bg-slate-700 transition-colors border border-slate-700 flex items-center gap-1 text-xs font-semibold"
                    title="Play Video Recording & View Timeline"
                  >
                    <PlayCircle size={14}/> Video
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      openReport(session.id);
                    }}
                    className="p-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors border border-slate-700"
                    title="View Integrity Report"
                  >
                    <Eye size={14}/>
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Session Detail & Video Playback Modal */}
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
      />
    </div>
  );
}
