import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, CheckCircle, AlertTriangle, ArrowRight, Volume2, ShieldCheck, Check, Sparkles, RefreshCw } from 'lucide-react';
import PageHeader from '../components/Cards/PageHeader';
import { useAuth } from '../context/AuthContext';
import { WAVAudioRecorder } from '../utils/wavRecorder';
import toast from 'react-hot-toast';

export default function VoiceRegistration() {
  const navigate = useNavigate();
  const { completeVoiceRegistration } = useAuth();

  const [challengePhrase, setChallengePhrase] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isMicAvailable, setIsMicAvailable] = useState(false);
  const [speechDetected, setSpeechDetected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [error, setError] = useState(null);

  const wavRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  // Generate randomized challenge phrase on mount
  useEffect(() => {
    generateChallengePhrase();
    initMicrophone();

    return () => {
      stopMicrophone();
    };
  }, []);

  const generateChallengePhrase = () => {
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    setChallengePhrase(`TrueView identity security code ${randomCode}`);
  };

  const initMicrophone = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setIsMicAvailable(true);
    } catch (err) {
      console.error('Microphone permission error:', err);
      setIsMicAvailable(false);
      setError('Microphone access denied or not found. Please enable microphone permissions in your browser settings.');
    }
  };

  const stopMicrophone = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (wavRecorderRef.current) {
      wavRecorderRef.current.stop();
      wavRecorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const startRecording = async () => {
    if (!streamRef.current || isRecording || isProcessing) return;

    setRecordingSeconds(0);
    setIsRecording(true);
    setError(null);
    setSpeechDetected(false);

    try {
      const recorder = new WAVAudioRecorder(streamRef.current, 16000);
      wavRecorderRef.current = recorder;

      recorder.start((level) => {
        setAudioLevel(level);
        if (level > 15) {
          setSpeechDetected(true);
        }
      });

      // Record for 8 seconds max
      let seconds = 0;
      timerRef.current = setInterval(() => {
        seconds += 1;
        setRecordingSeconds(seconds);
        if (seconds >= 8) {
          stopRecording();
        }
      }, 1000);
    } catch (err) {
      setError('Failed to initiate microphone recorder: ' + err.message);
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);

    if (wavRecorderRef.current) {
      setIsProcessing(true);
      try {
        const audioResult = await wavRecorderRef.current.stop();
        wavRecorderRef.current = null;

        if (!audioResult || !audioResult.base64) {
          throw new Error('No audio samples captured from microphone');
        }

        await completeVoiceRegistration(audioResult.base64);
        setIsCompleted(true);
        stopMicrophone();
        toast.success('Voice profile successfully registered!');
        setTimeout(() => {
          navigate('/');
        }, 1800);
      } catch (err) {
        console.error('Voice registration error:', err);
        setError(err.message || 'Failed to process voice embedding. Please try again.');
        toast.error(err.message || 'Voice registration failed');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader
        title="Voice Identity Enrollment"
        subtitle="Register your acoustic voice d-vector identity signature for continuous multi-factor authentication."
        breadcrumb={['TrueView AI', 'Registration', 'Voice Registration']}
      />

      {/* Account Setup Progress Bar */}
      <div className="glass p-4 rounded-xl flex items-center justify-between text-xs font-semibold shadow-sm">
        <div className="flex items-center gap-2 text-emerald-700 font-bold">
          <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-[10px]">✓</span>
          <span>1. Personal Details</span>
        </div>
        <div className="text-gray-400">→</div>
        <div className="flex items-center gap-2 text-emerald-700 font-bold">
          <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-[10px]">✓</span>
          <span>2. Face Registration</span>
        </div>
        <div className="text-gray-400">→</div>
        <div className="flex items-center gap-2 text-black font-extrabold">
          <span className="w-5 h-5 rounded-full bg-black text-white flex items-center justify-center font-bold text-[10px]">3</span>
          <span>3. Voice Enrollment ●</span>
        </div>
        <div className="text-gray-400">→</div>
        <div className="flex items-center gap-2 text-gray-400">
          <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center font-bold text-[10px]">4</span>
          <span>Complete</span>
        </div>
      </div>

      <div className="glass p-6 md:p-8 rounded-2xl flex flex-col items-center shadow-md">
        {!isCompleted ? (
          <>
            {/* Phrase Challenge Box */}
            <div className="w-full bg-gray-50 p-5 rounded-2xl border border-gray-200 mb-6 text-center shadow-inner">
              <div className="flex items-center justify-center gap-2 text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">
                <Sparkles size={14} className="text-black" />
                <span>Read the phrase aloud into your microphone</span>
              </div>
              <div className="p-4 bg-white rounded-xl border border-gray-300 font-black text-black text-lg md:text-xl tracking-wide shadow-sm select-all">
                "{challengePhrase}"
              </div>
            </div>

            {/* Audio Visualization & Status Box */}
            <div className="w-full bg-black rounded-2xl p-6 mb-6 flex flex-col items-center justify-center text-white relative overflow-hidden shadow-xl border border-gray-800">
              <div className="flex items-center justify-center w-20 h-20 rounded-full bg-gray-900 border border-gray-700 mb-4 relative shadow-lg">
                <Mic size={36} className={`transition-transform duration-200 ${isRecording ? 'text-red-500 scale-110 animate-pulse' : 'text-white'}`} />
                {isRecording && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 animate-ping"></span>
                )}
              </div>

              {/* Multi-frequency Audio Meter */}
              <div className="w-full max-w-xs bg-gray-900 rounded-full h-3 mb-3 overflow-hidden p-0.5 border border-gray-800 flex items-center shadow-inner">
                <div
                  className={`h-full rounded-full transition-all duration-75 ${
                    audioLevel > 60 ? 'bg-red-500' : audioLevel > 20 ? 'bg-emerald-400' : 'bg-white'
                  }`}
                  style={{ width: `${audioLevel}%` }}
                />
              </div>

              {/* Recording Status & Timer */}
              <p className="text-xs font-mono font-bold tracking-wide">
                {isRecording ? (
                  <span className="text-red-400">● RECORDING AUDIO: {recordingSeconds} / 8 SECONDS</span>
                ) : isProcessing ? (
                  <span className="text-gray-300 animate-pulse">Extracting 128-D Acoustic D-Vector...</span>
                ) : (
                  <span className="text-gray-400">Ready to record voice identity</span>
                )}
              </p>

              {/* Countdown Progress line */}
              {isRecording && (
                <div className="w-full bg-gray-900 h-1.5 mt-4 rounded-full overflow-hidden">
                  <div
                    className="bg-white h-full transition-all duration-1000 linear"
                    style={{ width: `${(recordingSeconds / 8) * 100}%` }}
                  />
                </div>
              )}
            </div>

            {/* Biometric Checklist */}
            <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-2 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200 text-xs">
              <div className="flex items-center gap-2 font-semibold text-black">
                <ShieldCheck size={16} className={isMicAvailable ? "text-emerald-600" : "text-gray-400"} />
                <span>Mic Hardware: {isMicAvailable ? 'Connected' : 'Unavailable'}</span>
              </div>
              <div className="flex items-center gap-2 font-semibold text-black">
                <Volume2 size={16} className="text-black" />
                <span>Format: 16kHz PCM WAV</span>
              </div>
              <div className="flex items-center gap-2 font-semibold text-black">
                <CheckCircle size={16} className={speechDetected ? "text-emerald-600" : "text-gray-400"} />
                <span>Speech Audio: {speechDetected ? 'Detected' : 'Listening...'}</span>
              </div>
            </div>

            {error && (
              <div className="w-full p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold text-center mb-5 flex items-center justify-center gap-2">
                <AlertTriangle size={16} /> 
                <span>{error}</span>
              </div>
            )}

            {!isRecording ? (
              <button
                onClick={startRecording}
                disabled={isProcessing || !isMicAvailable}
                className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 text-sm font-bold shadow-md disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" /> Processing Acoustic Profile...
                  </>
                ) : (
                  <>
                    <Mic size={18} /> Record Voice Signature (8s)
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg flex items-center justify-center gap-2 text-sm shadow-md animate-pulse"
              >
                <Mic size={18} /> Stop & Enroll Voice Profile
              </button>
            )}
          </>
        ) : (
          <div className="text-center py-8">
            <CheckCircle size={64} className="text-emerald-600 mx-auto mb-4 animate-bounce" />
            <h3 className="text-xl font-extrabold text-black mb-2">Voice & Face Profiles Enrolled!</h3>
            <p className="text-xs text-gray-600 mb-8 max-w-sm mx-auto">Your multi-factor biometric d-vectors have been securely registered to your TrueView account.</p>
            <button onClick={() => navigate('/')} className="btn-primary py-2.5 px-6 flex items-center justify-center gap-2 mx-auto text-sm">
              Proceed to Dashboard <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
