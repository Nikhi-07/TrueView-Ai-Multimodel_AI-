import { useEffect, useRef, useCallback } from 'react';

const ICE_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

/**
 * Reviewer-side WebRTC subscriber.
 *
 * Requests the participant's stream, answers their offer, and attaches the
 * remote media to the provided <video> element. The server only relays
 * signaling between an admin socket and a participant socket in the same room,
 * so unauthorized users can never subscribe to participant media.
 */
export default function useReviewerSubscriber({
  socket,
  isConnected,
  sessionId,
  videoRef,
  active = true,
  emitAIEvent,
}) {
  const pcRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const subscribedRef = useRef(false);

  const closePeer = useCallback(() => {
    if (pcRef.current) {
      try { pcRef.current.close(); } catch (_) {}
      pcRef.current = null;
    }
    remoteStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [videoRef]);

  const handleSignal = useCallback(({ sender, signal }) => {
    if (!signal) return;

    if (signal.type === 'offer' && signal.sdp) {
      const pc = new RTCPeerConnection(ICE_CONFIG);
      pcRef.current = pc;

      pc.onicecandidate = (ev) => {
        if (ev.candidate && socket) {
          socket.emit('webrtc_signal', {
            sessionId,
            target: sender,
            signal: { type: 'ice', candidate: ev.candidate },
          });
        }
      };

      pc.ontrack = (event) => {
        if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
        if (event.streams && event.streams[0]) {
          remoteStreamRef.current = event.streams[0];
        } else {
          remoteStreamRef.current.addTrack(event.track);
        }
        if (videoRef.current) {
          videoRef.current.srcObject = remoteStreamRef.current;
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'connected' && emitAIEvent) {
          emitAIEvent({
            eventType: 'WEBRTC_CONNECTION_OPEN',
            confidence: 1.0,
            description: 'Live participant video stream connected to the reviewer.',
          });
        } else if (state === 'failed' || state === 'closed' || state === 'disconnected') {
          if (emitAIEvent) {
            emitAIEvent({
              eventType: 'WEBRTC_CONNECTION_CLOSED',
              confidence: 1.0,
              description: 'Live participant video stream to the reviewer ended.',
            });
          }
        }
      };

      pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp })
        .then(() => pc.createAnswer())
        .then((answer) => pc.setLocalDescription(answer))
        .then(() => {
          if (socket) {
            socket.emit('webrtc_signal', {
              sessionId,
              target: sender,
              signal: { type: 'answer', sdp: pc.localDescription.sdp },
            });
          }
        })
        .catch((err) => {
          console.warn('[ReviewerSubscriber] offer/answer failed:', err);
          closePeer();
        });
    } else if (signal.type === 'ice' && signal.candidate && pcRef.current) {
      pcRef.current.addIceCandidate(signal.candidate).catch(() => {});
    }
  }, [socket, sessionId, videoRef, closePeer, emitAIEvent]);

  useEffect(() => {
    if (!active || !socket || !isConnected) return undefined;

    // Request the participant's stream (server authorizes reviewers only).
    if (!subscribedRef.current) {
      socket.emit('subscribe_stream', { sessionId });
      subscribedRef.current = true;
    }

    socket.on('webrtc_signal', handleSignal);

    return () => {
      socket.off('webrtc_signal', handleSignal);
      subscribedRef.current = false;
      closePeer();
    };
  }, [active, socket, isConnected, sessionId, handleSignal, closePeer]);

  return { remoteStream: remoteStreamRef.current, connectionState: pcRef.current?.connectionState || 'new' };
}
