export const mockDashboardStats = {
  activeSessions: 0,
  usersOnline: 1,
  todaysAlerts: 0,
  totalViolations: 0,
  systemHealth: 100,
};

export const mockActivityTimeline = [];

export const mockUsers = [];

export const mockSessions = [];

export const mockReports = [];

export const mockAlerts = [];

export const chartDataWeeklyActivity = [
  { name: 'Mon', sessions: 0, violations: 0 },
  { name: 'Tue', sessions: 0, violations: 0 },
  { name: 'Wed', sessions: 0, violations: 0 },
  { name: 'Thu', sessions: 0, violations: 0 },
  { name: 'Fri', sessions: 0, violations: 0 },
  { name: 'Sat', sessions: 0, violations: 0 },
  { name: 'Sun', sessions: 0, violations: 0 },
];

export const chartDataRiskDistribution = [
  { name: 'Low (0-30)', value: 100, color: '#10b981' },
  { name: 'Medium (31-60)', value: 0, color: '#f59e0b' },
  { name: 'High (61-100)', value: 0, color: '#ef4444' },
];

export const chartDataDetectionFrequency = [
  { subject: 'Gaze', A: 0, fullMark: 100 },
  { subject: 'Face', A: 0, fullMark: 100 },
  { subject: 'Voice', A: 0, fullMark: 100 },
  { subject: 'Object', A: 0, fullMark: 100 },
  { subject: 'Posture', A: 0, fullMark: 100 },
];
