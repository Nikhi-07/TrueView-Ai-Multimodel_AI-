import { useCallback, useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

/**
 * MediaPipe Face Landmarker hook – real blendshape-based blink detection.
 *
 * Replaces unreliable luminance/EAR heuristics. Tracks eyeBlinkLeft and
 * eyeBlinkRight blendshapes over consecutive video frames through the temporal
 * state machine: OPEN -> CLOSING -> CLOSED -> OPEN.
 *
 * IMPORTANT: head pitch / yaw / roll, camera movement, and laptop tilt do NOT
 * change the eyeBlinkLeft/eyeBlinkRight blendshape scores, so they cannot
 * trigger false blinks.
 */

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const BLINK_CLOSED_THRESHOLD = 0.50; // blendshape >= 0.5  -> eye considered closed
const BLINK_CLOSING_THRESHOLD = 0.32; // >= 0.32 starts the closing transition
const OPEN_THRESHOLD = 0.22;          // < 0.22 -> eye fully open again
const MIN_BLINK_INTERVAL_MS = 350;    // ignore double-fire within 350ms

export default function useFaceLandmarker(videoRef, { enabled = true, onBlink = null } = {}) {
  const [status, setStatus] = useState('loading'); // loading | ready | unavailable
  const landmarkerRef = useRef(null);
  const blendshapesRef = useRef({ left: 0, right: 0, faceDetected: false });
  const blinkCountRef = useRef(0);
  const rafRef = useRef(null);
  const stateRef = useRef('OPEN');
  const lastBlinkTimeRef = useRef(0);
  const onBlinkRef = useRef(onBlink);
  onBlinkRef.current = onBlink;

  // 1. Load the model once
  useEffect(() => {
    let cancelled = false;
    if (!enabled) return undefined;

    (async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
        const landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false,
        });
        if (cancelled) return;
        landmarkerRef.current = landmarker;
        setStatus('ready');
      } catch (err) {
        console.warn('[useFaceLandmarker] MediaPipe Face Landmarker unavailable:', err);
        if (!cancelled) setStatus('unavailable');
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (landmarkerRef.current) {
        try { landmarkerRef.current.close(); } catch (_) {}
        landmarkerRef.current = null;
      }
    };
  }, [enabled]);

  // 2. Continuous detection loop (per video frame)
  useEffect(() => {
    if (status !== 'ready') return undefined;

    const loop = () => {
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const result = landmarkerRef.current.detectForVideo(video, performance.now());

          let left = 0;
          let right = 0;
          const faceDetected = Boolean(result.faceLandmarks && result.faceLandmarks.length > 0);
          const categories = result.faceBlendshapes && result.faceBlendshapes[0] && result.faceBlendshapes[0].categories;
          if (categories) {
            for (const c of categories) {
              if (c.categoryName === 'eyeBlinkLeft') left = c.score;
              else if (c.categoryName === 'eyeBlinkRight') right = c.score;
            }
          }
          blendshapesRef.current = { left, right, faceDetected };

          // Temporal blink state machine (per real blendshape signal)
          const avg = (left + right) / 2;
          const now = performance.now();
          let state = stateRef.current;

          if (state === 'OPEN' && avg >= BLINK_CLOSING_THRESHOLD) {
            state = 'CLOSING';
          } else if (state === 'CLOSING' && avg >= BLINK_CLOSED_THRESHOLD) {
            state = 'CLOSED';
          } else if (state === 'CLOSING' && avg < OPEN_THRESHOLD) {
            state = 'OPEN'; // aborted closure – not a blink
          } else if (state === 'CLOSED' && avg < OPEN_THRESHOLD) {
            state = 'OPEN';
            if (now - lastBlinkTimeRef.current >= MIN_BLINK_INTERVAL_MS) {
              lastBlinkTimeRef.current = now;
              blinkCountRef.current += 1;
              if (onBlinkRef.current) onBlinkRef.current(blinkCountRef.current);
            }
          }
          stateRef.current = state;
        } catch (_) {
          // transient detection errors are ignored
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [status, videoRef]);

  const getBlendshapes = useCallback(() => blendshapesRef.current, []);
  const getBlinkCount = useCallback(() => blinkCountRef.current, []);
  const resetBlinkCount = useCallback(() => {
    blinkCountRef.current = 0;
    stateRef.current = 'OPEN';
  }, []);

  return { status, getBlendshapes, getBlinkCount, resetBlinkCount };
}
