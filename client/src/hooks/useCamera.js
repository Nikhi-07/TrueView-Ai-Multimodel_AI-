import { useState, useEffect, useRef, useCallback } from 'react';

export default function useCamera() {
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [activeDeviceLabel, setActiveDeviceLabel] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const captureCanvasRef = useRef(null);

  // Enumerate devices once permission is available
  const getDevices = useCallback(async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(d => d.kind === 'videoinput');
      setDevices(videoDevices);
      return videoDevices;
    } catch (err) {
      console.error('Error enumerating devices:', err);
      return [];
    }
  }, []);

  const startCamera = useCallback(async (deviceId) => {
    // Stop any existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    let targetId = deviceId || selectedDeviceId;

    const constraints = {
      video: targetId ? { deviceId: { exact: targetId }, width: { ideal: 640 }, height: { ideal: 480 } }
                      : { width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    };

    try {
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = newStream;
      setIsActive(true);
      setPermissionGranted(true);
      setError(null);

      const track = newStream.getVideoTracks()[0];
      const trackLabel = track ? (track.label || '') : '';
      setActiveDeviceLabel(trackLabel);

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }

      // Enumerate devices now that permission is granted and labels are visible
      const videoDevices = await getDevices();

      // If user did not manually pick a specific device, and the active stream is an OBS / virtual camera,
      // check if a real physical webcam (e.g. Integrated Webcam, USB camera) is available and auto-switch to it.
      if (!deviceId && /virtual|obs/i.test(trackLabel)) {
        const physicalCam = videoDevices.find(d => !/virtual|obs/i.test(d.label || ''));
        if (physicalCam && physicalCam.deviceId) {
          console.log('[useCamera] Auto-switching from virtual camera to physical:', physicalCam.label);
          setSelectedDeviceId(physicalCam.deviceId);
          // Restart with physical camera
          newStream.getTracks().forEach(t => t.stop());
          const physConstraints = {
            video: { deviceId: { exact: physicalCam.deviceId }, width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false
          };
          const physStream = await navigator.mediaDevices.getUserMedia(physConstraints);
          streamRef.current = physStream;
          const physTrack = physStream.getVideoTracks()[0];
          setActiveDeviceLabel(physTrack ? (physTrack.label || '') : physicalCam.label);
          if (videoRef.current) {
            videoRef.current.srcObject = physStream;
          }
          return;
        }
      }

      const activeId = track?.getSettings?.()?.deviceId || targetId;
      if (activeId) {
        setSelectedDeviceId(activeId);
      }
    } catch (err) {
      setError(err.message || 'Failed to start camera');
      setIsActive(false);
    }
  }, [selectedDeviceId, getDevices]);

  const switchCamera = useCallback(async (deviceId) => {
    setSelectedDeviceId(deviceId);
    await startCamera(deviceId);
  }, [startCamera]);

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
    if (!video || !isActive || video.videoWidth === 0 || video.readyState < 2) return null;

    if (!captureCanvasRef.current) {
      captureCanvasRef.current = document.createElement('canvas');
    }
    const canvas = captureCanvasRef.current;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  }, [isActive]);

  const isVirtualCamera = /virtual|obs/i.test(activeDeviceLabel);

  return {
    videoRef,
    stream: streamRef.current,
    isActive,
    error,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    activeDeviceLabel,
    isVirtualCamera,
    permissionGranted,
    startCamera,
    switchCamera,
    stopCamera,
    captureFrameBase64
  };
}

