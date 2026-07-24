import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // Initialize auth state from local storage on load
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('trueview_token');
      if (storedToken) {
        try {
          // Verify token by fetching user profile
          const res = await api.get('/users/profile');
          setUser(res.data);
          setIsAuthenticated(true);
        } catch (error) {
          console.error('Auth initialization failed', error);
          logout(); // Clear invalid token
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email, password) => {
    try {
      const res = await api.post('/auth/login', { email, password });
      const { token, ...userData } = res.data;
      
      localStorage.setItem('trueview_token', token);
      setUser(userData);
      setIsAuthenticated(true);
      toast.success('Logged in successfully');
      return true;
    } catch (error) {
      const msg = error.response?.data?.message || 'Login failed';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const verifyCredentials = async (email, password) => {
    try {
      const res = await api.post('/auth/verify-credentials', { email, password });
      return res.data;
    } catch (error) {
      const msg = error.response?.data?.message || 'Verification failed';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const faceLogin = async (email, image) => {
    try {
      const res = await api.post('/auth/face-login', { email, image });
      const { token, ...userData } = res.data;
      
      localStorage.setItem('trueview_token', token);
      setUser(userData);
      setIsAuthenticated(true);
      toast.success('Face login successful');
      return true;
    } catch (error) {
      const msg = error.response?.data?.message || 'Face login failed';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const register = async (userData) => {
    try {
      const res = await api.post('/auth/register', userData);
      const { token, ...newUserData } = res.data;
      
      localStorage.setItem('trueview_token', token);
      setUser(newUserData);
      setIsAuthenticated(true);
      toast.success('Registration successful');
      return true;
    } catch (error) {
      const msg = error.response?.data?.message || 'Registration failed';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const logout = () => {
    localStorage.removeItem('trueview_token');
    setUser(null);
    setIsAuthenticated(false);
    toast.success('Logged out');
  };

  const forgotPassword = async (email) => {
    try {
      const res = await api.post('/auth/forgot-password', { email });
      toast.success(res.data.message || 'Reset link sent');
      return res.data; // Includes the fake reset token for development testing
    } catch (error) {
      const msg = error.response?.data?.message || 'Failed to send reset link';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const resetPassword = async (token, password) => {
    try {
      const res = await api.post('/auth/reset-password', { token, password });
      toast.success(res.data.message || 'Password reset successful');
      return true;
    } catch (error) {
      const msg = error.response?.data?.message || 'Failed to reset password';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const updateProfile = async (data) => {
    try {
      const res = await api.put('/users/profile', data);
      setUser(res.data);
      toast.success('Profile updated');
      return true;
    } catch (error) {
      const msg = error.response?.data?.message || 'Failed to update profile';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      loading, 
      login, 
      verifyCredentials,
      faceLogin,
      register, 
      logout, 
      forgotPassword, 
      resetPassword,
      updateProfile 
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

export default AuthContext;
