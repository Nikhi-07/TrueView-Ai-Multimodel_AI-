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
  EXAM: { label: 'Examination (Moderate)', badge: 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]' },
  INTERVIEW: { label: 'Interview (Conversational)', badge: 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]' },
  ONLINE_CLASS: { label: 'Online Class (Lecture)', badge: 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]' },
  CLASS: { label: 'Class / Lecture', badge: 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]' },
  MEETING: { label: 'Collaborative Meeting', badge: 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]' },
  WORKPLACE: { label: 'Workplace Monitoring', badge: 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]' },
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
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans select-none">
      {/* Brand Header */}
      <div className="mb-6 flex flex-col items-center gap-2 text-center z-10 max-w-lg px-2">
        <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[#FFFFFF] border border-[#D1FAE5] shadow-xs">
          <Shield size={16} className="text-[#10B981] shrink-0" />
          <span className="text-xs font-mono font-extrabold tracking-widest text-[#0F172A]">TRUEVIEW AI</span>
          <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse shrink-0" />
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-[#0F172A] tracking-tight mt-1">
          Join Proctoring Session
        </h1>
        <p className="text-xs md:text-sm text-[#64748B] font-medium max-w-md leading-relaxed">
          Secure, AI-assisted multimodal verification and real-time monitored session.
        </p>
      </div>

      {/* Main Join Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md bg-[#FFFFFF] border border-[#E2E8F0] rounded-2xl p-6 md:p-8 relative z-10 space-y-6 shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
      >
        {loading || authLoading ? (
          <div className="py-16 text-center space-y-4">
            <div className="w-10 h-10 border-3 border-[#10B981] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-mono font-bold tracking-wider text-[#64748B]">CONNECTING TO PROCTOR ROOM...</p>
          </div>
        ) : error ? (
          <div className="py-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto shadow-xs">
              <AlertCircle size={28} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0F172A] mb-1">Room Not Available</h3>
              <p className="text-xs text-[#64748B] max-w-xs mx-auto leading-relaxed">{error}</p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={handleExit}
                className="py-2.5 px-4 rounded-xl border border-[#CBD5E1] bg-white text-xs font-bold text-[#475569] hover:bg-[#F1F5F9] transition cursor-pointer shadow-xs"
              >
                Exit
              </button>
              <button
                onClick={fetchPublicRoom}
                className="py-2.5 px-4 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold transition cursor-pointer shadow-xs"
              >
                Retry
              </button>
            </div>
          </div>
        ) : !isAuthenticated || !user ? (
          /* UNREGISTERED / LOGGED-OUT USER UI */
          <div className="py-2 text-center space-y-5">
            <div className="w-14 h-14 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto shadow-xs">
              <Lock size={26} />
            </div>

            <div>
              <span className="text-[11px] font-mono font-bold tracking-wider text-amber-700 uppercase block mb-1">
                AUTHENTICATION REQUIRED
              </span>
              <h2 className="text-xl font-extrabold text-[#0F172A]">
                Account Required
              </h2>
              <p className="text-xs text-[#64748B] max-w-xs mx-auto mt-2 leading-relaxed">
                You must have a registered TrueView AI account to join this proctoring session. Please register or login before continuing.
              </p>
            </div>

            {/* Room Preview Summary */}
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 text-left space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold text-[#64748B] uppercase tracking-wider">ROOM ID: {room.roomId}</span>
                <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${MODE_LABELS[room.mode]?.badge || 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]'}`}>
                  {room.mode}
                </span>
              </div>
              <h3 className="font-bold text-[#0F172A] text-sm line-clamp-1">{room.title}</h3>
            </div>

            {/* Actions: LOGIN, REGISTER, EXIT */}
            <div className="space-y-3 pt-2">
              <button
                onClick={() => navigate('/login')}
                className="w-full py-3.5 px-4 bg-[#10B981] hover:bg-[#059669] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogIn size={15} />
                <span>Login to Existing Account</span>
              </button>

              <button
                onClick={() => navigate('/register')}
                className="w-full py-3 px-4 bg-white hover:bg-[#F8FAFC] text-[#0F172A] border border-[#CBD5E1] font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <UserPlus size={15} />
                <span>Register New Candidate</span>
              </button>

              <button
                onClick={handleExit}
                className="w-full py-2.5 text-xs text-[#64748B] hover:text-[#0F172A] font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer rounded-lg hover:bg-[#F1F5F9]"
              >
                <ArrowLeft size={14} />
                <span>Exit</span>
              </button>
            </div>
          </div>
        ) : (
          /* REGISTERED & AUTHENTICATED USER UI */
          <>
            {/* Room Info Summary */}
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono font-bold tracking-wider text-[#64748B] uppercase">
                  ROOM ID: <strong className="text-[#0F172A] font-mono">{room.roomId}</strong>
                </span>
                <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${MODE_LABELS[room.mode]?.badge || 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]'}`}>
                  {room.mode}
                </span>
              </div>

              <h2 className="text-base font-bold text-[#0F172A] leading-snug line-clamp-2">
                {room.title}
              </h2>

              <div className="pt-3 border-t border-[#E2E8F0] grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[10px] text-[#64748B] font-bold uppercase tracking-wider block mb-0.5">HOST</span>
                  <span className="font-bold text-[#0F172A] truncate block text-xs">{room.hostName || 'Session Host'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#64748B] font-bold uppercase tracking-wider block mb-0.5">STATUS</span>
                  <span className="inline-flex items-center gap-1.5 font-bold text-[#059669] bg-[#ECFDF5] border border-[#A7F3D0] px-2 py-0.5 rounded-full text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] inline-block" />
                    {room.status || 'ACTIVE'}
                  </span>
                </div>
              </div>
            </div>

            {/* Authenticated Candidate Account Details */}
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-[#059669] uppercase font-bold flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-[#10B981] shrink-0" />
                  AUTHENTICATED CANDIDATE
                </span>
                <span className="px-2 py-0.5 rounded bg-[#F1F5F9] border border-[#CBD5E1] text-[#475569] font-mono text-[11px] font-bold uppercase tracking-wider">
                  {user.role || 'USER'}
                </span>
              </div>
              <div className="space-y-1">
                <p className="font-extrabold text-[#0F172A] text-base leading-tight">{user.fullName || user.name || 'Candidate'}</p>
                <p className="text-[#64748B] text-xs font-mono font-medium truncate">{user.email || 'N/A'}</p>
              </div>
            </div>

            {/* Verification Notice */}
            <div className="p-3.5 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] text-xs text-[#475569] flex items-start gap-3 leading-relaxed">
              <Lock size={16} className="shrink-0 mt-0.5 text-[#2563EB]" />
              <span className="text-[#475569] font-normal leading-relaxed">
                After clicking <strong className="text-[#0F172A] font-bold">Continue to Verification</strong>, you will perform camera liveness anti-spoof, face biometric verification, and system readiness checks.
              </span>
            </div>

            {/* Continue / Exit Action Controls */}
            <div className="space-y-3 pt-1">
              <button
                type="button"
                onClick={handleContinue}
                disabled={submitting}
                className="w-full py-3.5 px-4 bg-[#10B981] hover:bg-[#059669] active:bg-[#047857] text-[#FFFFFF] font-bold text-sm rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Continue to Verification</span>
                <ArrowRight size={17} className="stroke-[2.5]" />
              </button>

              <button
                type="button"
                onClick={handleExit}
                className="w-full py-2.5 text-xs text-[#64748B] hover:text-[#0F172A] font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer rounded-lg hover:bg-[#F1F5F9]"
              >
                <ArrowLeft size={14} />
                <span>Exit</span>
              </button>
            </div>
          </>
        )}
      </motion.div>

      {/* Footer Security Badge */}
      <div className="mt-6 flex items-center gap-2 text-xs text-[#64748B] font-medium z-10 text-center">
        <CheckCircle2 size={14} className="text-[#10B981] shrink-0" />
        <span>End-to-End Multimodal Trust Verification & Monitoring</span>
      </div>
    </div>
  );
}
