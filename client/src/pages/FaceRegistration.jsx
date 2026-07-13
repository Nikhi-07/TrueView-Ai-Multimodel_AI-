import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Scan, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import PageHeader from '../components/Cards/PageHeader';
import useCamera from '../hooks/useCamera';
import api from '../services/api';
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
  const { videoRef, isActive, error: camError, startCamera, stopCamera, captureFrameBase64 } = useCamera();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [capturedEmbeddings, setCapturedEmbeddings] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

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
      // POST to FastAPI face recognition module to extract embedding
      const response = await fetch('/ai-api/face-recognition/extract-embedding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: frame })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.detail || 'Failed to extract face features.');
      }
      
      const nextEmbeddings = [...capturedEmbeddings, result.embedding];
      setCapturedEmbeddings(nextEmbeddings);
      
      toast.success(`Pose "${STEPS[currentStep].pose}" recorded successfully!`);

      if (currentStep < STEPS.length - 1) {
        setCurrentStep(prev => prev + 1);
      } else {
        // All poses captured, save to Node database
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
      await api.post('/auth/register-face', { embeddings });
      setIsCompleted(true);
      toast.success('Face profile saved successfully!');
      stopCamera();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save face profile.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader 
        title="Face Registration" 
        subtitle="Create a 3D facial template for authentication" 
        breadcrumb={['TrueView AI', 'Registration']}
      />

      <div className="glass p-6 rounded-2xl flex flex-col items-center">
        {!isCompleted ? (
          <>
            <div className="w-full flex justify-between items-center mb-6">
              <div>
                <h3 className="text-sm font-bold text-gray-200">Step {currentStep + 1} of {STEPS.length}</h3>
                <p className="text-xs text-gray-500 mt-1">{STEPS[currentStep].label}</p>
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

            {/* Webcam / Feed Frame */}
            <div className="w-[320px] h-[320px] rounded-2xl overflow-hidden bg-black relative border border-white/[0.1] mb-6 flex items-center justify-center">
              {camError ? (
                <div className="text-center p-4 text-danger-400">
                  <AlertTriangle size={36} className="mx-auto mb-2" />
                  <p className="text-xs">{camError}</p>
                </div>
              ) : (
                <>
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  <div className="absolute inset-0 border border-primary-500/30 rounded-2xl pointer-events-none flex items-center justify-center">
                    {/* Face boundary overlay */}
                    <div className="w-[200px] h-[200px] border border-dashed border-primary-500/50 rounded-full" />
                  </div>
                </>
              )}
            </div>

            <button 
              onClick={capturePose} 
              disabled={isProcessing || !isActive}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2"
            >
              <Camera size={16} /> 
              {isProcessing ? 'Processing Face...' : `Capture Pose`}
            </button>
          </>
        ) : (
          <div className="text-center py-8">
            <CheckCircle size={64} className="text-success-400 mx-auto mb-4 animate-bounce" />
            <h3 className="text-lg font-bold text-gray-100 mb-2">Registration Complete</h3>
            <p className="text-sm text-gray-500 mb-8 max-w-sm">Your face profile has been enrolled and encrypted securely in your account.</p>
            <button onClick={() => navigate('/')} className="btn-primary py-2 px-6 flex items-center justify-center gap-2 mx-auto">
              Go to Dashboard <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
