import { useState, useEffect, useRef, useCallback } from 'react';

export default function useCamera() {
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [permissionGranted, setPermissionGranted] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Enumerate devices once permission is available
  const getDevices = useCallback(async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(d => d.kind === 'videoinput');
      setDevices(videoDevices);
      if (videoDevices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
    } catch (err) {
      console.error('Error enumerating devices:', err);
    }
  }, [selectedDeviceId]);

  // NOTE: Camera permission is only requested when startCamera() is explicitly
  // called by the user-facing flow (face registration / login face step).
  // This hook never silently requests camera access on mount.

  const startCamera = useCallback(async (deviceId) => {
    // Stop any existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    const id = deviceId || selectedDeviceId;
    const constraints = {
      video: id ? { deviceId: { exact: id }, width: { ideal: 640 }, height: { ideal: 480 } }
                 : { width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    };

    try {
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = newStream;
      setIsActive(true);
      setPermissionGranted(true);
      setError(null);
      getDevices();

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
    } catch (err) {
      setError(err.message || 'Failed to start camera');
      setIsActive(false);
    }
  }, [selectedDeviceId]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsActive(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const captureFrameBase64 = useCallback(() => {
    const video = videoRef.current;
    if (!video || !isActive || video.videoWidth === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  }, [isActive]);

  return {
    videoRef,
    stream: streamRef.current,
    isActive,
    error,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    permissionGranted,
    startCamera,
    stopCamera,
    captureFrameBase64
  };
}
