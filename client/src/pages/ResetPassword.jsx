import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/Loading/LoadingSpinner';
import toast from 'react-hot-toast';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { resetPassword } = useAuth();
  const navigate = useNavigate();

  if (!token) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-100 mb-2">Invalid Link</h2>
        <p className="text-sm text-gray-500 mb-6">This password reset link is invalid or has expired.</p>
        <Link to="/forgot-password" className="btn-primary w-full flex justify-center">Request New Link</Link>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) return toast.error('Passwords do not match');
    if (password.length < 6) return toast.error('Password must be at least 6 characters');

    setIsSubmitting(true);
    try {
      await resetPassword(token, password);
      navigate('/login');
    } catch (error) {
      // Toast handled in context
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-100 mb-1">Reset password</h2>
      <p className="text-sm text-gray-500 mb-6">Enter your new password below</p>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs text-gray-400 block mb-1.5">New Password</label>
          <div className="relative">
            <input 
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••" 
              className="input-glass text-sm pr-10" 
              disabled={isSubmitting}
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        
        <div>
          <label className="text-xs text-gray-400 block mb-1.5">Confirm New Password</label>
          <input 
            type={showPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            placeholder="••••••••" 
            className="input-glass text-sm" 
            disabled={isSubmitting}
          />
        </div>
        
        <button 
          type="submit" 
          disabled={isSubmitting || !password || !confirmPassword}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isSubmitting ? <LoadingSpinner size="sm" /> : <><Lock size={16} /> Update Password</>}
        </button>
      </form>
    </div>
  );
}
