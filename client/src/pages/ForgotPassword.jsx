import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/Loading/LoadingSpinner';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [devToken, setDevToken] = useState(null); // For development testing only

  const { forgotPassword } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;

    setIsSubmitting(true);
    try {
      const res = await forgotPassword(email);
      setIsSent(true);
      // DEVELOPMENT ONLY: without a real email provider the reset token is
      // surfaced so the flow can be tested locally. It is never shown in
      // production builds (import.meta.env.DEV is false there).
      if (res.resetToken && import.meta.env.DEV) setDevToken(res.resetToken);
    } catch (error) {
      // Error handled by toast
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSent) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-success-500/10 flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={32} className="text-success-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-100 mb-2">Check your email</h2>
        <p className="text-sm text-gray-500 mb-6">
          We've sent a password reset link to <br/>
          <span className="font-medium text-gray-300">{email}</span>
        </p>
        
        {/* DEVELOPMENT ONLY helper (never rendered in production builds) */}
        {devToken && import.meta.env.DEV && (
           <div className="mb-6 p-3 rounded-lg bg-surface-800 border border-warning-500/30 text-left">
             <p className="text-[10px] text-warning-400 font-bold mb-1 uppercase tracking-wider">Development Helper</p>
             <p className="text-xs text-gray-400 mb-2">Since we don't have real email configured, use this link to test reset:</p>
             <Link to={`/reset-password?token=${devToken}`} className="text-xs text-primary-400 break-all hover:underline">
               http://localhost:5173/reset-password?token={devToken}
             </Link>
           </div>
        )}

        <Link to="/login" className="btn-primary w-full flex items-center justify-center">
          Return to Login
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-100 mb-1">Forgot password?</h2>
      <p className="text-sm text-gray-500 mb-6">Enter your email and we'll send you a reset link</p>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs text-gray-400 block mb-1.5">Email</label>
          <input 
            type="email" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="admin@trueview.ai" 
            className="input-glass text-sm" 
            disabled={isSubmitting}
          />
        </div>
        <button 
          type="submit" 
          disabled={isSubmitting || !email}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isSubmitting ? <LoadingSpinner size="sm" /> : <><Mail size={16} /> Send Reset Link</>}
        </button>
      </form>
      
      <Link to="/login" className="flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 mt-5 transition-colors">
        <ArrowLeft size={12} /> Back to Sign In
      </Link>
    </div>
  );
}
