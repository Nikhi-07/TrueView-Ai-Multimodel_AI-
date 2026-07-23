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
      <h2 className="text-xl font-extrabold text-black mb-1">Welcome back</h2>
      <p className="text-xs font-semibold text-black mb-6">Sign in to your TrueView AI account</p>
      
      <form onSubmit={handleSubmit} className="space-y-4">
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
          className="w-full py-2.5 bg-black hover:bg-gray-800 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-md"
        >
          {isSubmitting ? <LoadingSpinner size="sm" /> : <><LogIn size={16} /> Sign In</>}
        </button>
      </form>
      
      <p className="text-center text-xs font-semibold text-black mt-5">
        Don't have an account?{' '}
        <Link to="/register" className="font-extrabold text-black underline hover:text-gray-700 transition-colors">Create one</Link>
      </p>
    </div>
  );
}
