import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PreSessionCheck from '../components/ProctorRoom/PreSessionCheck';
import ProctorRoomHost from './ProctorRoomHost';
import api from '../services/api';

export default function ProctorRoom() {
  const { id: roomId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const roleParam = searchParams.get('role');
  const isCandidate = roleParam === 'candidate' || roleParam === 'student' || roleParam === 'participant';
  const isReviewerMode = !isCandidate && (roleParam === 'reviewer' || roleParam === 'host');

  const paramSessionId = searchParams.get('sessionId');
  const token = (searchParams.get('token') || '').trim();
  const paramMode = (searchParams.get('mode') || 'EXAM').toUpperCase();
  const paramTitle = searchParams.get('title');
  const paramHost = searchParams.get('host');

  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchRoomDetails();
  }, [roomId, token]);

  const fetchRoomDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/rooms/${roomId}${token ? `?token=${encodeURIComponent(token)}` : ''}`);
      if (res.data.success && res.data.room) {
        setRoom({
          ...res.data.room,
          mode: paramMode || res.data.room.mode || 'EXAM',
          sessionType: paramMode || res.data.room.sessionType || 'EXAM',
          title: paramTitle || res.data.room.title || `Monitored Session ${roomId}`,
          host: paramHost || res.data.room.hostName || res.data.room.host?.name || 'TrueView Host',
        });
      } else {
        setError(res.data.message || 'Room not found or unauthorized access');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Access denied or invalid room ID/token');
    } finally {
      setLoading(false);
    }
  };

  const handleValidationComplete = async () => {
    const joinToken = token || room?.joinToken || room?.joinCode || '';
    const mode = room?.mode || paramMode || 'EXAM';
    const title = room?.title || paramTitle || `Monitored Session ${roomId}`;
    const host = room?.hostName || room?.host || paramHost || '';

    try {
      const joinRes = await api.post(`/rooms/${roomId}/join`, {
        token: joinToken,
        title,
        mode,
      });

      if (joinRes.data?.success && joinRes.data?.sessionId) {
        const activeSessionId = joinRes.data.sessionId;
        navigate(`/monitoring?sessionId=${activeSessionId}&roomId=${roomId}&mode=${mode}&title=${encodeURIComponent(title)}&host=${encodeURIComponent(host)}&verified=true`);
        return;
      } else {
        alert(joinRes.data?.message || 'Failed to join session. Access denied.');
      }
    } catch (err) {
      console.warn('[ProctorRoom] Join error:', err);
      alert(err.response?.data?.message || 'Unable to enter examination room. Invalid or expired room credentials.');
    }
  };

  const handleExit = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/rooms');
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex items-center justify-center font-sans">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 bg-emerald-500 rounded-full animate-ping" />
          <span className="text-xs font-mono font-bold tracking-wider text-slate-600">VERIFYING ROOM ACCESS & CREDENTIALS...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col justify-center items-center p-4 font-sans">
        <div className="w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 md:p-8 text-center space-y-4 shadow-sm">
          <div className="w-14 h-14 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
            <span className="text-2xl font-bold">!</span>
          </div>
          <div>
            <h3 className="text-base font-bold text-[#0F172A] mb-1">Access Denied</h3>
            <p className="text-xs text-[#64748B] leading-relaxed">{error}</p>
          </div>
          <div className="pt-2">
            <button
              onClick={handleExit}
              className="py-2.5 px-5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold transition cursor-pointer"
            >
              Return to Rooms
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 1. Reviewer / Host Dashboard view
  if (isReviewerMode) {
    return (
      <ProctorRoomHost />
    );
  }

  // 2. Participant Pre-Session Verification Check
  return (
    <PreSessionCheck
      room={room}
      user={user}
      onValidationComplete={handleValidationComplete}
      onExit={handleExit}
    />
  );
}
