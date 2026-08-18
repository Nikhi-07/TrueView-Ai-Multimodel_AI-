import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for API calls
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('trueview_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Optionally handle 401s globally (e.g. log out the user)
    if (error.response && error.response.status === 401) {
       localStorage.removeItem('trueview_token');
       localStorage.removeItem('trueview_user');
       // Don't redirect directly here if it breaks react-router state, 
       // but we could emit an event. The AuthContext will handle state.
    }
    return Promise.reject(error);
  }
);

export default api;
