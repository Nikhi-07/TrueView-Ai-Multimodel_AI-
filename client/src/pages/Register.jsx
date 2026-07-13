import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/Loading/LoadingSpinner';
import toast from 'react-hot-toast';

export default function Register() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      return toast.error('Passwords do not match');
    }
    if (formData.password.length < 6) {
      return toast.error('Password must be at least 6 characters');
    }

    setIsSubmitting(true);
    try {
      await register({
        fullName: `${formData.firstName} ${formData.lastName}`.trim(),
        email: formData.email,
        password: formData.password,
        phone: formData.phone,
      });
      navigate('/');
    } catch (error) {
      // Error handled by context
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-100 mb-1">Create account</h2>
      <p className="text-sm text-gray-500 mb-6">Get started with TrueView AI</p>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">First Name</label>
            <input 
              name="firstName" value={formData.firstName} onChange={handleChange}
              type="text" required placeholder="John" className="input-glass text-sm" disabled={isSubmitting}
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Last Name</label>
            <input 
              name="lastName" value={formData.lastName} onChange={handleChange}
              type="text" required placeholder="Doe" className="input-glass text-sm" disabled={isSubmitting}
            />
          </div>
        </div>
        
        <div>
          <label className="text-xs text-gray-400 block mb-1.5">Email</label>
          <input 
            name="email" value={formData.email} onChange={handleChange}
            type="email" required placeholder="john@example.com" className="input-glass text-sm" disabled={isSubmitting}
          />
        </div>

        <div>
          <label className="text-xs text-gray-400 block mb-1.5">Phone (Optional)</label>
          <input 
            name="phone" value={formData.phone} onChange={handleChange}
            type="tel" placeholder="+1 234 567 890" className="input-glass text-sm" disabled={isSubmitting}
          />
        </div>
        
        <div>
          <label className="text-xs text-gray-400 block mb-1.5">Password</label>
          <div className="relative">
            <input 
              name="password" value={formData.password} onChange={handleChange}
              type={showPassword ? "text" : "password"} required placeholder="••••••••" className="input-glass text-sm pr-10" disabled={isSubmitting}
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        
        <div>
          <label className="text-xs text-gray-400 block mb-1.5">Confirm Password</label>
          <input 
            name="confirmPassword" value={formData.confirmPassword} onChange={handleChange}
            type={showPassword ? "text" : "password"} required placeholder="••••••••" className="input-glass text-sm" disabled={isSubmitting}
          />
        </div>
        
        <label className="flex items-start gap-2 text-xs text-gray-500 cursor-pointer">
          <input type="checkbox" required className="accent-primary-500 mt-0.5" disabled={isSubmitting} />
          <span>I agree to the <span className="text-primary-400">Terms of Service</span> and <span className="text-primary-400">Privacy Policy</span></span>
        </label>
        
        <button type="submit" disabled={isSubmitting} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
          {isSubmitting ? <LoadingSpinner size="sm" /> : <><UserPlus size={16} /> Create Account</>}
        </button>
      </form>
      
      <p className="text-center text-xs text-gray-500 mt-5">
        Already have an account?{' '}
        <Link to="/login" className="text-primary-400 hover:text-primary-300 transition-colors">Sign in</Link>
      </p>
    </div>
  );
}
