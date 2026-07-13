export const APP_NAME = 'TrueView AI';
export const APP_TAGLINE = 'Smart Proctoring System';

export const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: 'LayoutDashboard' },
  { path: '/monitoring', label: 'Live Monitoring', icon: 'Eye' },
  { path: '/sessions', label: 'Sessions', icon: 'Users' },
  { path: '/reports', label: 'Reports', icon: 'FileText' },
  { path: '/alerts', label: 'Alerts', icon: 'Bell' },
  { path: '/analytics', label: 'Analytics', icon: 'BarChart3' },
  { path: '/users', label: 'Users', icon: 'UserCog' },
  { path: '/settings', label: 'Settings', icon: 'Settings' },
];

export const RISK_LEVELS = {
  LOW: { label: 'Low', color: 'success' },
  MEDIUM: { label: 'Medium', color: 'warning' },
  HIGH: { label: 'High', color: 'danger' },
  CRITICAL: { label: 'Critical', color: 'danger' },
};

export const SESSION_STATUS = {
  ACTIVE: { label: 'Active', color: 'success' },
  COMPLETED: { label: 'Completed', color: 'primary' },
  FLAGGED: { label: 'Flagged', color: 'warning' },
  TERMINATED: { label: 'Terminated', color: 'danger' },
};

export const ALERT_TYPES = {
  FACE_NOT_DETECTED: 'Face Not Detected',
  MULTIPLE_FACES: 'Multiple Faces',
  GAZE_AWAY: 'Gaze Away',
  MOBILE_DETECTED: 'Mobile Detected',
  VOICE_DETECTED: 'Voice Detected',
  TAB_SWITCH: 'Tab Switch',
  HEAD_POSE_ABNORMAL: 'Head Pose Abnormal',
  LIVENESS_FAILED: 'Liveness Failed',
};
