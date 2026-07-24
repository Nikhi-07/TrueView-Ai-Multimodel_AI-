import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, Eye, EyeOff, ScanFace, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/Loading/LoadingSpinner';
import useCamera from '../hooks/useCamera';
import toast from 'react-hot-toast';

export default function Login() {
  const [step, setStep] = useState('credentials'); // 'credentials' or 'face'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { verifyCredentials, faceLogin } = useAuth();
  const navigate = useNavigate();
  
  const { videoRef, isActive, startCamera, stopCamera, captureFrameBase64 } = useCamera();

  useEffect(() => {
    if (step === 'face') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [step, startCamera, stopCamera]);

  const handleCredentialSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setIsSubmitting(true);
    try {
      const res = await verifyCredentials(email, password);
      if (res.requiresFaceScan) {
        setStep('face');
      }
    } catch (error) {
      // Error handled in context
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFaceSubmit = async (e) => {
    e.preventDefault();
    if (!isActive) {
      toast.error("Camera not active");
      return;
    }
    const image = captureFrameBase64();
    if (!image) {
      toast.error("Failed to capture face");
      return;
    }
    
    setIsSubmitting(true);
    try {
      await faceLogin(email, image);
      navigate('/');
    } catch (error) {
      // Handled in context, reset to credentials so user can try again
      setStep('credentials');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-extrabold text-black mb-1">
        {step === 'credentials' ? 'Welcome back' : 'Two-Factor Authentication'}
      </h2>
      <p className="text-xs font-semibold text-black mb-6">
        {step === 'credentials' 
          ? 'Sign in to your TrueView AI account'
          : 'Please verify your identity with a face scan'}
      </p>

      {step === 'credentials' ? (
        <form onSubmit={handleCredentialSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-black block mb-1.5">Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="tarun@gmail.com" 
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
          
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs font-semibold text-black cursor-pointer">
              <input type="checkbox" className="accent-black" disabled={isSubmitting} /> Remember me
            </label>
            <Link to="/forgot-password" className="text-xs font-bold text-black hover:underline transition-colors">
              Forgot password?
            </Link>
          </div>
          
          <button 
            type="submit" 
            disabled={isSubmitting || !email || !password}
            className="w-full py-2.5 bg-black hover:bg-gray-800 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-md mt-2"
          >
            {isSubmitting ? <LoadingSpinner size="sm" /> : <><LogIn size={16} /> Continue</>}
          </button>
        </form>
      ) : (
        <form onSubmit={handleFaceSubmit} className="space-y-4">
          <div className="flex flex-col items-center justify-center p-4 border border-gray-200 rounded-xl bg-gray-50">
             <div className="w-[200px] h-[200px] bg-black rounded-lg overflow-hidden relative mb-3 border border-gray-300 shadow-inner">
               <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
               <div className="absolute inset-0 pointer-events-none border-2 border-black/10 rounded-lg"></div>
             </div>
             <p className="text-xs text-gray-500 font-medium text-center">
               Position your face clearly in the frame
             </p>
          </div>
          
          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full py-2.5 bg-black hover:bg-gray-800 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-md"
          >
            {isSubmitting ? <LoadingSpinner size="sm" /> : <><ScanFace size={16} /> Authenticate Face</>}
          </button>

          <button 
            type="button" 
            onClick={() => setStep('credentials')}
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
