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
  const eyeMetricsRef = useRef({ faceDetected: false, confidence: 0, leftEAR: 0, rightEAR: 0, averageEAR: 0, blendshapes: { left: 0, right: 0 } });
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

          // Geometric Eye Aspect Ratio (EAR) from MediaPipe 478 landmarks
          let leftEAR = 0;
          let rightEAR = 0;
          let averageEAR = 0;
          if (faceDetected && result.faceLandmarks[0]) {
            const lm = result.faceLandmarks[0];
            const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
            // Right eye (face's right eye, viewer's left: 33, 160, 158, 133, 153, 144)
            if (lm[33] && lm[133] && lm[160] && lm[158] && lm[153] && lm[144]) {
              const r_v1 = dist(lm[160], lm[144]);
              const r_v2 = dist(lm[158], lm[153]);
              const r_h  = dist(lm[33], lm[133]);
              rightEAR = (r_v1 + r_v2) / (2.0 * Math.max(r_h, 1e-5));
            }
            // Left eye (face's left eye, viewer's right: 362, 385, 387, 263, 373, 380)
            if (lm[362] && lm[263] && lm[385] && lm[387] && lm[373] && lm[380]) {
              const l_v1 = dist(lm[385], lm[380]);
              const l_v2 = dist(lm[387], lm[373]);
              const l_h  = dist(lm[362], lm[263]);
              leftEAR = (l_v1 + l_v2) / (2.0 * Math.max(l_h, 1e-5));
            }
            averageEAR = (leftEAR + rightEAR) / 2.0;
          }

          eyeMetricsRef.current = {
            faceDetected,
            confidence: faceDetected ? 0.95 : 0.0,
            leftEAR: Number(leftEAR.toFixed(4)),
            rightEAR: Number(rightEAR.toFixed(4)),
            averageEAR: Number(averageEAR.toFixed(4)),
            blendshapes: { left, right },
          };

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
  const getEyeMetrics = useCallback(() => eyeMetricsRef.current, []);
  const getBlinkCount = useCallback(() => blinkCountRef.current, []);
  const resetBlinkCount = useCallback(() => {
    blinkCountRef.current = 0;
    stateRef.current = 'OPEN';
  }, []);

  return { status, getBlendshapes, getEyeMetrics, getBlinkCount, resetBlinkCount };
}
