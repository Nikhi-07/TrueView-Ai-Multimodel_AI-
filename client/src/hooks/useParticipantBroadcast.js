import { useEffect, useRef, useCallback } from 'react';

const ICE_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

/**
 * Participant-side WebRTC broadcaster.
 *
 * Publishes the participant's local media stream to authorized reviewers.
 * Signaling flows through the authoritative server (proctorSocket) which only
 * relays participant->reviewer offers, reviewer->participant answers, and
 * ICE between an admin socket and a participant socket in the same room.
 */
export default function useParticipantBroadcast({ socket, isConnected, stream, sessionId, active = true }) {
  const pcMapRef = useRef(new Map()); // reviewerSocketId -> RTCPeerConnection

  const cleanupPeer = useCallback((reviewerId) => {
    const pc = pcMapRef.current.get(reviewerId);
    if (pc) {
      try { pc.close(); } catch (_) {}
      pcMapRef.current.delete(reviewerId);
    }
  }, []);

  const handleOfferRequested = useCallback(({ reviewerSocketId }) => {
    if (!stream || !reviewerSocketId || !socket) return;

    // Replace any existing peer with this reviewer (e.g. after reviewer refresh)
    cleanupPeer(reviewerSocketId);

    const pc = new RTCPeerConnection(ICE_CONFIG);
    pcMapRef.current.set(reviewerSocketId, pc);

    stream.getTracks().forEach((track) => {
      try { pc.addTrack(track, stream); } catch (_) {}
    });

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        socket.emit('webrtc_signal', {
          sessionId,
          target: reviewerSocketId,
          signal: { type: 'ice', candidate: ev.candidate },
        });
      }
    };

    pc.createOffer().then((offer) => pc.setLocalDescription(offer)).catch((err) => {
      console.warn('[ParticipantBroadcast] createOffer failed:', err);
      cleanupPeer(reviewerSocketId);
    });
  }, [stream, socket, sessionId, cleanupPeer]);

  useEffect(() => {
    if (!active || !socket || !isConnected) return undefined;

    socket.on('STREAM_OFFER_REQUESTED', handleOfferRequested);

    socket.on('webrtc_signal', ({ sender, signal }) => {
      const pc = pcMapRef.current.get(sender);
      if (!pc || !signal) return;

      if (signal.type === 'answer' && signal.sdp) {
        pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp }).catch((err) => {
          console.warn('[ParticipantBroadcast] setRemoteDescription(answer) failed:', err);
          cleanupPeer(sender);
        });
      } else if (signal.type === 'ice' && signal.candidate) {
        pc.addIceCandidate(signal.candidate).catch(() => {});
      }
    });

    return () => {
      socket.off('STREAM_OFFER_REQUESTED', handleOfferRequested);
      socket.off('webrtc_signal');
      pcMapRef.current.forEach((pc) => {
        try { pc.close(); } catch (_) {}
      });
      pcMapRef.current.clear();
    };
  }, [active, socket, isConnected, handleOfferRequested, cleanupPeer]);

  return { broadcastActive: pcMapRef.current.size > 0 };
}
