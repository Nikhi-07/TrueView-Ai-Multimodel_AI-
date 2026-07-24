import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ShieldCheck, Scan, AlertTriangle, RefreshCw, XCircle } from 'lucide-react';
import PageHeader from '../components/Cards/PageHeader';
import useCamera from '../hooks/useCamera';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function LiveVerification() {
  const navigate = useNavigate();
  const { id } = useParams(); // Get session ID from URL
  const { videoRef, isActive, error: camError, startCamera, stopCamera, captureFrameBase64 } = useCamera();
  
  const [candidates, setCandidates] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [verificationStatus, setVerificationStatus] = useState('idle'); // idle, loading, success, failed, no_profile
  const [confidence, setConfidence] = useState(0);
  const [processingTime, setProcessingTime] = useState(0);
  const requestRef = useRef(null);

  // Load embeddings from backend
  useEffect(() => {
    const fetchEmbeddings = async () => {
      try {
        const res = await api.get('/auth/face-embeddings');
        setUserProfile({ id: res.data.id, name: res.data.fullName });
        if (res.data.embeddings && res.data.embeddings.length > 0) {
          // Format as required by FastAPI candidates
          const formatted = res.data.embeddings.map((emb, index) => ({
             id: `${res.data.id}_${index}`,
             embedding: emb
          }));
          setCandidates(formatted);
          startCamera();
        } else {
          setVerificationStatus('no_profile');
        }
      } catch (err) {
        toast.error('Failed to retrieve user face profile. Redirecting to registration.');
        navigate('/face-registration');
      }
    };
    fetchEmbeddings();
    return () => {
      stopCamera();
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [navigate, startCamera, stopCamera]);

  const runVerification = useCallback(async () => {
    if (!isActive || candidates.length === 0) return;

    setVerificationStatus('loading');
    const frame = captureFrameBase64();
    if (!frame) {
      setVerificationStatus('failed');
      return;
    }

    try {
      const response = await fetch('/ai-api/face-recognition/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: frame,
          candidates: candidates
        })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.detail || 'Verification error');
      }

      setConfidence(result.confidence * 100);
      
      if (result.verified) {
        setVerificationStatus('success');
        toast.success('Identity Verified Successfully!');
        // Redirect to session room after a delay
        setTimeout(() => {
          if (id) {
            navigate(`/session/${id}/monitor`);
          } else {
            navigate('/');
          }
        }, 2000);
      } else {
        setVerificationStatus('failed');
      }
    } catch (err) {
      console.error(err);
      setVerificationStatus('failed');
    }
  }, [isActive, candidates, captureFrameBase64, navigate, id]);

  // Run automatically when camera starts
  useEffect(() => {
    if (isActive && candidates.length > 0 && verificationStatus === 'idle') {
      // Trigger verify after a short delay to allow camera exposure to adjust
      const timer = setTimeout(() => {
         runVerification();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isActive, candidates, verificationStatus, runVerification]);

  return (
    <div className="max-w-md mx-auto space-y-6">
      <PageHeader title="Identity Verification" subtitle="Verify your identity using face recognition" breadcrumb={['TrueView AI', 'Verify']} />

      <div className="glass p-6 rounded-2xl flex flex-col items-center">
        {/* Camera Container */}
        {verificationStatus !== 'no_profile' && (
          <div className="w-[280px] h-[280px] rounded-2xl overflow-hidden bg-black relative border border-white/[0.1] mb-6">
            {camError ? (
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-danger-400">
                <AlertTriangle size={36} className="mb-2 block mx-auto" />
                <p className="text-xs">{camError}</p>
              </div>
            ) : (
              <>
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                {verificationStatus === 'loading' && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center">
                     <div className="text-center">
                       <Scan className="animate-pulse text-primary-400 mx-auto mb-2" size={32} />
                       <span className="text-xs font-mono text-gray-300">Verifying Face...</span>
                     </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Verification Status Card */}
        {verificationStatus === 'no_profile' && (
          <div className="text-center py-6">
            <AlertTriangle size={48} className="text-warning-400 mx-auto mb-3" />
            <h3 className="text-base font-bold text-gray-200">No Face Profile Found</h3>
            <p className="text-xs text-gray-500 mt-2 mb-6">You must enroll your face before you can run identity verification.</p>
            <button onClick={() => navigate('/face-registration')} className="btn-primary py-2 px-6">
              Register Face
            </button>
          </div>
        )}

        {verificationStatus === 'success' && (
          <div className="w-full text-center space-y-4 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-success-500/10 border border-success-500/20 text-success-400 flex items-center justify-center mx-auto">
              <ShieldCheck size={32} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-200">Identity Verified</h3>
              <p className="text-xs text-gray-500 mt-1">Welcome back, {userProfile?.name}!</p>
            </div>
            <div className="bg-success-500/5 border border-success-500/10 p-3 rounded-xl flex justify-between items-center">
               <span className="text-xs text-gray-400">Match Confidence</span>
               <span className="text-sm font-bold text-success-400">{confidence.toFixed(1)}%</span>
            </div>
          </div>
        )}

        {verificationStatus === 'failed' && (
          <div className="w-full text-center space-y-4 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-danger-500/10 border border-danger-500/20 text-danger-400 flex items-center justify-center mx-auto">
              <XCircle size={32} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-200">Verification Failed</h3>
              <p className="text-xs text-gray-500 mt-1">No matches found or face not clearly visible.</p>
            </div>
            <div className="bg-danger-500/5 border border-danger-500/10 p-3 rounded-xl flex justify-between items-center mb-2">
               <span className="text-xs text-gray-400">Match Score</span>
               <span className="text-sm font-bold text-danger-400">{confidence.toFixed(1)}%</span>
            </div>
            <button onClick={runVerification} className="btn-primary w-full py-2 flex items-center justify-center gap-2">
              <RefreshCw size={14} /> Retry Verification
            </button>
          </div>
        )}

        {verificationStatus === 'idle' && candidates.length > 0 && (
          <div className="text-center text-xs text-gray-500">
             Starting camera verification...
          </div>
        )}
      </div>
    </div>
  );
}
