import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import AuthLayout from '../layouts/AuthLayout';
import ProtectedRoute from '../components/Routing/ProtectedRoute';
import AdminRoute from '../components/Routing/AdminRoute';
import { useAuth } from '../context/AuthContext';

// Pages
import Dashboard from '../pages/Dashboard';
import LiveMonitoring from '../pages/LiveMonitoring';
import Sessions from '../pages/Sessions';
import Reports from '../pages/Reports';
import Alerts from '../pages/Alerts';
import Analytics from '../pages/Analytics';
import UsersPage from '../pages/UsersPage';
import Settings from '../pages/Settings';
import Profile from '../pages/Profile';
import Help from '../pages/Help';
import Login from '../pages/Login';
import Register from '../pages/Register';
import ForgotPassword from '../pages/ForgotPassword';
import ResetPassword from '../pages/ResetPassword';
import FaceRegistration from '../pages/FaceRegistration';
import LiveVerification from '../pages/LiveVerification';
import FaceMeshViewer from '../pages/FaceMeshViewer';
import EyeGazeViewer from '../pages/EyeGazeViewer';
import HeadPoseViewer from '../pages/HeadPoseViewer';
import VoiceActivityViewer from '../pages/VoiceActivityViewer';
import ObjectDetectionViewer from '../pages/ObjectDetectionViewer';
import BehaviourAnalysisViewer from '../pages/BehaviourAnalysisViewer';
import DecisionEngineViewer from '../pages/DecisionEngineViewer';
import RoomManager from '../pages/RoomManager';

export default function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Auth Routes */}
        <Route element={<AuthLayout />}>
          {/* Redirect to dashboard if already logged in */}
          <Route path="/login" element={isAuthenticated ? <Navigate to="/" /> : <Login />} />
          <Route path="/register" element={isAuthenticated ? <Navigate to="/" /> : <Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Route>

        {/* Protected Dashboard Routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/rooms" element={<RoomManager />} />
            <Route path="/monitoring" element={<LiveMonitoring />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/analytics" element={<Analytics />} />
            
            {/* Admin Only Route */}
            <Route element={<AdminRoute />}>
              <Route path="/users" element={<UsersPage />} />
            </Route>
            
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/help" element={<Help />} />
            <Route path="/face-registration" element={<FaceRegistration />} />
            <Route path="/verify-identity" element={<LiveVerification />} />
            <Route path="/face-mesh" element={<FaceMeshViewer />} />
            <Route path="/eye-gaze" element={<EyeGazeViewer />} />
            <Route path="/head-pose" element={<HeadPoseViewer />} />
            <Route path="/voice-activity" element={<VoiceActivityViewer />} />
            <Route path="/object-detection" element={<ObjectDetectionViewer />} />
            <Route path="/behaviour-analysis" element={<BehaviourAnalysisViewer />} />
            <Route path="/decision-engine" element={<DecisionEngineViewer />} />
          </Route>
        </Route>
        
        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
