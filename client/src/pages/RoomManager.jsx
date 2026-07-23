import { useState, useEffect } from 'react';
import { 
  Video, Users, Plus, Shield, Square, AlertTriangle, Volume2, Copy, Search, RefreshCw
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
    navigator.clipboard.writeText(`${window.location.origin}/rooms/${roomId}`);
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

      {/* ACTIVE ROOM VIEW */}
      {activeRoom ? (
        <div className="space-y-4">
          {/* Host Control Bar */}
          <div className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveRoom(null)}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 font-medium"
              >
                Back to All Rooms
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">{activeRoom.title}</h2>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-300">
                    {activeRoom.id}
                  </span>
                  <span className="badge-neutral">{activeRoom.mode}</span>
                </div>
                <p className="text-xs text-slate-500">Host: <b>{activeRoom.host}</b> • Participants: {activeRoom.participants?.length || 0} / {activeRoom.maxParticipants}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => copyRoomLink(activeRoom.id)}
                className="btn-ghost py-1.5 px-3 text-xs flex items-center gap-1.5"
              >
                <Copy size={14} />
                Copy Link
              </button>
              <button
                onClick={() => showNotification("Broadcasting warning to all participants...")}
                className="btn-ghost py-1.5 px-3 text-xs flex items-center gap-1.5 text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100"
              >
                <Volume2 size={14} />
                Broadcast Warning
              </button>
              <button
                onClick={() => setActiveRoom(null)}
                className="btn-danger py-1.5 px-3 text-xs flex items-center gap-1.5"
              >
                <Square size={14} />
                End Session
              </button>
            </div>
          </div>

          {/* Multi-Candidate Meet/Zoom Style Video Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Host Live Feed */}
            <div className="bg-white border border-slate-300 p-3 rounded-xl relative flex flex-col space-y-3 shadow-sm">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                  Host Feed (You)
                </span>
                <span className="text-[10px] font-mono text-slate-500">1080p HD</span>
              </div>
              <div className="h-[220px] rounded-lg overflow-hidden bg-slate-900 border border-slate-300 relative">
                <CameraFeed isActive={true} />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Status: <b className="text-emerald-700">PROCTOR ACTIVE</b></span>
                <span>Mode: <b>{activeRoom.mode}</b></span>
              </div>
            </div>

            {/* Candidate Participants */}
            {activeRoom.participants?.map((candidate, idx) => {
              const isHighRisk = candidate.riskLevel?.includes('HIGH') || candidate.riskScore > 50;

              return (
                <div
                  key={candidate.id || idx}
                  className={`bg-white p-3 rounded-xl border relative flex flex-col space-y-3 shadow-sm ${
                    isHighRisk ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900 truncate max-w-[170px]">
                      {candidate.name}
                    </span>
                    <span className={isHighRisk ? 'badge-danger' : 'badge-success'}>
                      Risk: {candidate.riskScore}%
                    </span>
                  </div>

                  <div className="h-[220px] rounded-lg overflow-hidden bg-slate-900 border border-slate-300 relative flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-lg font-bold text-white">
                      {candidate.name.charAt(0)}
                    </div>

                    {candidate.phoneDetected && (
                      <div className="absolute top-2 right-2 bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">
                        Phone Detected
                      </div>
                    )}

                    <div className="absolute bottom-2 left-2 right-2 bg-slate-900/90 border border-slate-700 p-2 rounded-md flex items-center justify-between text-[11px] text-slate-200">
                      <span>Gaze: <b>{candidate.gaze}</b></span>
                      <span>Pose: <b>{candidate.pose}</b></span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                    <button
                      onClick={() => triggerLivenessChallenge(candidate.name)}
                      className="text-[11px] py-1 px-2.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 font-medium flex items-center gap-1"
                    >
                      <RefreshCw size={12} />
                      Liveness
                    </button>

                    <button
                      onClick={() => issueWarning(candidate.name)}
                      className="text-[11px] py-1 px-2.5 rounded bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 font-medium flex items-center gap-1"
                    >
                      <AlertTriangle size={12} />
                      Warn
                    </button>

                    <button
                      onClick={() => kickCandidate(candidate.id)}
                      className="text-[11px] py-1 px-2.5 rounded bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200 font-medium flex items-center gap-1"
                    >
                      <Square size={12} />
                      Kick
                    </button>
                  </div>
                </div>
              );
            })}
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
