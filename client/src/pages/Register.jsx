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
      <h2 className="text-xl font-extrabold text-black mb-1">Create account</h2>
      <p className="text-xs font-semibold text-black mb-6">Get started with TrueView AI</p>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-black block mb-1.5">First Name</label>
            <input 
              name="firstName" value={formData.firstName} onChange={handleChange}
              type="text" required placeholder="John" className="w-full px-3.5 py-2 py-2 bg-white border border-gray-300 rounded-lg text-black font-semibold placeholder-gray-400 focus:outline-none focus:border-black focus:ring-1 focus:ring-black text-sm" disabled={isSubmitting}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-black block mb-1.5">Last Name</label>
            <input 
              name="lastName" value={formData.lastName} onChange={handleChange}
              type="text" required placeholder="Doe" className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-lg text-black font-semibold placeholder-gray-400 focus:outline-none focus:border-black focus:ring-1 focus:ring-black text-sm" disabled={isSubmitting}
            />
          </div>
        </div>
        
        <div>
          <label className="text-xs font-bold text-black block mb-1.5">Email Address</label>
          <input 
            name="email" value={formData.email} onChange={handleChange}
            type="email" required placeholder="john@example.com" className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-lg text-black font-semibold placeholder-gray-400 focus:outline-none focus:border-black focus:ring-1 focus:ring-black text-sm" disabled={isSubmitting}
          />
        </div>

        <div>
          <label className="text-xs font-bold text-black block mb-1.5">Phone (Optional)</label>
          <input 
            name="phone" value={formData.phone} onChange={handleChange}
            type="tel" placeholder="+1 234 567 890" className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-lg text-black font-semibold placeholder-gray-400 focus:outline-none focus:border-black focus:ring-1 focus:ring-black text-sm" disabled={isSubmitting}
          />
        </div>
        
        <div>
          <label className="text-xs font-bold text-black block mb-1.5">Password</label>
          <div className="relative">
            <input 
              name="password" value={formData.password} onChange={handleChange}
              type={showPassword ? "text" : "password"} required placeholder="••••••••" className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-lg text-black font-semibold placeholder-gray-400 focus:outline-none focus:border-black focus:ring-1 focus:ring-black text-sm pr-10" disabled={isSubmitting}
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-black hover:text-gray-700">
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        
        <div>
          <label className="text-xs font-bold text-black block mb-1.5">Confirm Password</label>
          <input 
            name="confirmPassword" value={formData.confirmPassword} onChange={handleChange}
            type={showPassword ? "text" : "password"} required placeholder="••••••••" className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-lg text-black font-semibold placeholder-gray-400 focus:outline-none focus:border-black focus:ring-1 focus:ring-black text-sm" disabled={isSubmitting}
          />
        </div>
        
        <label className="flex items-start gap-2 text-xs font-semibold text-black cursor-pointer">
          <input type="checkbox" required className="accent-black mt-0.5" disabled={isSubmitting} />
          <span>I agree to the <span className="font-extrabold underline">Terms of Service</span> and <span className="font-extrabold underline">Privacy Policy</span></span>
        </label>
        
        <button type="submit" disabled={isSubmitting} className="w-full py-2.5 bg-black hover:bg-gray-800 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm shadow-md">
          {isSubmitting ? <LoadingSpinner size="sm" /> : <><UserPlus size={16} /> Create Account</>}
        </button>
      </form>
      
      <p className="text-center text-xs font-semibold text-black mt-5">
        Already have an account?{' '}
        <Link to="/login" className="font-extrabold text-black underline hover:text-gray-700 transition-colors">Sign in</Link>
      </p>
    </div>
  );
}
