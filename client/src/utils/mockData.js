export const mockDashboardStats = {
  activeSessions: 24,
  usersOnline: 156,
  todaysAlerts: 42,
  totalViolations: 8,
  systemHealth: 99.9,
};

export const mockActivityTimeline = [
  { id: 1, type: 'alert', message: 'High risk alert in Session SES-042', time: '2 mins ago', severity: 'danger' },
  { id: 2, type: 'session_start', message: 'User Jane Smith started an exam', time: '15 mins ago', severity: 'info' },
  { id: 3, type: 'system', message: 'AI Models updated successfully', time: '1 hour ago', severity: 'success' },
  { id: 4, type: 'alert', message: 'Multiple faces detected in SES-038', time: '2 hours ago', severity: 'warning' },
  { id: 5, type: 'report', message: 'Daily summary report generated', time: '5 hours ago', severity: 'info' },
];

export const mockUsers = [
  { id: 'USR-001', name: 'John Doe', email: 'john.doe@example.com', role: 'Student', status: 'Active', lastLogin: '2026-07-12T08:30:00Z', sessions: 12 },
  { id: 'USR-002', name: 'Jane Smith', email: 'jane.smith@example.com', role: 'Student', status: 'Active', lastLogin: '2026-07-12T09:15:00Z', sessions: 8 },
  { id: 'USR-003', name: 'Mike Johnson', email: 'mike.j@example.com', role: 'Student', status: 'Inactive', lastLogin: '2026-07-10T14:20:00Z', sessions: 15 },
  { id: 'USR-004', name: 'Sarah Wilson', email: 'swilson@example.com', role: 'Proctor', status: 'Active', lastLogin: '2026-07-12T07:00:00Z', sessions: 42 },
  { id: 'USR-005', name: 'Emily Davis', email: 'emily.d@example.com', role: 'Student', status: 'Active', lastLogin: '2026-07-11T16:45:00Z', sessions: 5 },
];

export const mockSessions = [
  { id: 'SES-042', user: 'Jane Smith', duration: '01:15:30', startedAt: '2026-07-12T09:15:00Z', risk: 12, status: 'Active', violations: 1 },
  { id: 'SES-041', user: 'John Doe', duration: '00:45:10', startedAt: '2026-07-12T08:30:00Z', risk: 85, status: 'Flagged', violations: 4 },
  { id: 'SES-040', user: 'Emily Davis', duration: '02:00:05', startedAt: '2026-07-11T16:45:00Z', risk: 5, status: 'Completed', violations: 0 },
  { id: 'SES-039', user: 'Mike Johnson', duration: '01:30:00', startedAt: '2026-07-10T14:20:00Z', risk: 45, status: 'Completed', violations: 2 },
];

export const mockReports = mockSessions.map(s => ({
  reportId: `REP-${s.id.split('-')[1]}`,
  session: s.id,
  user: s.user,
  duration: s.duration,
  violations: s.violations,
  riskScore: s.risk,
  status: s.status === 'Flagged' ? 'Review Needed' : (s.risk > 30 ? 'Warning' : 'Clean'),
  generatedTime: new Date(new Date(s.startedAt).getTime() + 7200000).toISOString(), // Roughly 2 hours later
}));

export const mockAlerts = [
  { id: 'ALT-101', priority: 'High', severity: 'danger', type: 'Multiple Faces', user: 'John Doe', session: 'SES-041', time: '2026-07-12T08:45:12Z', read: false },
  { id: 'ALT-102', priority: 'Medium', severity: 'warning', type: 'Gaze Deviation', user: 'John Doe', session: 'SES-041', time: '2026-07-12T08:50:05Z', read: false },
  { id: 'ALT-103', priority: 'Low', severity: 'info', type: 'Voice Activity', user: 'Jane Smith', session: 'SES-042', time: '2026-07-12T10:05:30Z', read: true },
  { id: 'ALT-104', priority: 'High', severity: 'danger', type: 'Mobile Phone', user: 'Mike Johnson', session: 'SES-039', time: '2026-07-10T15:10:22Z', read: true },
];

// Recharts specific data structures
export const chartDataWeeklyActivity = [
  { name: 'Mon', sessions: 40, violations: 5 },
  { name: 'Tue', sessions: 35, violations: 3 },
  { name: 'Wed', sessions: 55, violations: 12 },
  { name: 'Thu', sessions: 45, violations: 7 },
  { name: 'Fri', sessions: 60, violations: 15 },
  { name: 'Sat', sessions: 20, violations: 2 },
  { name: 'Sun', sessions: 15, violations: 1 },
];

export const chartDataRiskDistribution = [
  { name: 'Low (0-30)', value: 65, color: '#10b981' },
  { name: 'Medium (31-60)', value: 25, color: '#f59e0b' },
  { name: 'High (61-100)', value: 10, color: '#ef4444' },
];

export const chartDataDetectionFrequency = [
  { subject: 'Gaze', A: 120, fullMark: 150 },
  { subject: 'Face', A: 98, fullMark: 150 },
  { subject: 'Voice', A: 86, fullMark: 150 },
  { subject: 'Object', A: 45, fullMark: 150 },
  { subject: 'Posture', A: 65, fullMark: 150 },
];
