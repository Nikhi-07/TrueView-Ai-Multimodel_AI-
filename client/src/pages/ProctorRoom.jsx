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
  const isReviewerMode = roleParam === 'reviewer' || roleParam === 'host' || user?.role === 'admin' || user?.role === 'host';

  const paramSessionId = searchParams.get('sessionId');
  const paramMode = (searchParams.get('mode') || 'EXAM').toUpperCase();
  const paramTitle = searchParams.get('title');
  const paramHost = searchParams.get('host');

  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRoomDetails();
  }, [roomId]);

  const fetchRoomDetails = async () => {
    try {
      const res = await api.get(`/rooms/${roomId}`);
      if (res.data.success && res.data.room) {
        setRoom({
          ...res.data.room,
          mode: paramMode || res.data.room.mode || 'EXAM',
          sessionType: paramMode || res.data.room.sessionType || 'EXAM',
          title: paramTitle || res.data.room.title || `Monitored Session ${roomId}`,
          host: paramHost || res.data.room.hostName || res.data.room.host?.name || 'TrueView Host',
        });
      } else {
        setRoom({
          id: roomId,
          roomId,
          title: paramTitle || `Monitored Session ${roomId}`,
          mode: paramMode,
          sessionType: paramMode,
          host: paramHost || 'TrueView Host',
          status: 'ACTIVE',
        });
      }
    } catch (_) {
      setRoom({
        id: roomId,
        roomId,
        title: paramTitle || `Monitored Session ${roomId}`,
        mode: paramMode,
        sessionType: paramMode,
        host: paramHost || 'TrueView Host',
        status: 'ACTIVE',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleValidationComplete = async () => {
    const token = searchParams.get('token') || room?.joinCode || '';
    const mode = room?.mode || paramMode || 'EXAM';
    const title = room?.title || paramTitle || `Monitored Session ${roomId}`;
    const host = room?.hostName || room?.host || paramHost || '';

    try {
      const joinRes = await api.post(`/rooms/${roomId}/join`, {
        token,
        title,
        mode,
      });

      if (joinRes.data?.success && joinRes.data?.sessionId) {
        const activeSessionId = joinRes.data.sessionId;
        navigate(`/monitoring?sessionId=${activeSessionId}&roomId=${roomId}&mode=${mode}&title=${encodeURIComponent(title)}&host=${encodeURIComponent(host)}&verified=true`);
        return;
      }
    } catch (err) {
      console.warn('[ProctorRoom] Join error:', err);
    }

    const fallbackSessionId = paramSessionId || `TRV-${roomId}-${Date.now().toString(36).toUpperCase()}`;
    navigate(`/monitoring?sessionId=${fallbackSessionId}&roomId=${roomId}&mode=${mode}&title=${encodeURIComponent(title)}&host=${encodeURIComponent(host)}&verified=true`);
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
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center font-mono">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 bg-emerald-400 rounded-full animate-ping" />
          <span className="text-xs tracking-wider">INITIALIZING PRE-SESSION VERIFICATION...</span>
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
