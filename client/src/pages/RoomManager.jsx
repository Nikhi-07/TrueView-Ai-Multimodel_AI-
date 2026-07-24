import { useState, useEffect } from 'react';
import { 
  Video, Users, Plus, Shield, Square, AlertTriangle, Volume2, Copy, Search, RefreshCw, PhoneOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../components/Cards/PageHeader';
import StatusBadge from '../components/Cards/StatusBadge';
import CameraFeed from '../components/Camera/CameraFeed';

const MODES = [
  { id: 'EXAM', label: 'Examination (Strict)', badge: 'danger' },
  { id: 'INTERVIEW', label: 'Interview (Conversational)', badge: 'primary' },
  { id: 'ONLINE_CLASS', label: 'Online Class (Lecture)', badge: 'accent' },
  { id: 'MEETING', label: 'Meeting (Collaborative)', badge: 'success' },
  { id: 'WORKPLACE', label: 'Workplace (Productivity)', badge: 'warning' },
];

export default function RoomManager() {
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState('ALL');

  // New Room Form State
  const [newTitle, setNewTitle] = useState('');
  const [newMode, setNewMode] = useState('EXAM');
  const [maxParticipants, setMaxParticipants] = useState(30);
  const [voiceAlerts, setVoiceAlerts] = useState(true);

  // Host Action Alerts
  const [toastMsg, setToastMsg] = useState(null);

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const res = await fetch('/api/rooms');
      const data = await res.json();
      if (data.success) {
        setRooms(data.rooms);
      }
    } catch (_) {}
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle || 'Untitled Room',
          mode: newMode,
          maxParticipants: Number(maxParticipants),
          voiceAlerts: voiceAlerts
        })
      });
      const data = await res.json();
      if (data.success) {
        setRooms(prev => [data.room, ...prev]);
        setShowCreateModal(false);
        setNewTitle('');
        setActiveRoom(data.room);
        showNotification(`Room ${data.room.id} created successfully!`);
      }
    } catch (_) {}
  };

  const showNotification = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const copyRoomLink = (roomId) => {
    navigator.clipboard.writeText(`${window.location.origin}/session/${roomId}/verify`);
    showNotification(`Room link ${roomId} copied to clipboard!`);
  };

  const triggerLivenessChallenge = (candidateName) => {
    showNotification(`Sent Active Liveness Challenge to ${candidateName}!`);
  };

  const issueWarning = (candidateName) => {
    showNotification(`Official Warning issued to ${candidateName}!`);
  };

  const kickCandidate = (candidateId) => {
    if (!activeRoom) return;
    setActiveRoom(prev => ({
      ...prev,
      participants: prev.participants.filter(p => p.id !== candidateId),
      participantsCount: Math.max(0, prev.participantsCount - 1)
    }));
    showNotification(`Candidate suspended from room.`);
  };

  const filteredRooms = rooms.filter(r => {
    const matchesSearch = r.title.toLowerCase().includes(searchTerm.toLowerCase()) || r.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesMode = filterMode === 'ALL' || r.mode === filterMode;
    return matchesSearch && matchesMode;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Virtual Proctoring Room Manager"
        subtitle="Host Zoom/Meet-style interactive AI proctoring rooms for Exams, Interviews, & Classes."
        breadcrumb={['TrueView AI', 'Virtual Rooms']}
        actions={
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary py-2 px-4 flex items-center gap-2 text-sm font-semibold"
          >
            <Plus size={16} />
            Create Proctor Room
          </button>
        }
      />

      {/* Notification Toast */}
      {toastMsg && (
        <div className="fixed top-20 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-lg border border-slate-700 text-xs font-semibold shadow-xl flex items-center gap-3 animate-fade-in">
          <Shield size={16} className="text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* ACTIVE ROOM VIEW (Zoom / Meet Style) */}
      {activeRoom ? (
        <div className="fixed inset-0 z-[100] bg-[#202124] text-white flex flex-col font-sans overflow-hidden">
          
          {/* Top Bar */}
          <div className="h-14 px-6 flex items-center justify-between shrink-0 bg-gradient-to-b from-black/60 to-transparent absolute top-0 left-0 right-0 z-10 pointer-events-none">
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 bg-red-600 rounded text-xs font-bold tracking-widest animate-pulse">REC</span>
              <h2 className="text-sm font-semibold">{activeRoom.title}</h2>
              <span className="text-xs text-gray-400 font-mono">({activeRoom.id})</span>
            </div>
          </div>

          {/* Video Grid Area */}
          <div className="flex-1 p-6 flex flex-col justify-center items-center relative overflow-hidden min-h-0 pt-16 pb-24">
             <div className={`w-full max-w-7xl grid gap-4 place-content-center h-full ${
               activeRoom.participants?.length > 3 ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4' :
               activeRoom.participants?.length > 1 ? 'grid-cols-2 lg:grid-cols-3' : 
               'grid-cols-1 md:grid-cols-2'
             }`}>
                
                {/* Host Live Feed */}
                <div className="relative bg-[#3c4043] rounded-xl overflow-hidden shadow-xl aspect-video border border-[#5f6368]/30 flex flex-col group">
                  <div className="absolute inset-0 z-0">
                    <CameraFeed isActive={true} />
                  </div>
                  <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg flex items-center gap-2 z-10 border border-white/10">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
                    <span className="text-xs font-semibold text-white">Host (You)</span>
                  </div>
                </div>

                {/* Candidate Participants */}
                {activeRoom.participants?.map((candidate, idx) => {
                  const isHighRisk = candidate.riskLevel?.includes('HIGH') || candidate.riskScore > 50;

                  return (
                    <div
                      key={candidate.id || idx}
                      className={`relative bg-[#3c4043] rounded-xl overflow-hidden shadow-xl aspect-video border transition-colors flex items-center justify-center group ${
                        isHighRisk ? 'border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.2)]' : 'border-[#5f6368]/30'
                      }`}
                    >
                      {/* Placeholder for Candidate Video Feed */}
                      <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-3xl font-normal text-white shadow-lg">
                        {candidate.name.charAt(0)}
                      </div>

                      {/* Overlays */}
                      <div className="absolute top-3 right-3 flex flex-col gap-2 items-end z-10">
                         {isHighRisk && (
                           <div className="bg-rose-600/90 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded shadow-lg border border-rose-500/50 flex items-center gap-1.5">
                             <AlertTriangle size={10} /> High Risk
                           </div>
                         )}
                         {candidate.phoneDetected && (
                           <div className="bg-orange-500/90 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded shadow-lg border border-orange-400/50 flex items-center gap-1.5">
                             <PhoneOff size={10} /> Phone
                           </div>
                         )}
                      </div>

                      <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg flex items-center gap-2 z-10 border border-white/10">
                        <span className="text-xs font-semibold text-white truncate max-w-[120px]">{candidate.name}</span>
                        <div className="w-px h-3 bg-gray-500 mx-1"></div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isHighRisk ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                          Risk: {candidate.riskScore}%
                        </span>
                      </div>

                      {/* Hover Actions */}
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center justify-center gap-3">
                        <button
                          onClick={() => triggerLivenessChallenge(candidate.name)}
                          className="w-10 h-10 rounded-full bg-white/10 hover:bg-blue-500 text-white flex items-center justify-center transition-colors"
                          title="Trigger Liveness Check"
                        >
                          <RefreshCw size={16} />
                        </button>
                        <button
                          onClick={() => issueWarning(candidate.name)}
                          className="w-10 h-10 rounded-full bg-white/10 hover:bg-amber-500 text-white flex items-center justify-center transition-colors"
                          title="Issue Warning"
                        >
                          <AlertTriangle size={16} />
                        </button>
                        <button
                          onClick={() => kickCandidate(candidate.id)}
                          className="w-10 h-10 rounded-full bg-white/10 hover:bg-rose-600 text-white flex items-center justify-center transition-colors"
                          title="Kick Candidate"
                        >
                          <Square size={16} />
                        </button>
                      </div>

                    </div>
                  );
                })}
             </div>
          </div>

          {/* Bottom Control Bar */}
          <div className="h-20 bg-[#202124] px-6 flex items-center justify-between shrink-0 absolute bottom-0 left-0 right-0 z-50">
            
            <div className="flex items-center gap-4 w-64 text-[#9aa0a6]">
              <span className="text-sm font-medium">{formatTime(new Date())}</span>
              <div className="w-px h-4 bg-[#5f6368]"></div>
              <span className="text-sm font-medium">{activeRoom.mode} Mode</span>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => copyRoomLink(activeRoom.id)}
                className="w-12 h-12 rounded-full bg-[#3c4043] hover:bg-[#4a4d51] text-white flex items-center justify-center transition-colors tooltip"
                title="Copy Invite Link"
              >
                <Copy size={20} />
              </button>
              
              <button
                onClick={() => showNotification("Broadcasting warning to all participants...")}
                className="w-12 h-12 rounded-full bg-[#3c4043] hover:bg-amber-600 text-white flex items-center justify-center transition-colors tooltip"
                title="Broadcast Audio Warning"
              >
                <Volume2 size={20} />
              </button>

              <button
                onClick={() => setActiveRoom(null)}
                className="w-16 h-10 rounded-full bg-[#ea4335] hover:bg-[#d93025] text-white flex items-center justify-center transition-colors shadow-lg px-6"
                title="End Session"
              >
                <PhoneOff size={22} />
              </button>
            </div>

            <div className="flex items-center justify-end gap-3 w-64 text-[#9aa0a6]">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#3c4043] rounded-lg text-sm">
                 <Users size={16} />
                 <span>{activeRoom.participants?.length || 0} / {activeRoom.maxParticipants}</span>
              </div>
            </div>

          </div>
        </div>
      ) : (
        /* ROOMS LIST VIEW */
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="relative w-full md:w-72">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search rooms..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="input-glass pl-9 py-1.5 text-xs text-slate-900"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setFilterMode('ALL')}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${filterMode === 'ALL' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}
              >
                All Modes
              </button>
              {MODES.map(m => (
                <button
                  key={m.id}
                  onClick={() => setFilterMode(m.id)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${filterMode === m.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}
                >
                  {m.id}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRooms.map(room => (
              <div
                key={room.id}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 flex flex-col justify-between shadow-sm hover:border-slate-300 transition-all"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-slate-800 px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
                      {room.id}
                    </span>
                    <span className="badge-neutral">{room.mode}</span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 line-clamp-1">{room.title}</h3>
                  <p className="text-xs text-slate-500">Host: <b>{room.host}</b></p>
                </div>

                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <Users size={14} />
                      Participants: <b>{room.participantsCount || 1} / {room.maxParticipants}</b>
                    </span>
                    <span className="badge-success">{room.status}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveRoom(room)}
                      className="btn-primary flex-1 py-2 text-xs flex items-center justify-center gap-2 font-semibold"
                    >
                      <Video size={14} />
                      Enter Host Dashboard
                    </button>
                    <button
                      onClick={() => copyRoomLink(room.id)}
                      className="btn-ghost py-2 px-3 text-xs"
                      title="Copy Invite Link"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CREATE ROOM MODAL */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white p-6 rounded-xl max-w-md w-full border border-slate-200 space-y-5 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Video size={18} className="text-slate-800" />
                  Create Virtual Proctoring Room
                </h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-slate-400 hover:text-slate-700 text-sm"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateRoom} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Room Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CS101 Midterm Examination"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    className="input-glass"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Session Mode</label>
                  <select
                    value={newMode}
                    onChange={e => setNewMode(e.target.value)}
                    className="input-glass"
                  >
                    {MODES.map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Max Capacity (Participants)</label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={maxParticipants}
                    onChange={e => setMaxParticipants(e.target.value)}
                    className="input-glass"
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div>
                    <span className="text-xs font-semibold text-slate-800 block">Loud AI Spoken Voice Alerts</span>
                    <span className="text-[10px] text-slate-500">Speak warnings directly to participants</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={voiceAlerts}
                    onChange={e => setVoiceAlerts(e.target.checked)}
                    className="w-4 h-4 rounded accent-slate-900"
                  />
                </div>

                <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="btn-ghost flex-1 py-2 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary flex-1 py-2 text-xs font-semibold"
                  >
                    Create & Launch Room
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
