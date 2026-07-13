import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/Loading/LoadingSpinner';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (error) {
      // Error handled by AuthContext toast
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-100 mb-1">Welcome back</h2>
      <p className="text-sm text-gray-500 mb-6">Sign in to your TrueView AI account</p>
      
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
        
        <div>
          <label className="text-xs text-gray-400 block mb-1.5">Password</label>
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
            <button 
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" className="accent-primary-500" disabled={isSubmitting} /> Remember me
          </label>
          <Link to="/forgot-password" className="text-xs text-primary-400 hover:text-primary-300 transition-colors">
            Forgot password?
          </Link>
        </div>
        
        <button 
          type="submit" 
          disabled={isSubmitting || !email || !password}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? <LoadingSpinner size="sm" /> : <><LogIn size={16} /> Sign In</>}
        </button>
      </form>
      
      <p className="text-center text-xs text-gray-500 mt-5">
        Don't have an account?{' '}
        <Link to="/register" className="text-primary-400 hover:text-primary-300 transition-colors">Create one</Link>
      </p>
    </div>
  );
}
