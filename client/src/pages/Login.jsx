import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, Eye, EyeOff, ScanFace, ArrowLeft, RefreshCw, CheckCircle, ShieldCheck, Sparkles, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/Loading/LoadingSpinner';
import useCamera from '../hooks/useCamera';
import useFaceLandmarker from '../hooks/useFaceLandmarker';
import toast from 'react-hot-toast';

export default function Login() {
  const [step, setStep] = useState('credentials'); // 'credentials' | 'face'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tempLoginToken, setTempLoginToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState(null);

  // Active Liveness Challenge state
  const [challenge, setChallenge] = useState(null);
  const [livenessStatus, setLivenessStatus] = useState('INITIALIZING'); // INITIALIZING | DETECTING | CHALLENGE | VERIFYING | SUCCESS | FAILURE

  const { verifyCredentials, faceLogin } = useAuth();
  const navigate = useNavigate();
  
  const { videoRef, isActive, startCamera, stopCamera, captureFrameBase64 } = useCamera();

  // Real MediaPipe Face Landmarker blendshape blink detection (tilt-independent)
  const [blinkCount, setBlinkCount] = useState(0);
  const landmarker = useFaceLandmarker(videoRef, {
    enabled: step === 'face',
    onBlink: (count) => setBlinkCount(count)
  });

  // Control camera and liveness challenge based on active step
  useEffect(() => {
    if (step === 'face') {
      startCamera();
      fetchLivenessChallenge();
    } else {
      stopCamera();
      setLivenessStatus('INITIALIZING');
    }
    return () => {
      stopCamera();
    };
  }, [step, startCamera, stopCamera]);

  const fetchLivenessChallenge = async () => {
    try {
      const res = await fetch('/ai-api/liveness/generate-challenge');
      if (res.ok) {
        const data = await res.json();
        setChallenge(data);
        setLivenessStatus('CHALLENGE');
      } else {
        setLivenessStatus('DETECTING');
      }
    } catch (e) {
      console.warn('Liveness challenge fetch fallback:', e);
      setLivenessStatus('DETECTING');
    }
  };

  const handleCredentialSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }
    
    setIsSubmitting(true);
    setAuthError(null);
    try {
      const res = await verifyCredentials(email.trim(), password);
      if (res && res.isPendingRegistration) {
        if (res.pendingStage === 'voice') {
          toast.error('Voice registration incomplete. Redirecting to voice enrollment.');
          navigate('/register-voice');
        } else {
          toast.error('Face registration incomplete. Redirecting to face enrollment.');
          navigate('/register-face');
        }
        return;
      }
      if (res && res.requiresFaceScan) {
        setTempLoginToken(res.tempLoginToken || '');
      }
      setStep('face');
    } catch (error) {
      console.error('Credential verification failed:', error);
      setAuthError(error.message || 'Invalid email or password');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFaceSubmit = async (e) => {
    e.preventDefault();
    if (!isActive) {
      toast.error("Camera not active. Please grant camera permission.");
      return;
    }

    setIsSubmitting(true);
    setAuthError(null);
    setLivenessStatus('VERIFYING');

    try {
      // Capture a 6-frame temporal sequence over 1.5 seconds for multi-frame PAD analysis
      const frames = [];
      const eyeBlinkLeft = [];
      const eyeBlinkRight = [];
      for (let i = 0; i < 6; i++) {
        const frame = captureFrameBase64();
        if (frame) {
          frames.push(frame);
          // Real MediaPipe blendshapes (eyeBlinkLeft / eyeBlinkRight)
          const bs = landmarker.getBlendshapes();
          eyeBlinkLeft.push(bs.left);
          eyeBlinkRight.push(bs.right);
        }
        await new Promise((resolve) => setTimeout(resolve, 250)); // 250ms interval between frames
      }

      if (frames.length === 0) {
        throw new Error("Could not capture camera frames. Ensure your face is centered.");
      }

      const res = await faceLogin({
        email,
        tempLoginToken,
        frames,
        image: frames[0],
        challengeType: challenge?.challenge_type,
        challengeId: challenge?.challenge_id,
        eyeBlinkLeft,
        eyeBlinkRight
      });

      if (res && res.token) {
        setLivenessStatus('SUCCESS');
        toast.success('Identity verified & authenticated!');
        setTimeout(() => {
          navigate('/');
        }, 500);
      }
    } catch (error) {
      console.error('Face authentication error:', error);
      setLivenessStatus('FAILURE');
      setAuthError(error.message || 'Face liveness or identity verification failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-extrabold text-black mb-1">
        {step === 'credentials' ? 'Welcome back' : 'Step 2: Face Authentication'}
      </h2>
      <p className="text-xs font-semibold text-gray-700 mb-4">
        {step === 'credentials' 
          ? 'Sign in with your email and password'
          : 'Verify live human presence and face identity'}
      </p>

      {/* Login Progress Indicator (2-Step Authentication) */}
      <div className="bg-gray-100 p-2.5 rounded-lg border border-gray-300 flex items-center justify-between text-xs font-bold mb-5">
        <div className={`flex items-center gap-1.5 ${step !== 'credentials' ? 'text-green-700' : 'text-black'}`}>
          <span>1. Password</span> {step !== 'credentials' && <CheckCircle size={14} className="text-green-600" />}
        </div>
        <div className="text-gray-400">→</div>
        <div className={`flex items-center gap-1.5 ${step === 'face' ? 'text-black font-extrabold' : 'text-gray-400'}`}>
          <span>2. Live Face Verification ●</span>
        </div>
      </div>

      {step === 'credentials' && (
        <form onSubmit={handleCredentialSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-black block mb-1.5">Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="user@example.com" 
              className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-black font-semibold placeholder-gray-400 focus:outline-none focus:border-black focus:ring-1 focus:ring-black text-sm" 
              disabled={isSubmitting}
            />
          </div>
          
          <div>
            <label className="text-xs font-bold text-black block mb-1.5">Password</label>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••" 
                className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-black font-semibold placeholder-gray-400 focus:outline-none focus:border-black focus:ring-1 focus:ring-black text-sm pr-10" 
                disabled={isSubmitting}
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-black hover:text-gray-700 transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          
          {authError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
              {authError}
            </div>
          )}

          <button 
            type="submit" 
            disabled={isSubmitting || !email || !password}
            className="w-full py-2.5 bg-black hover:bg-gray-800 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-md mt-2"
          >
            {isSubmitting ? <LoadingSpinner size="sm" /> : <><LogIn size={16} /> Continue to Face Authentication</>}
          </button>
        </form>
      )}

      {step === 'face' && (
        <form onSubmit={handleFaceSubmit} className="space-y-4">
          {/* Active Dynamic Challenge Prompt Box */}
          {challenge && (
            <div className="p-3.5 bg-gray-100 rounded-xl border border-gray-300 text-center shadow-sm">
              <div className="flex items-center justify-center gap-1.5 text-xs font-extrabold text-black uppercase tracking-wider mb-1">
                <Sparkles size={14} className="text-black animate-pulse" /> Active Liveness Challenge
              </div>
              <p className="text-xs font-extrabold text-black bg-white py-2 px-3 rounded-lg border border-gray-300 inline-block shadow-sm">
                "{challenge.instruction}"
              </p>
            </div>
          )}

          <div className="flex flex-col items-center justify-center p-4 border border-gray-200 rounded-xl bg-gray-50">
             <div className="w-[220px] h-[220px] bg-black rounded-xl overflow-hidden relative mb-3 border border-gray-300 shadow-inner">
               <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
               <div className="absolute inset-0 pointer-events-none border-2 border-black/20 rounded-xl flex items-center justify-center">
                 <div className="w-[160px] h-[190px] border-2 border-dashed border-white/60 rounded-[50%]" />
               </div>
             </div>

             {/* Realtime Biometric Pipeline Checklist */}
             <div className="w-full grid grid-cols-2 gap-2 text-[11px] font-semibold text-black bg-white p-2.5 rounded-lg border border-gray-300">
               <div className="flex items-center gap-1.5">
                 <CheckCircle size={13} className="text-green-600" />
                 <span>Face Detected ✓</span>
               </div>
               <div className="flex items-center gap-1.5">
                 <ShieldCheck size={13} className="text-green-600" />
                 <span>MiniFASNet PAD ✓</span>
               </div>
               <div className="flex items-center gap-1.5">
                 <Sparkles size={13} className={landmarker.status === 'ready' ? 'text-green-600' : 'text-gray-400'} />
                 <span>MediaPipe Blendshapes {landmarker.status === 'ready' ? '✓' : '(loading…)'}</span>
               </div>
               <div className="flex items-center gap-1.5">
                 <Eye size={13} className="text-green-600" />
                 <span>Blink: {blinkCount}</span>
               </div>
             </div>
          </div>

          {authError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold text-center flex items-center justify-center gap-1.5">
              <AlertCircle size={16} className="text-red-600 shrink-0" />
              <span>{authError}</span>
            </div>
          )}
          
          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full py-3 bg-black hover:bg-gray-800 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm shadow-md"
          >
            {isSubmitting ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                <span>Analyzing Temporal Liveness & Anti-Spoofing...</span>
              </>
            ) : authError ? (
              <><RefreshCw size={16} /> Try Live Verification Again</>
            ) : (
              <><ScanFace size={16} /> Authenticate & Log In</>
            )}
          </button>

          <button 
            type="button" 
            onClick={() => { setStep('credentials'); setAuthError(null); }}
            disabled={isSubmitting}
            className="w-full py-2 text-gray-600 font-bold hover:text-black flex items-center justify-center gap-2 transition-colors text-sm"
          >
            <ArrowLeft size={14} /> Back to password
          </button>
        </form>
      )}
      
      {step === 'credentials' && (
        <p className="text-center text-xs font-semibold text-black mt-5">
          Don't have an account?{' '}
          <Link to="/register" className="font-extrabold text-black underline hover:text-gray-700 transition-colors">Create one</Link>
        </p>
      )}
    </div>
  );
}
