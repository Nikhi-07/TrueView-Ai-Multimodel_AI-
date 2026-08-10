import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, CheckCircle, AlertTriangle, ArrowRight, ShieldCheck, Check, Sparkles, Eye } from 'lucide-react';
import PageHeader from '../components/Cards/PageHeader';
import useCamera from '../hooks/useCamera';
import useFaceLandmarker from '../hooks/useFaceLandmarker';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const STEPS = [
  { label: 'Look straight at the camera', pose: 'center' },
  { label: 'Slightly turn your head left', pose: 'left' },
  { label: 'Slightly turn your head right', pose: 'right' },
  { label: 'Slightly tilt your head up', pose: 'up' },
  { label: 'Slightly tilt your head down', pose: 'down' }
];

export default function FaceRegistration() {
  const navigate = useNavigate();
  const { completeFaceRegistration } = useAuth();
  const { videoRef, isActive, error: camError, startCamera, stopCamera, captureFrameBase64 } = useCamera();

  const [currentStep, setCurrentStep] = useState(0);
  const [capturedEmbeddings, setCapturedEmbeddings] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [livenessStatus, setLivenessStatus] = useState('IDLE'); // IDLE | CHECKING | LIVE | SPOOF | SERVICE_UNAVAILABLE

  // Real MediaPipe blendshape blink detection (tilt-independent)
  const [blinkCount, setBlinkCount] = useState(0);
  const landmarker = useFaceLandmarker(videoRef, {
    enabled: !isCompleted,
    onBlink: (count) => setBlinkCount(count)
  });

  useEffect(() => {
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const capturePose = async () => {
    if (isProcessing || isCompleted) return;
    
    setIsProcessing(true);
    const frame = captureFrameBase64();
    if (!frame) {
      toast.error('Could not capture frame. Try again.');
      setIsProcessing(false);
      return;
    }

    try {
      // ── STEP 1: Mandatory Liveness / Presentation Attack Detection (PAD) gate ──
      // A face registration must not simply capture a photograph. MiniFASNet anti-spoofing
      // must confirm a LIVE human before the embedding is extracted. If the AI service is
      // unavailable this FAILS CLOSED (no embedding is captured).
      setLivenessStatus('CHECKING');
      const blendshapes = landmarker.getBlendshapes();

      let livenessResponse;
      try {
        livenessResponse = await fetch('/ai-api/liveness/evaluate-auth-liveness', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: frame,
            session_id: 'face-registration',
            eye_blink_left: blendshapes.left,
            eye_blink_right: blendshapes.right
          })
        });
      } catch (_) {
        setLivenessStatus('SERVICE_UNAVAILABLE');
        throw new Error('Liveness verification service is unavailable. Please try again later.');
      }

      if (!livenessResponse || !livenessResponse.ok) {
        setLivenessStatus('SERVICE_UNAVAILABLE');
        throw new Error('Liveness verification service error. Please try again.');
      }

      const livenessData = await livenessResponse.json();
      const antiSpoof = livenessData.antiSpoof || {};

      if (antiSpoof.status !== 'LIVE' || !antiSpoof.is_live) {
        setLivenessStatus('SPOOF');
        throw new Error(antiSpoof.message || 'Presentation attack detected. Live human face required for registration.');
      }
      setLivenessStatus('LIVE');

      // ── STEP 2: POST to FastAPI face recognition module to extract embedding ──
      const response = await fetch('/ai-api/face-recognition/extract-embedding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: frame })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.detail || result.error || 'Failed to extract face features.');
      }
      
      const nextEmbeddings = [...capturedEmbeddings, result.embedding];
      setCapturedEmbeddings(nextEmbeddings);
      
      toast.success(`Pose "${STEPS[currentStep].pose}" recorded successfully!`);

      if (currentStep < STEPS.length - 1) {
        setCurrentStep(prev => prev + 1);
      } else {
        // All poses captured, send to complete face registration
        await saveFaceEmbeddings(nextEmbeddings);
      }
    } catch (err) {
      toast.error(err.message || 'Error processing face. Please ensure you are centered and well lit.');
    } finally {
      setIsProcessing(false);
    }
  };

  const saveFaceEmbeddings = async (embeddings) => {
    try {
      setIsProcessing(true);
      await completeFaceRegistration(embeddings);
      setIsCompleted(true);
      stopCamera();
      // Automatically transition to Voice Registration
      setTimeout(() => {
        navigate('/register-voice');
      }, 1500);
    } catch (err) {
      toast.error(err.message || 'Failed to save face profile.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader 
        title="Secure Your Account - Step 2 of 3" 
        subtitle="Face registration is required to complete your account." 
        breadcrumb={['TrueView AI', 'Mandatory Registration', 'Face Registration']}
      />

      {/* Account Setup Step Progress Bar */}
      <div className="bg-surface-900/80 p-4 rounded-xl border border-white/10 flex items-center justify-between text-xs font-semibold">
        <div className="flex items-center gap-2 text-success-400">
          <span className="w-5 h-5 rounded-full bg-success-500/20 text-success-400 flex items-center justify-center font-bold text-[10px]">✓</span>
          <span>1. Personal Details</span>
        </div>
        <div className="text-gray-600">→</div>
        <div className="flex items-center gap-2 text-primary-400 font-bold">
          <span className="w-5 h-5 rounded-full bg-primary-500 text-black flex items-center justify-center font-bold text-[10px]">2</span>
          <span>2. Face Registration</span>
        </div>
        <div className="text-gray-600">→</div>
        <div className="flex items-center gap-2 text-gray-500">
          <span className="w-5 h-5 rounded-full bg-surface-800 text-gray-400 flex items-center justify-center font-bold text-[10px]">3</span>
          <span>3. Voice Registration</span>
        </div>
        <div className="text-gray-600">→</div>
        <div className="flex items-center gap-2 text-gray-500">
          <span className="w-5 h-5 rounded-full bg-surface-800 text-gray-400 flex items-center justify-center font-bold text-[10px]">4</span>
          <span>Complete</span>
        </div>
      </div>

      <div className="glass p-6 rounded-2xl flex flex-col items-center">
        {!isCompleted ? (
          <>
            <div className="w-full flex justify-between items-center mb-4">
              <div>
                <h3 className="text-sm font-bold text-gray-200">Pose {currentStep + 1} of {STEPS.length}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{STEPS[currentStep].label}</p>
              </div>
              <div className="flex gap-1.5">
                {STEPS.map((_, i) => (
                  <div 
                    key={i} 
                    className={`w-3 h-3 rounded-full transition-all duration-300 ${i === currentStep ? 'bg-primary-500 scale-125' : i < currentStep ? 'bg-success-500' : 'bg-surface-800'}`}
                  />
                ))}
              </div>
            </div>

            {/* Quality & Detection Status Indicators */}
            <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-2 mb-6 bg-surface-900/60 p-3 rounded-xl border border-white/5">
              <div className="flex items-center gap-1.5 text-xs text-success-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-success-500 animate-ping"></span>
                <span>● Face detected</span>
              </div>
              <div className={`flex items-center gap-1.5 text-xs font-semibold ${livenessStatus === 'LIVE' ? 'text-success-400' : livenessStatus === 'SPOOF' || livenessStatus === 'SERVICE_UNAVAILABLE' ? 'text-danger-400' : 'text-gray-400'}`}>
                <ShieldCheck size={14} />
                <span>Live person (PAD): {livenessStatus === 'LIVE' ? 'VERIFIED' : livenessStatus === 'CHECKING' ? 'Checking…' : livenessStatus === 'SPOOF' ? 'FAILED' : livenessStatus === 'SERVICE_UNAVAILABLE' ? 'Unavailable' : 'Waiting…'}</span>
              </div>
              <div className={`flex items-center gap-1.5 text-xs font-semibold ${blinkCount > 0 ? 'text-success-400' : 'text-gray-400'}`}>
                <Eye size={14} />
                <span>Natural blink: {blinkCount}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-success-400 font-semibold">
                <Sparkles size={14} />
                <span>MediaPipe blendshapes: {landmarker.status === 'ready' ? 'ON' : 'loading…'}</span>
              </div>
            </div>

            {/* Camera Preview Frame */}
            <div className="w-[320px] h-[320px] rounded-2xl overflow-hidden bg-black relative border border-white/[0.1] mb-6 flex items-center justify-center shadow-2xl">
              {camError ? (
                <div className="text-center p-4 text-danger-400">
                  <AlertTriangle size={36} className="mx-auto mb-2" />
                  <p className="text-xs">{camError}</p>
                </div>
              ) : (
                <>
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                  <div className="absolute inset-0 border border-primary-500/30 rounded-2xl pointer-events-none flex items-center justify-center">
                    {/* Face oval guide */}
                    <div className="w-[210px] h-[260px] border-2 border-dashed border-primary-400/60 rounded-[50%]" />
                  </div>
                </>
              )}
            </div>

            <button 
              onClick={capturePose} 
              disabled={isProcessing || !isActive}
              className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 text-sm font-bold shadow-lg"
            >
              <Camera size={18} /> 
              {isProcessing ? 'Processing Face & Liveness...' : `Register Face (${currentStep + 1}/${STEPS.length})`}
            </button>
          </>
        ) : (
          <div className="text-center py-8">
            <CheckCircle size={64} className="text-success-400 mx-auto mb-4 animate-bounce" />
            <h3 className="text-lg font-bold text-gray-100 mb-2">Face Registration Complete!</h3>
            <p className="text-sm text-gray-400 mb-8 max-w-sm">Face profile saved. Proceeding to mandatory voice registration...</p>
            <button onClick={() => navigate('/register-voice')} className="btn-primary py-2.5 px-6 flex items-center justify-center gap-2 mx-auto">
              Continue to Voice Registration <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
