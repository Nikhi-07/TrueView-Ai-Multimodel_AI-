import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { 
  Shield, User, Mail, Video, CheckCircle2, AlertCircle, ArrowRight, 
  Lock, Sparkles, Clock, Users, LogIn, UserPlus, ArrowLeft
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const MODE_LABELS = {
  EXAM: { label: 'Examination (Strict)', badge: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
  INTERVIEW: { label: 'Interview (Conversational)', badge: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  ONLINE_CLASS: { label: 'Online Class (Lecture)', badge: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  CLASS: { label: 'Class / Lecture', badge: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  MEETING: { label: 'Collaborative Meeting', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  WORKPLACE: { label: 'Workplace Monitoring', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
};

export default function JoinRoom() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchPublicRoom();
  }, [roomId]);

  const fetchPublicRoom = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/rooms/${roomId}/public?token=${token}`);
      if (res.data.success && res.data.room) {
        setRoom(res.data.room);
      } else {
        setError(res.data.message || 'Proctor room not found');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to connect to proctoring session.');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = (e) => {
    e.preventDefault();
    if (!isAuthenticated || !user) {
      navigate('/login');
      return;
    }

    setSubmitting(true);
    const targetRoomId = room?.roomId || roomId;
    const mode = room?.mode || room?.sessionType || 'EXAM';
    const title = room?.title || `Proctored Session ${targetRoomId}`;
    const host = room?.hostName || 'Session Host';
    const joinToken = token || room?.joinCode || '';

    // Navigate to Pre-Session Verification
    navigate(`/proctor-room/${targetRoomId}?token=${joinToken}&mode=${mode}&title=${encodeURIComponent(title)}&host=${encodeURIComponent(host)}`);
  };

  const handleExit = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/rooms');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans select-none">
      {/* Background Decorative Lighting */}
      <div className="absolute top-[-15%] left-[-10%] w-[500px] h-[500px] rounded-full bg-emerald-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[500px] h-[500px] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />

      {/* Brand Header */}
      <div className="mb-6 flex flex-col items-center gap-2 text-center z-10">
        <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 backdrop-blur-md shadow-lg">
          <Shield size={16} className="text-emerald-400" />
          <span className="text-xs font-mono font-extrabold tracking-widest text-slate-200">TRUEVIEW AI</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </div>
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight mt-1">
          Join Proctoring Session
        </h1>
        <p className="text-xs text-slate-400 max-w-sm">
          Secure, AI-assisted multimodal verification and real-time monitored session.
        </p>
      </div>

      {/* Main Join Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md bg-slate-900/90 border border-slate-800/90 rounded-2xl p-6 md:p-8 backdrop-blur-xl shadow-2xl relative z-10 space-y-6"
      >
        {loading || authLoading ? (
          <div className="py-16 text-center space-y-4">
            <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-mono tracking-wider text-slate-400">CONNECTING TO PROCTOR ROOM...</p>
          </div>
        ) : error ? (
          <div className="py-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <AlertCircle size={28} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white mb-1">Room Not Available</h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">{error}</p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={handleExit}
                className="py-2 px-4 rounded-xl border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition cursor-pointer"
              >
                Exit
              </button>
              <button
                onClick={fetchPublicRoom}
                className="py-2 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        ) : !isAuthenticated || !user ? (
          /* UNREGISTERED / LOGGED-OUT USER UI */
          <div className="py-2 text-center space-y-5">
            <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <Lock size={26} />
            </div>

            <div>
              <span className="text-[10px] font-mono font-bold tracking-widest text-amber-400 uppercase block mb-1">
                AUTHENTICATION REQUIRED
              </span>
              <h2 className="text-xl font-black text-white">
                Account Required
              </h2>
              <p className="text-xs text-slate-400 max-w-xs mx-auto mt-2 leading-relaxed">
                You must have a registered TrueView AI account to join this proctoring session. Please register or login before continuing.
              </p>
            </div>

            {/* Room Preview Summary */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 text-left space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-400 uppercase">Room ID: {room.roomId}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${MODE_LABELS[room.mode]?.badge || 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                  {room.mode}
                </span>
              </div>
              <h3 className="font-bold text-white line-clamp-1">{room.title}</h3>
            </div>

            {/* Actions: LOGIN, REGISTER, EXIT */}
            <div className="space-y-2.5 pt-2">
              <button
                onClick={() => navigate('/login')}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogIn size={15} />
                <span>Login to Existing Account</span>
              </button>

              <button
                onClick={() => navigate('/register')}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <UserPlus size={15} />
                <span>Register New Candidate</span>
              </button>

              <button
                onClick={handleExit}
                className="w-full py-2 text-xs text-slate-400 hover:text-white transition flex items-center justify-center gap-1.5 cursor-pointer pt-1"
              >
                <ArrowLeft size={13} />
                <span>Exit</span>
              </button>
            </div>
          </div>
        ) : (
          /* REGISTERED & AUTHENTICATED USER UI */
          <>
            {/* Room Info Summary */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold tracking-widest text-slate-400 uppercase">
                  ROOM ID: {room.roomId}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${MODE_LABELS[room.mode]?.badge || 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                  {room.mode}
                </span>
              </div>

              <h2 className="text-base font-bold text-white leading-snug line-clamp-2">
                {room.title}
              </h2>

              <div className="pt-2 border-t border-slate-800/60 grid grid-cols-2 gap-2 text-xs text-slate-400">
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase">Host</span>
                  <span className="font-semibold text-slate-200 truncate block">{room.hostName}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase">Status</span>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    {room.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Authenticated Candidate Account Details */}
            <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-emerald-400 uppercase font-semibold flex items-center gap-1">
                  <CheckCircle2 size={11} />
                  Authenticated Candidate
                </span>
                <span className="text-[10px] text-slate-400 uppercase font-mono">
                  {user.role || 'candidate'}
                </span>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-white text-sm">{user.fullName || user.name}</p>
                <p className="text-slate-400 text-xs font-mono">{user.email}</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 text-[11px] text-blue-300 flex items-start gap-2.5 leading-relaxed">
              <Lock size={14} className="shrink-0 mt-0.5 text-blue-400" />
              <span>
                After clicking <b>Continue to Verification</b>, you will perform camera liveness anti-spoof, face biometric verification, and system readiness checks.
              </span>
            </div>

            {/* Continue / Exit Action Controls */}
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleContinue}
                disabled={submitting}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>Continue to Verification</span>
                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                onClick={handleExit}
                className="w-full py-2 text-xs text-slate-400 hover:text-white transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft size={13} />
                <span>Exit</span>
              </button>
            </div>
          </>
        )}
      </motion.div>

      {/* Footer Security Badge */}
      <div className="mt-6 flex items-center gap-2 text-[11px] text-slate-500 z-10">
        <CheckCircle2 size={13} className="text-emerald-500" />
        <span>End-to-End Multimodal Trust Verification & Monitoring</span>
      </div>
    </div>
  );
}
