import { useState, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Play, Square, Sparkles, AlertCircle, Volume2,
  Activity, Clock, ShieldCheck, RefreshCw, BarChart2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../components/Cards/PageHeader';
import StatusBadge from '../components/Cards/StatusBadge';
import ProgressBar from '../components/Charts/ProgressBar';

export default function VoiceActivityViewer() {
  const [isActive, setIsActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState(null);

  // VAD & speech analysis states
  const [voiceData, setVoiceData] = useState({
    voiceStatus: 'silence',
    confidence: 1.0,
    volumeRms: 0.0,
    maxAmplitude: 0.0,
    energy: 0.0,
    zcr: 0.0,
    noiseLevel: 0.001,
    speakingDuration: 0.0,
    silenceDuration: 0.0,
    noiseDuration: 0.0,
    sessionTotalSeconds: 0.0,
    speakingRatioPct: 0.0,
    currentPattern: 'Long Silence',
    consecutiveSpeakingSeconds: 0.0,
    consecutiveSilenceSeconds: 0.0,
    multipleVoicesDetected: false,
    processingTimeMs: 0,
    fps: 0
  });

  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const scriptProcessorRef = useRef(null);
  const audioBufferRef = useRef([]); // Accumulates raw float PCM samples
  const activeSessionId = useRef(`voice_session_${Date.now()}`);

  const framesProcessed = useRef(0);
  const lastFpsTime = useRef(Date.now());

  // Visual Oscilloscope Waveform Animation
  const animationRef = useRef(null);
  const liveSamplesRef = useRef(new Float32Array(256));

  const startVoiceMonitoring = async () => {
    try {
      setError(null);
      activeSessionId.current = `voice_session_${Date.now()}`;
      
      // Reset AI session tracker state
      await fetch('/ai-api/voice-detection/reset-voice-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: activeSessionId.current })
      });

      // Request Mic permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      // Create Audio Context downsampled to 16kHz
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextClass({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      // Create ScriptProcessor Node (2048 size)
      const scriptProcessor = audioContext.createScriptProcessor(2048, 1, 1);
      scriptProcessorRef.current = scriptProcessor;

      source.connect(scriptProcessor);
      scriptProcessor.connect(audioContext.destination);

      scriptProcessor.onaudioprocess = (event) => {
        if (isMuted) return;

        const inputBuffer = event.inputBuffer;
        const inputData = inputBuffer.getChannelData(0); // Float32Array of samples

        // Keep a copy of the latest samples for visual rendering
        liveSamplesRef.current = new Float32Array(inputData);

        // Accumulate samples until we have at least 4000 samples (250ms chunks)
        for (let i = 0; i < inputData.length; i++) {
          audioBufferRef.current.push(inputData[i]);
        }

        if (audioBufferRef.current.length >= 4000) {
          const chunkToSend = audioBufferRef.current.slice(0, 4000);
          audioBufferRef.current = audioBufferRef.current.slice(4000);
          sendAudioToAI(chunkToSend);
        }
      };

      setIsActive(true);
      drawWaveform();
    } catch (err) {
      console.error('Mic access error:', err);
      setError('Microphone permission denied or no audio input found.');
    }
  };

  const stopVoiceMonitoring = () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    
    setIsActive(false);
    audioBufferRef.current = [];
    setVoiceData(prev => ({
      ...prev,
      voiceStatus: 'silence',
      volumeRms: 0.0,
      maxAmplitude: 0.0,
      energy: 0.0,
      zcr: 0.0,
      speakingRatioPct: 0.0,
      currentPattern: 'Monitoring Inactive',
      fps: 0
    }));

    // Clear wave canvas
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const toggleMute = () => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMuted; // Toggle track state
      });
    }
    setIsMuted(!isMuted);
  };

  const handleResetSession = () => {
    fetch('/ai-api/voice-detection/reset-voice-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: activeSessionId.current })
    })
      .then(() => {
        setVoiceData(prev => ({
          ...prev,
          speakingDuration: 0,
          silenceDuration: 0,
          noiseDuration: 0,
          sessionTotalSeconds: 0,
          speakingRatioPct: 0
        }));
      })
      .catch(() => {});
  };

  const sendAudioToAI = async (samples) => {
    try {
      // FPS/Packet frequency calculation
      framesProcessed.current++;
      const now = Date.now();
      if (now - lastFpsTime.current >= 1000) {
        setVoiceData(prev => ({ ...prev, fps: framesProcessed.current }));
        framesProcessed.current = 0;
        lastFpsTime.current = now;
      }

      const res = await fetch('/ai-api/voice-detection/process-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ samples })
      });

      const result = await res.json();

      if (res.ok) {
        setVoiceData(prev => ({
          ...prev,
          voiceStatus: result.voice_status || 'silence',
          confidence: result.confidence || 0.0,
          volumeRms: result.volume_rms || 0.0,
          maxAmplitude: result.max_amplitude || 0.0,
          energy: result.energy || 0.0,
          zcr: result.zcr || 0.0,
          noiseLevel: result.noise_level || 0.001,
          speakingDuration: result.speaking_duration_seconds || 0.0,
          silenceDuration: result.silence_duration_seconds || 0.0,
          noiseDuration: result.noise_duration_seconds || 0.0,
          sessionTotalSeconds: result.session_total_seconds || 0.0,
          speakingRatioPct: result.speaking_ratio_pct || 0.0,
          currentPattern: result.current_pattern || 'Normal Speech',
          consecutiveSpeakingSeconds: result.consecutive_speaking_seconds || 0.0,
          consecutiveSilenceSeconds: result.consecutive_silence_seconds || 0.0,
          multipleVoicesDetected: result.multiple_voices_detected || false,
          processingTimeMs: result.processing_time_ms || 0
        }));

        // Log events to backend Express server
        fetch('/api/voice/log', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('trueview_token')}`
          },
          body: JSON.stringify({
            sessionId: activeSessionId.current,
            voiceStatus: result.voice_status,
            confidence: result.confidence,
            volumeRms: result.volume_rms,
            noiseLevel: result.noise_level,
            speakingDuration: result.speaking_duration_seconds,
            silenceDuration: result.silence_duration_seconds,
            speakingRatioPct: result.speaking_ratio_pct,
            currentPattern: result.current_pattern,
            multipleVoicesDetected: result.multiple_voices_detected,
            processingTimeMs: result.processing_time_ms
          })
        }).catch(() => {});
      }
    } catch (e) {
      // silent fail
    }
  };

  // Canvas visualizer loop
  const drawWaveform = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width;
    canvas.height = height;

    const draw = () => {
      if (!isActive) return;

      animationRef.current = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, width, height);

      // Draw horizontal reference line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      const samples = liveSamplesRef.current;
      const bufferLength = samples.length;

      // Select wave color based on VAD state
      let strokeColor = 'rgba(59, 130, 246, 0.8)'; // silence: Blue
      if (isMuted) {
        strokeColor = 'rgba(100, 116, 139, 0.4)'; // muted: Gray
      } else if (voiceData.voiceStatus === 'speaking') {
        strokeColor = 'rgba(245, 158, 11, 0.9)'; // speaking: Amber/Yellow
      } else if (voiceData.voiceStatus === 'background_noise') {
        strokeColor = 'rgba(239, 68, 68, 0.7)'; // noise: Red
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        // Boost wave height visually for representation
        const v = samples[i] * 2.0; 
        const y = (v * height / 2) + height / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.lineTo(width, height / 2);
      ctx.stroke();
    };

    draw();
  };

  useEffect(() => {
    if (isActive) {
      drawWaveform();
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isActive, isMuted, voiceData.voiceStatus]);

  useEffect(() => {
    return () => stopVoiceMonitoring();
  }, []);

  // Visual calculations
  const volumePercentage = Math.min(100, (voiceData.maxAmplitude / 0.1) * 100);
  const noiseFloorPct = Math.min(100, (voiceData.noiseLevel / 0.03) * 100);

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const item = { hidden: { opacity: 0, scale: 0.95 }, show: { opacity: 1, scale: 1 } };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="h-full flex flex-col gap-6">
      <PageHeader
        title="Voice VAD & Speech Analysis"
        subtitle="Real-time Voice Activity Detection, amplitude energy tracking & conversational proctoring"
        breadcrumb={['TrueView AI', 'Audio VAD']}
        actions={
          <div className="flex gap-2">
            {isActive && (
              <>
                <button
                  onClick={toggleMute}
                  className={`p-2 rounded-xl border transition-all ${
                    isMuted
                      ? 'bg-danger-500/20 text-danger-400 border-danger-500/30'
                      : 'bg-surface-800 hover:bg-surface-700 text-gray-300 border-white/[0.06]'
                  }`}
                  title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
                <button
                  onClick={handleResetSession}
                  className="py-2 px-4 rounded-xl text-xs font-semibold bg-surface-800 hover:bg-surface-700 text-gray-200 border border-white/[0.06] transition-all flex items-center gap-1.5"
                >
                  <RefreshCw size={12} /> Reset Counters
                </button>
              </>
            )}
            <button
              onClick={isActive ? stopVoiceMonitoring : startVoiceMonitoring}
              className={`py-2 px-4 rounded-xl font-medium flex items-center gap-2 transition-all ${
                isActive
                  ? 'bg-danger-500/25 hover:bg-danger-500/35 text-danger-400 border border-danger-500/30'
                  : 'bg-primary-500 hover:bg-primary-600 text-white'
              }`}
            >
              {isActive ? <Square size={16} /> : <Play size={16} />}
              {isActive ? 'Stop Monitoring' : 'Start Audio VAD'}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        
        {/* ══════════ Left Side: Audio Waveform ══════════ */}
        <motion.div variants={item} className="lg:col-span-8 flex flex-col h-[400px] lg:h-auto gap-4">
          
          {/* Wave Oscilloscope Screen */}
          <div className="glass flex-1 relative rounded-2xl overflow-hidden border-white/[0.1] bg-black/95 flex flex-col justify-between p-4 min-h-[300px]">
            
            {/* Header indicators */}
            <div className="flex justify-between items-center w-full z-10">
              <span className="bg-primary-500/20 backdrop-blur-md border border-primary-500/30 text-primary-400 text-xs font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5 animate-pulse">
                <Activity size={12} /> LIVE SIGNAL WAVEFORM
              </span>
              
              {isActive && (
                <div className="flex gap-2">
                  <StatusBadge
                    label={isMuted ? 'MUTED' : voiceData.voiceStatus.toUpperCase()}
                    variant={isMuted ? 'neutral' : voiceData.voiceStatus === 'speaking' ? 'warning' : voiceData.voiceStatus === 'background_noise' ? 'danger' : 'success'}
                    dot={!isMuted}
                  />
                  <span className="bg-surface-800/80 backdrop-blur-md border border-white/[0.05] text-[10px] text-gray-400 font-mono px-2 py-1 rounded-md">
                    PCM 16kHz
                  </span>
                </div>
              )}
            </div>

            {/* Waveform Canvas */}
            <div className="flex-1 w-full flex items-center justify-center relative my-4">
              <canvas ref={canvasRef} className="w-full h-40 max-h-48" />
              
              {!isActive && (
                <div className="absolute text-center text-surface-600 flex flex-col items-center">
                  <Mic size={64} className="mb-4 text-surface-700 animate-pulse" />
                  <h3 className="text-lg font-medium text-gray-400">Microphone Inactive</h3>
                  <p className="text-xs text-gray-500 max-w-xs mt-1">
                    Start Voice VAD to stream mic input, monitor acoustic patterns, and visualize waves.
                  </p>
                </div>
              )}
            </div>

            {/* Footer indicators */}
            <div className="flex justify-between items-center w-full z-10 border-t border-white/[0.05] pt-3 text-[10px] text-gray-500 font-mono">
              <div>Session ID: {isActive ? activeSessionId.current.slice(0, 15) + '...' : 'N/A'}</div>
              <div>Packet rate: {isActive ? `${voiceData.fps} chunks/sec` : '0 Chunks'}</div>
            </div>

            {error && (
              <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center p-6 text-danger-400 z-30">
                <AlertCircle size={48} className="mb-4" />
                <p className="text-sm font-semibold">{error}</p>
              </div>
            )}
          </div>

          {/* Volume Meter Block */}
          <div className="glass p-5 rounded-2xl space-y-4">
            <div className="flex items-center gap-2">
              <Volume2 size={16} className="text-primary-400" />
              <h3 className="text-sm font-bold text-gray-200">Decibel Peak & Dynamic Volume</h3>
            </div>
            
            <div className="space-y-3">
              <ProgressBar
                label="Peak Amplitude (Gain)"
                value={isActive ? volumePercentage : 0}
                color={voiceData.voiceStatus === 'speaking' ? 'warning' : voiceData.voiceStatus === 'background_noise' ? 'danger' : 'primary'}
              />
              <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                <span>0.0 (Silence)</span>
                <span>Peak: {voiceData.maxAmplitude.toFixed(4)}</span>
                <span>0.1 (Loud)</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ══════════ Right Side: Stats Panel ══════════ */}
        <motion.div variants={item} className="lg:col-span-4 space-y-4 overflow-y-auto">
          
          {/* Proctor Warnings */}
          <div className="glass p-5 rounded-2xl bg-gradient-to-br from-surface-900 to-surface-800 border-white/[0.08]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-primary-400" />
                <h3 className="text-sm font-bold text-gray-200">Proctor VAD Activity</h3>
              </div>
              {isActive && !isMuted && (
                <span className="text-[10px] text-gray-400 font-mono">
                  {(voiceData.confidence * 100).toFixed(0)}% conf
                </span>
              )}
            </div>

            <div className="bg-surface-950/60 border border-white/[0.04] rounded-xl p-4 text-center my-3 min-h-[100px] flex flex-col justify-center">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Current Activity Pattern</div>
              <motion.div
                key={voiceData.currentPattern}
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`text-xl font-extrabold mt-2 tracking-tight ${
                  voiceData.currentPattern.includes('Speaking') || voiceData.multipleVoicesDetected
                    ? 'text-amber-400' 
                    : voiceData.currentPattern.includes('Noise')
                    ? 'text-red-400'
                    : 'text-gray-300'
                }`}
              >
                {isActive ? voiceData.currentPattern : 'Monitoring Off'}
              </motion.div>
            </div>

            <AnimatePresence>
              {voiceData.multipleVoicesDetected && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-danger-500/10 border border-danger-500/20 text-danger-400 rounded-lg p-3 text-xs flex items-center gap-2 mb-2"
                >
                  <AlertCircle size={14} className="flex-shrink-0 animate-bounce" />
                  <div>
                    <span className="font-bold">⚠️ Warning:</span> Overlapping speech patterns / multiple voices detected in room!
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Speaks timers */}
          <div className="glass p-5 rounded-2xl space-y-4">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-primary-400" />
              <h3 className="text-sm font-bold text-gray-200">Conversation Timers</h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-800/40 rounded-lg p-3 text-center">
                <div className="text-[9px] text-gray-500 uppercase tracking-wider font-bold">Speaking Duration</div>
                <div className="text-xl font-bold font-mono text-gray-200 mt-1">
                  {voiceData.speakingDuration.toFixed(1)}s
                </div>
              </div>
              <div className="bg-surface-800/40 rounded-lg p-3 text-center">
                <div className="text-[9px] text-gray-500 uppercase tracking-wider font-bold">Silence Duration</div>
                <div className="text-xl font-bold font-mono text-gray-200 mt-1">
                  {voiceData.silenceDuration.toFixed(1)}s
                </div>
              </div>
            </div>

            <ProgressBar
              label="Speech Ratio"
              value={isActive ? voiceData.speakingRatioPct : 0}
              color="warning"
            />
          </div>

          {/* Acoustic metrics */}
          <div className="glass p-5 rounded-2xl space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <BarChart2 size={16} className="text-primary-400" />
              <h3 className="text-sm font-bold text-gray-200">Signal Parameters</h3>
            </div>

            <div className="space-y-3 pt-1">
              {/* Noise floor gauge */}
              <div>
                <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                  <span>Dynamic Noise Floor</span>
                  <span className="font-mono">{voiceData.noiseLevel.toFixed(5)}</span>
                </div>
                <ProgressBar value={isActive ? noiseFloorPct : 0} color={voiceData.noiseLevel > 0.015 ? 'danger' : 'success'} />
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-400 font-mono border-t border-white/[0.05] pt-3">
                <div className="flex justify-between">
                  <span>ZCR:</span>
                  <span>{voiceData.zcr.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span>RMS:</span>
                  <span>{voiceData.volumeRms.toFixed(5)}</span>
                </div>
                <div className="flex justify-between col-span-2">
                  <span>Server latency:</span>
                  <span>{voiceData.processingTimeMs}ms</span>
                </div>
              </div>
            </div>
          </div>

        </motion.div>
      </div>
    </motion.div>
  );
}
