import { useState } from 'react';
import { Mail, Shield, Edit2, LogOut } from 'lucide-react';
import PageHeader from '../components/Cards/PageHeader';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/Loading/LoadingSpinner';

export default function Profile() {
  const { user, updateProfile, logout } = useAuth();
  
  const [formData, setFormData] = useState({
    fullName: user?.fullName || '',
    phone: user?.phone || '',
    currentPassword: '',
    password: '',
    confirmPassword: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await updateProfile({ fullName: formData.fullName, phone: formData.phone });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    if (!formData.currentPassword || !formData.password || formData.password !== formData.confirmPassword) return;
    
    setIsSubmitting(true);
    try {
      await updateProfile({ 
        currentPassword: formData.currentPassword, 
        password: formData.password 
      });
      setFormData(prev => ({ ...prev, currentPassword: '', password: '', confirmPassword: '' }));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div>
      <PageHeader title="Profile" subtitle="Your account details" breadcrumb={['TrueView AI', 'Profile']} />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="glass p-6 text-center">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-primary-400 to-accent-500 flex items-center justify-center text-white text-2xl font-bold mb-4 shadow-glow-blue">
            {user.profilePicture ? (
              <img src={user.profilePicture} alt={user.fullName} className="w-full h-full rounded-2xl object-cover" />
            ) : (
              user.fullName.charAt(0).toUpperCase()
            )}
          </div>
          <h2 className="text-lg font-bold text-gray-100">{user.fullName}</h2>
          <p className="text-sm text-gray-500 mt-1">{user.email}</p>
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <Shield size={12} className={user.role === 'admin' ? 'text-danger-400' : 'text-primary-400'} />
            <span className={`text-xs font-medium uppercase tracking-wider ${user.role === 'admin' ? 'text-danger-400' : 'text-primary-400'}`}>
              {user.role}
            </span>
          </div>
          <div className="mt-4 text-xs text-gray-500">
            Status: <span className={user.status === 'Active' ? 'text-success-400' : 'text-danger-400'}>{user.status}</span>
          </div>
          <button onClick={logout} className="btn-danger w-full mt-6 flex items-center justify-center gap-2 text-sm">
            <LogOut size={14} /> Sign Out
          </button>
        </div>
        
        {/* Details & Password */}
        <div className="lg:col-span-2 space-y-4">
          {/* Update Info Form */}
          <div className="glass p-5">
            <h3 className="text-sm font-semibold text-gray-200 mb-4">Personal Information</h3>
            <form onSubmit={handleProfileUpdate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-500 block mb-1">Full Name</label>
                <input name="fullName" value={formData.fullName} onChange={handleChange} type="text" required className="input-glass text-sm" disabled={isSubmitting} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Email (Cannot be changed)</label>
                <input type="email" value={user.email} disabled className="input-glass text-sm opacity-60 cursor-not-allowed" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Phone</label>
                <input name="phone" value={formData.phone} onChange={handleChange} type="text" className="input-glass text-sm" disabled={isSubmitting} />
              </div>
              <div className="sm:col-span-2 mt-2">
                <button type="submit" disabled={isSubmitting} className="btn-primary text-sm">
                  {isSubmitting ? <LoadingSpinner size="sm" className="inline-block" /> : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
          
          {/* Change Password Form */}
          <div className="glass p-5">
            <h3 className="text-sm font-semibold text-gray-200 mb-4">Change Password</h3>
            <form onSubmit={handlePasswordUpdate} className="space-y-3 max-w-md">
              <input name="currentPassword" value={formData.currentPassword} onChange={handleChange} type="password" placeholder="Current Password" required className="input-glass text-sm" disabled={isSubmitting} />
              <input name="password" value={formData.password} onChange={handleChange} type="password" placeholder="New Password" required minLength="6" className="input-glass text-sm" disabled={isSubmitting} />
              <input name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} type="password" placeholder="Confirm Password" required minLength="6" className="input-glass text-sm" disabled={isSubmitting} />
              <button type="submit" disabled={isSubmitting || !formData.password || formData.password !== formData.confirmPassword} className="btn-primary text-sm mt-2 disabled:opacity-50">
                {isSubmitting ? <LoadingSpinner size="sm" className="inline-block" /> : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
