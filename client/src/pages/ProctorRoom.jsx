import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PreSessionCheck from '../components/ProctorRoom/PreSessionCheck';
import ParticipantProctorRoom from '../components/ProctorRoom/ParticipantProctorRoom';
import ReviewerProctorRoom from '../components/ProctorRoom/ReviewerProctorRoom';

export default function ProctorRoom() {
  const { id: roomId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const roleParam = searchParams.get('role');
  const isReviewerMode = roleParam === 'reviewer' && (user?.role === 'admin' || user?.role === 'host' || user?.role === 'reviewer');

  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState('pre-check'); // pre-check, in-room
  const [activeStream, setActiveStream] = useState(null);

  // Fetch Room Details
  useEffect(() => {
    fetchRoomDetails();
  }, [roomId]);

  const fetchRoomDetails = async () => {
    try {
      const res = await fetch(`/api/rooms/${roomId}`);
      const data = await res.json();
      if (data.success) {
        setRoom(data.room);
      } else {
        // Fallback room object
        setRoom({
          id: roomId,
          title: `Monitored Proctor Session ${roomId}`,
          mode: 'EXAM',
          sessionType: 'EXAM',
          host: 'Dr. Sarah Jenkins',
          status: 'ACTIVE',
        });
      }
    } catch (err) {
      console.error(err);
      setRoom({
        id: roomId,
        title: `Monitored Proctor Session ${roomId}`,
        mode: 'EXAM',
        sessionType: 'EXAM',
        host: 'TrueView Host',
        status: 'ACTIVE',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleValidationComplete = () => {
    setStep('in-room');
  };

  const handleExit = () => {
    navigate('/rooms');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center font-mono">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 bg-white rounded-full animate-ping" />
          <span>LOADING PROCTOR ROOM...</span>
        </div>
      </div>
    );
  }

  // 1. Reviewer View directly skips pre-check if role is reviewer
  if (isReviewerMode) {
    return (
      <ReviewerProctorRoom
        room={room}
        user={user}
        onExit={handleExit}
      />
    );
  }

  // 2. Participant View: Step 1 Pre-Session Check
  if (step === 'pre-check') {
    return (
      <PreSessionCheck
        room={room}
        user={user}
        onValidationComplete={handleValidationComplete}
        onStreamReady={(stream) => setActiveStream(stream)}
      />
    );
  }

  // 3. Participant View: Step 2 Monitored Room
  return (
    <ParticipantProctorRoom
      room={room}
      user={user}
      stream={activeStream}
      onExit={handleExit}
    />
  );
}
