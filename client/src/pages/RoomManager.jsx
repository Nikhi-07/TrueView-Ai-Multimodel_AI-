import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Video, Users, Plus, Shield, Square, AlertTriangle, Volume2, Copy, Search, 
  RefreshCw, PhoneOff, FileText, Share2, Check, ExternalLink, Sparkles, Clock, Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../components/Cards/PageHeader';
import StatusBadge from '../components/Cards/StatusBadge';
import api from '../services/api';

const MODES = [
  { id: 'EXAM', label: 'Examination (Strict)', badge: 'danger' },
  { id: 'INTERVIEW', label: 'Interview (Conversational)', badge: 'primary' },
  { id: 'ONLINE_CLASS', label: 'Online Class (Lecture)', badge: 'accent' },
  { id: 'MEETING', label: 'Meeting (Collaborative)', badge: 'success' },
  { id: 'WORKPLACE', label: 'Workplace (Productivity)', badge: 'warning' },
];

export default function RoomManager() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createdRoomModal, setCreatedRoomModal] = useState(null); // Shareable Link Modal
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState('ALL');

  // New Room Form State
  const [newTitle, setNewTitle] = useState('');
  const [newMode, setNewMode] = useState('EXAM');
  const [maxParticipants, setMaxParticipants] = useState(30);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [scheduledAt, setScheduledAt] = useState('');
  const [voiceAlerts, setVoiceAlerts] = useState(true);
  const [creating, setCreating] = useState(false);

  // Toast Notification
  const [toastMsg, setToastMsg] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const res = await api.get('/rooms');
      if (res.data.success && Array.isArray(res.data.rooms)) {
        setRooms(res.data.rooms);
      }
    } catch (_) {}
    finally {
      setLoading(false);
    }
  };

  const showNotification = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const getFullJoinUrl = (room) => {
    const roomId = room.roomId || room.id;
    const token = room.joinCode || room.joinToken || '';
    // Prefer window.location.origin so it automatically adopts LAN IP or hostname
    const origin = window.location.origin;
    return `${origin}/join/${roomId}${token ? `?token=${token}` : ''}`;
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api.post('/rooms', {
        title: newTitle.trim() || 'New Monitored Session',
        mode: newMode,
        maxParticipants: Number(maxParticipants) || 30,
        durationMinutes: Number(durationMinutes) || 60,
        scheduledAt: scheduledAt || null,
        voiceAlerts: voiceAlerts,
      });

      if (res.data.success && res.data.room) {
        const created = res.data.room;
        setRooms((prev) => [created, ...prev]);
        setShowCreateModal(false);
        setNewTitle('');
        setScheduledAt('');
        setCreatedRoomModal(created);
        showNotification(`Room ${created.roomId || created.id} created successfully!`);
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Failed to create room');
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = async (text, id = null) => {
    try {
      await navigator.clipboard.writeText(text);
      if (id) setCopiedId(id);
      showNotification('Room link copied!');
      setTimeout(() => setCopiedId(null), 2500);
    } catch (_) {
      showNotification('Failed to copy room link.');
    }
  };

  const shareJoinLink = async (room) => {
    const joinUrl = getFullJoinUrl(room);
    const title = room.title || 'TrueView AI Proctor Room';
    const text = `Join TrueView AI Proctoring Session:\n"${title}"\nMode: ${room.mode}\nRoom ID: ${room.roomId || room.id}\nJoin Link: ${joinUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text,
          url: joinUrl,
        });
        showNotification('Room link copied!');
      } catch (err) {
        if (err.name !== 'AbortError') {
          copyToClipboard(joinUrl, room.roomId || room.id);
        }
      }
    } else {
      copyToClipboard(joinUrl, room.roomId || room.id);
    }
  };

  const handleCandidateJoin = (room) => {
    const roomId = room.roomId || room.id;
    const token = room.joinCode || '';
    navigate(`/join/${roomId}${token ? `?token=${token}` : ''}`);
  };

  const handleHostOpenRoom = (room) => {
    const roomId = room.roomId || room.id;
    navigate(`/proctor-room-host/${roomId}`);
  };

  const filteredRooms = rooms.filter((r) => {
    const rId = r.roomId || r.id || '';
    const rTitle = r.title || '';
    const matchesSearch =
      rTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesMode = filterMode === 'ALL' || r.mode === filterMode;
    return matchesSearch && matchesMode;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Virtual Proctoring Room Manager"
        subtitle="Host Zoom/Meet-style interactive AI proctoring rooms with shareable links, public onboarding, and real-time host alerts."
        breadcrumb={['TrueView AI', 'Virtual Rooms']}
        actions={
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary py-2 px-4 flex items-center gap-2 text-sm font-bold bg-slate-900 text-white hover:bg-slate-800 shadow-md cursor-pointer"
          >
            <Plus size={16} />
            Create Proctor Room
          </button>
        }
      />

      {/* Notification Toast */}
      {toastMsg && (
        <div className="fixed top-20 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl border border-slate-700 text-xs font-semibold shadow-2xl flex items-center gap-3 animate-fade-in">
          <Shield size={16} className="text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Controls & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search by room title, ID, or mode..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setFilterMode('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              filterMode === 'ALL'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Modes
          </button>
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setFilterMode(m.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                filterMode === m.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {m.id}
            </button>
          ))}
          <button
            onClick={fetchRooms}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer ml-1"
            title="Refresh Rooms List"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Grid of Proctor Rooms */}
      {loading ? (
        <div className="py-24 text-center space-y-3">
          <div className="w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-medium">Loading virtual proctor rooms...</p>
        </div>
      ) : filteredRooms.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-4 shadow-sm">
          <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Video size={24} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">No Proctor Rooms Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Create a new proctor room to host Zoom/Meet-style AI monitored sessions.
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary py-2 px-4 text-xs font-bold inline-flex items-center gap-2"
          >
            <Plus size={14} />
            Create First Room
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredRooms.map((room) => {
            const roomId = room.roomId || room.id;
            const joinUrl = getFullJoinUrl(room);
            const isEnded = room.status === 'ENDED';
            const participantsCount = room.participantsCount || (room.participants?.filter(p => p.status !== 'LEFT').length) || 0;
            const maxCapacity = room.maxParticipants || 30;
            const isRoomFull = participantsCount >= maxCapacity;

            const currentUserId = user?._id || user?.id;
            const isHost = Boolean(
              user && (
                user.role === 'admin' ||
                (currentUserId && (room.host?.id === currentUserId || room.hostId === currentUserId || String(room.host) === String(currentUserId))) ||
                (user.email && (room.host?.email === user.email || room.hostEmail === user.email))
              )
            );

            return (
              <div
                key={roomId}
                className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 flex flex-col justify-between shadow-sm hover:shadow-md hover:border-slate-300 transition-all group"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-slate-900 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200">
                        {roomId}
                      </span>
                      {room.joinCode && (
                        <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-semibold" title="Public Join Code">
                          Code: {room.joinCode}
                        </span>
                      )}
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isEnded ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                      {room.status || 'ACTIVE'}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 line-clamp-1 group-hover:text-slate-800">
                    {room.title}
                  </h3>

                  <div className="text-xs text-slate-500 space-y-1">
                    <p>Host: <span className="font-semibold text-slate-700">{room.hostName || room.host?.name || 'Session Host'}</span></p>
                    <div className="flex items-center gap-4 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1 font-medium text-slate-600">
                        <Users size={12} className={isRoomFull ? 'text-amber-600' : 'text-slate-500'} /> {participantsCount} / {maxCapacity}
                      </span>
                      <span className="flex items-center gap-1 font-medium text-slate-600">
                        <Clock size={12} className="text-slate-500" /> {room.durationMinutes || 60} mins
                      </span>
                      <span className="font-bold text-slate-800">{room.mode}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5 pt-3 border-t border-slate-100">
                  {/* Host Launch Dashboard Button (Host / Admin Only) */}
                  {isHost && (
                    <button
                      onClick={() => handleHostOpenRoom(room)}
                      className="w-full py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                      title="Open Real-Time Host Monitoring Dashboard"
                    >
                      <Shield size={14} className="text-emerald-400" />
                      <span>Open Host Dashboard</span>
                    </button>
                  )}

                  {/* Participant Action Buttons: Join, Link, Share */}
                  <div className="grid grid-cols-3 gap-2">
                    {/* Join Button */}
                    {isEnded ? (
                      <button
                        disabled
                        className="py-2 px-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 text-[11px] font-bold flex items-center justify-center gap-1 cursor-not-allowed select-none"
                        title="This proctoring session has ended"
                      >
                        <Square size={12} className="text-slate-400" />
                        <span>ENDED</span>
                      </button>
                    ) : isRoomFull ? (
                      <button
                        disabled
                        className="py-2 px-1 rounded-xl bg-amber-50 border border-amber-300 text-amber-800 text-[10px] font-bold flex items-center justify-center gap-1 cursor-not-allowed select-none"
                        title="Room has reached maximum capacity"
                      >
                        <Users size={12} className="text-amber-600" />
                        <span>ROOM FULL</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleCandidateJoin(room)}
                        className="py-2 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 border border-emerald-700 text-white text-[11px] font-bold flex items-center justify-center gap-1 transition-all shadow-sm hover:shadow cursor-pointer"
                        title="Join Proctoring Session as Candidate"
                      >
                        <Video size={12} />
                        <span>Join</span>
                      </button>
                    )}

                    {/* Link Button */}
                    <button
                      onClick={() => copyToClipboard(joinUrl, roomId)}
                      className="py-2 px-2 rounded-xl bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-300 hover:border-slate-400 text-slate-800 text-[11px] font-bold flex items-center justify-center gap-1 transition-all shadow-sm cursor-pointer"
                      title="Copy Public Invitation Link"
                    >
                      {copiedId === roomId ? <Check size={12} className="text-emerald-600 font-bold" /> : <Copy size={12} className="text-slate-600" />}
                      <span className={copiedId === roomId ? 'text-emerald-700 font-bold' : ''}>
                        {copiedId === roomId ? 'Copied!' : 'Link'}
                      </span>
                    </button>

                    {/* Share Button */}
                    <button
                      onClick={() => shareJoinLink(room)}
                      className="py-2 px-2 rounded-xl bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-300 hover:border-slate-400 text-slate-800 text-[11px] font-bold flex items-center justify-center gap-1 transition-all shadow-sm cursor-pointer"
                      title="Share Room Invitation Link"
                    >
                      <Share2 size={12} className="text-slate-600" />
                      <span>Share</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE ROOM MODAL */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white p-6 md:p-8 rounded-2xl max-w-lg w-full border border-slate-200 space-y-6 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-slate-900 text-white">
                    <Video size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Create Proctoring Room
                    </h3>
                    <p className="text-xs text-slate-500">
                      Generate a secure Zoom-style room with shareable candidate link.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-slate-400 hover:text-slate-700 text-sm p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateRoom} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Room Title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Computer Science Final Examination"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900 focus:bg-white transition"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">
                      Session Mode
                    </label>
                    <select
                      value={newMode}
                      onChange={(e) => setNewMode(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-900 focus:bg-white transition cursor-pointer"
                    >
                      {MODES.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">
                      Max Participants
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={maxParticipants}
                      onChange={(e) => setMaxParticipants(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-slate-900 focus:bg-white transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">
                      Duration (Minutes)
                    </label>
                    <input
                      type="number"
                      min="5"
                      max="300"
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-slate-900 focus:bg-white transition"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">
                      Scheduled Date & Time (Optional)
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-slate-900 focus:bg-white transition cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      Spoken AI Voice Warnings
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Speak warnings aloud to candidates when violations occur
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={voiceAlerts}
                    onChange={(e) => setVoiceAlerts(e.target.checked)}
                    className="w-4 h-4 rounded accent-slate-900 cursor-pointer"
                  />
                </div>

                <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex-1 py-2.5 text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 rounded-xl transition shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {creating ? 'Creating...' : 'Create & Generate Link'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SHAREABLE LINK MODAL / CARD (After Creation) */}
      <AnimatePresence>
        {createdRoomModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white p-6 md:p-8 rounded-2xl max-w-md w-full border border-slate-200 space-y-6 shadow-2xl text-center"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
                <Check size={32} />
              </div>

              <div>
                <span className="text-[11px] font-mono font-bold tracking-widest text-emerald-600 uppercase block mb-1">
                  PROCTOR ROOM CREATED
                </span>
                <h3 className="text-xl font-extrabold text-slate-900 leading-tight">
                  {createdRoomModal.title}
                </h3>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Mode:</span>
                  <span className="font-bold text-slate-900">{createdRoomModal.mode}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Room ID:</span>
                  <span className="font-mono font-bold text-slate-900">{createdRoomModal.roomId || createdRoomModal.id}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Join Code:</span>
                  <span className="font-mono font-bold text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded">
                    {createdRoomModal.joinCode || 'ACTIVE'}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <span className="text-slate-500 block mb-1 font-medium">Candidate Join Link:</span>
                  <div className="p-2.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-mono text-[11px] break-all select-all">
                    {getFullJoinUrl(createdRoomModal)}
                  </div>
                </div>
              </div>

              {/* Actions: Copy Link, Share, Open Room */}
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => copyToClipboard(getFullJoinUrl(createdRoomModal))}
                    className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Copy size={14} />
                    <span>Copy Link</span>
                  </button>

                  <button
                    onClick={() => shareJoinLink(createdRoomModal)}
                    className="py-2.5 px-4 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Share2 size={14} />
                    <span>Share Link</span>
                  </button>
                </div>

                <button
                  onClick={() => {
                    const rId = createdRoomModal.roomId || createdRoomModal.id;
                    setCreatedRoomModal(null);
                    navigate(`/proctor-room-host/${rId}`);
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
                >
                  <Shield size={16} className="text-emerald-400" />
                  <span>Open Room Dashboard</span>
                </button>

                <button
                  onClick={() => setCreatedRoomModal(null)}
                  className="text-xs text-slate-500 hover:text-slate-800 py-1 transition cursor-pointer"
                >
                  Close & View All Rooms
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
