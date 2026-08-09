import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

const defaultAuthContext = {
  user: null,
  isAuthenticated: false,
  pendingToken: null,
  pendingVoiceToken: null,
  loading: true,
  login: async () => {},
  verifyCredentials: async () => {},
  faceLogin: async () => {},
  voiceLogin: async () => {},
  register: async () => {},
  completeFaceRegistration: async () => {},
  completeVoiceRegistration: async () => {},
  logout: () => {},
  forgotPassword: async () => {},
  resetPassword: async () => {},
  updateProfile: async () => {}
};

const AuthContext = createContext(defaultAuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pendingToken, setPendingToken] = useState(localStorage.getItem('trueview_pending_token') || null);
  const [pendingVoiceToken, setPendingVoiceToken] = useState(localStorage.getItem('trueview_pending_voice_token') || null);
  const [loading, setLoading] = useState(true);

  // Initialize auth state from local storage on load
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('trueview_token');
      if (storedToken) {
        try {
          // Verify token by fetching user profile
          const res = await api.get('/users/profile');
          if (res.data.registrationStatus === 'PENDING_FACE_REGISTRATION' || res.data.registrationStatus === 'PENDING_VOICE_REGISTRATION') {
            logout();
          } else {
            setUser(res.data);
            setIsAuthenticated(true);
          }
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
    return verifyCredentials(email, password);
  };

  const verifyCredentials = async (email, password) => {
    try {
      const res = await api.post('/auth/verify-credentials', { email, password });
      if (res.data.isPendingRegistration) {
        if (res.data.pendingVoiceToken) {
          localStorage.setItem('trueview_pending_voice_token', res.data.pendingVoiceToken);
          setPendingVoiceToken(res.data.pendingVoiceToken);
        }
        if (res.data.pendingToken) {
          localStorage.setItem('trueview_pending_token', res.data.pendingToken);
          setPendingToken(res.data.pendingToken);
        }
      }
      return res.data;
    } catch (error) {
      const msg = error.response?.data?.message || 'Verification failed';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const faceLogin = async (payload) => {
    try {
      // Support object payload containing email, tempLoginToken, frames, image, challengeType, challengeId
      const requestData = typeof payload === 'object' ? payload : { image: payload };
      const res = await api.post('/auth/face-login', requestData);
      if (res.data && res.data.token) {
        const { token, ...userData } = res.data;
        localStorage.removeItem('trueview_pending_token');
        localStorage.removeItem('trueview_pending_voice_token');
        setPendingToken(null);
        setPendingVoiceToken(null);
        localStorage.setItem('trueview_token', token);
        setUser(userData);
        setIsAuthenticated(true);
        toast.success('✓ Face Verified - Login Successful!');
      } else {
        toast.success('Face Verified successfully!');
      }
      return res.data;
    } catch (error) {
      const msg = error.response?.data?.message || 'Face authentication failed';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const voiceLogin = async ({ email, tempVoiceToken, audio }) => {
    try {
      const res = await api.post('/auth/voice-login', { email, tempVoiceToken, audio });
      const { token, ...userData } = res.data;
      
      localStorage.removeItem('trueview_pending_token');
      localStorage.removeItem('trueview_pending_voice_token');
      setPendingToken(null);
      setPendingVoiceToken(null);
      localStorage.setItem('trueview_token', token);
      setUser(userData);
      setIsAuthenticated(true);
      toast.success('✓ Voice Verified - Authentication Complete!');
      return res.data;
    } catch (error) {
      const msg = error.response?.data?.message || 'Voice verification failed';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const register = async (userData) => {
    try {
      const res = await api.post('/auth/register', userData);
      if (res.data.pendingToken) {
        localStorage.setItem('trueview_pending_token', res.data.pendingToken);
        setPendingToken(res.data.pendingToken);
      }
      toast.success('Details submitted! Mandatory face registration required.');
      return res.data;
    } catch (error) {
      const msg = error.response?.data?.message || 'Registration failed';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const completeFaceRegistration = async (embeddings) => {
    try {
      const pToken = pendingToken || localStorage.getItem('trueview_pending_token');
      const headers = pToken ? { Authorization: `Bearer ${pToken}` } : {};
      
      const res = await api.post('/auth/register-face', { embeddings }, { headers });
      if (res.data.pendingVoiceToken) {
        localStorage.setItem('trueview_pending_voice_token', res.data.pendingVoiceToken);
        setPendingVoiceToken(res.data.pendingVoiceToken);
      }
      toast.success('Face profile saved! Please complete mandatory voice registration.');
      return res.data;
    } catch (error) {
      const msg = error.response?.data?.message || 'Failed to register face profile.';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const completeVoiceRegistration = async (audioData) => {
    try {
      const pVoiceToken = pendingVoiceToken || localStorage.getItem('trueview_pending_voice_token') || pendingToken || localStorage.getItem('trueview_pending_token');
      const headers = pVoiceToken ? { Authorization: `Bearer ${pVoiceToken}` } : {};
      
      const res = await api.post('/auth/register-voice', { audio: audioData }, { headers });
      const { token, ...userData } = res.data;
      
      localStorage.removeItem('trueview_pending_token');
      localStorage.removeItem('trueview_pending_voice_token');
      setPendingToken(null);
      setPendingVoiceToken(null);
      localStorage.setItem('trueview_token', token);
      setUser(userData);
      setIsAuthenticated(true);
      toast.success('Voice profile saved & account fully activated!');
      return res.data;
    } catch (error) {
      const msg = error.response?.data?.message || 'Failed to register voice profile.';
      toast.error(msg);
      throw new Error(msg);
    }
  };

  const logout = () => {
    localStorage.removeItem('trueview_token');
    localStorage.removeItem('trueview_pending_token');
    localStorage.removeItem('trueview_pending_voice_token');
    setPendingToken(null);
    setPendingVoiceToken(null);
    setUser(null);
    setIsAuthenticated(false);
  };

  const forgotPassword = async (email) => {
    try {
      const res = await api.post('/auth/forgot-password', { email });
      toast.success(res.data.message || 'Reset link sent');
      return res.data;
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
      pendingToken,
      pendingVoiceToken,
      loading, 
      login, 
      verifyCredentials,
      faceLogin,
      voiceLogin,
      register, 
      completeFaceRegistration,
      completeVoiceRegistration,
      logout, 
      forgotPassword, 
      resetPassword,
      updateProfile 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  return context || defaultAuthContext;
}

export default AuthContext;
