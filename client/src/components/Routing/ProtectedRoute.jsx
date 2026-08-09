import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../Loading/LoadingSpinner';

export default function ProtectedRoute() {
  const { isAuthenticated, pendingVoiceToken, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-950">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated && (pendingVoiceToken || localStorage.getItem('trueview_pending_voice_token'))) {
    return <Navigate to="/register-voice" replace />;
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}
