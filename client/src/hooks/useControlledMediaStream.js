import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook for controlled MediaStream (Camera + Microphone) monitoring.
 * Continuously tracks track readyState, enabled state, mute state, ended events,
 * and system devicechange events to detect immediate camera/microphone interruptions.
 */
export default function useControlledMediaStream({
  initialStream = null,
  onCameraInterrupted,
  onMicrophoneInterrupted,
  autoStart = false
}) {
  const [stream, setStream] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [microphoneActive, setMicrophoneActive] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('UNKNOWN'); // ACTIVE, INTERRUPTED, DISABLED
  const [microphoneStatus, setMicrophoneStatus] = useState('UNKNOWN'); // ACTIVE, INTERRUPTED, DISABLED
  const [error, setError] = useState(null);

  const streamRef = useRef(null);
  const videoTrackRef = useRef(null);
  const audioTrackRef = useRef(null);
  const healthCheckIntervalRef = useRef(null);

  // Stop all tracks cleanly
  const stopStream = useCallback(() => {
    if (healthCheckIntervalRef.current) {
      clearInterval(healthCheckIntervalRef.current);
      healthCheckIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (_) {}
      });
      streamRef.current = null;
    }
    videoTrackRef.current = null;
    audioTrackRef.current = null;

    setStream(null);
    setCameraActive(false);
    setMicrophoneActive(false);
    setCameraStatus('DISABLED');
    setMicrophoneStatus('DISABLED');
  }, []);

  // Handle Camera Interruption Event
  const triggerCameraInterruption = useCallback((reason) => {
    console.warn(`[ControlledStream] CAMERA_INTERRUPTED: ${reason}`);
    setCameraActive(false);
    setCameraStatus('INTERRUPTED');
    if (onCameraInterrupted) {
      onCameraInterrupted(reason);
    }
  }, [onCameraInterrupted]);

  // Handle Microphone Interruption Event
  const triggerMicrophoneInterruption = useCallback((reason) => {
    console.warn(`[ControlledStream] MICROPHONE_INTERRUPTED: ${reason}`);
    setMicrophoneActive(false);
    setMicrophoneStatus('INTERRUPTED');
    if (onMicrophoneInterrupted) {
      onMicrophoneInterrupted(reason);
    }
  }, [onMicrophoneInterrupted]);

  // Start Camera & Microphone Stream
  const startStream = useCallback(async (customStream = null) => {
    if (healthCheckIntervalRef.current) {
      clearInterval(healthCheckIntervalRef.current);
      healthCheckIntervalRef.current = null;
    }
    setError(null);

    try {
      let mediaStream = customStream || initialStream;

      // Acquire new stream if no active valid stream passed
      const hasLiveVideo = mediaStream && mediaStream.active && mediaStream.getVideoTracks().some(t => t.readyState === 'live');
      if (!hasLiveVideo) {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
      }

      streamRef.current = mediaStream;
      setStream(mediaStream);

      // Extract Video Track
      const vTrack = mediaStream.getVideoTracks()[0];
      if (vTrack && vTrack.readyState === 'live') {
        videoTrackRef.current = vTrack;
        setCameraActive(true);
        setCameraStatus('ACTIVE');

        vTrack.onended = () => {
          triggerCameraInterruption('Camera track ended unexpectedly.');
        };
        vTrack.onmute = () => {
          triggerCameraInterruption('Camera stream muted by OS or external device.');
        };
        vTrack.onunmute = () => {
          setCameraActive(true);
          setCameraStatus('ACTIVE');
        };
      } else {
        triggerCameraInterruption('No active video track available in user media.');
      }

      // Extract Audio Track
      const aTrack = mediaStream.getAudioTracks()[0];
      if (aTrack && aTrack.readyState === 'live') {
        audioTrackRef.current = aTrack;
        setMicrophoneActive(true);
        setMicrophoneStatus('ACTIVE');

        aTrack.onended = () => {
          triggerMicrophoneInterruption('Microphone track ended unexpectedly.');
        };
        aTrack.onmute = () => {
          triggerMicrophoneInterruption('Microphone stream muted by OS or external device.');
        };
        aTrack.onunmute = () => {
          setMicrophoneActive(true);
          setMicrophoneStatus('ACTIVE');
        };
      } else {
        triggerMicrophoneInterruption('No active audio track available in user media.');
      }

      // Start continuous track health loop (every 1.5 seconds)
      healthCheckIntervalRef.current = setInterval(() => {
        // Video Track Health Check
        const v = videoTrackRef.current;
        if (v) {
          if (v.readyState === 'ended' || !v.enabled) {
            triggerCameraInterruption(`Camera track state: ${v.readyState}, enabled: ${v.enabled}`);
          }
        }

        // Audio Track Health Check
        const a = audioTrackRef.current;
        if (a) {
          if (a.readyState === 'ended' || !a.enabled) {
            triggerMicrophoneInterruption(`Microphone track state: ${a.readyState}, enabled: ${a.enabled}`);
          }
        }
      }, 1500);

      return mediaStream;
    } catch (err) {
      console.error('[ControlledStream] getUserMedia error:', err);
      const errMsg = err.message || 'Camera or microphone access denied.';
      setError(errMsg);
      setCameraStatus('INTERRUPTED');
      setMicrophoneStatus('INTERRUPTED');
      triggerCameraInterruption(errMsg);
      triggerMicrophoneInterruption(errMsg);
      return null;
    }
  }, [initialStream, triggerCameraInterruption, triggerMicrophoneInterruption]);

  // Listen to physical device changes (hardware disconnects)
  useEffect(() => {
    const handleDeviceChange = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasVideo = devices.some(d => d.kind === 'videoinput');
        const hasAudio = devices.some(d => d.kind === 'audioinput');

        if (!hasVideo && cameraStatus === 'ACTIVE') {
          triggerCameraInterruption('Camera device physically unplugged.');
        }
        if (!hasAudio && microphoneStatus === 'ACTIVE') {
          triggerMicrophoneInterruption('Microphone device physically unplugged.');
        }
      } catch (_) {}
    };

    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    }
    return () => {
      if (navigator.mediaDevices && navigator.mediaDevices.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
    };
  }, [cameraStatus, microphoneStatus, triggerCameraInterruption, triggerMicrophoneInterruption]);

  // Auto-start on mount if specified
  useEffect(() => {
    if (autoStart) {
      startStream();
    }
    return () => {
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
      }
    };
  }, [autoStart, startStream]);

  return {
    stream,
    cameraActive,
    microphoneActive,
    cameraStatus,
    microphoneStatus,
    error,
    startStream,
    stopStream,
    videoTrack: videoTrackRef.current,
    audioTrack: audioTrackRef.current,
  };
}
