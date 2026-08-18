import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, Radio, CheckCircle2, Bell, AlertCircle,
  RotateCw, Wifi, WifiOff
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';
import { io } from 'socket.io-client';
import api from '../services/api';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

// Custom Tooltip for Sessions Chart
const SessionsCustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 text-white p-2.5 rounded-lg shadow-xl text-xs border border-slate-700">
        <p className="font-bold text-slate-300 mb-1">{label}</p>
        <div className="space-y-0.5">
          <p className="text-emerald-400">Completed: <span className="font-mono font-bold">{payload.find(p => p.dataKey === 'completed')?.value ?? 0}</span></p>
          <p className="text-slate-300">Created: <span className="font-mono font-bold">{payload.find(p => p.dataKey === 'created')?.value ?? 0}</span></p>
          <p className="text-teal-400">Started: <span className="font-mono font-bold">{payload.find(p => p.dataKey === 'started')?.value ?? 0}</span></p>
          <p className="text-rose-400">Suspended: <span className="font-mono font-bold">{payload.find(p => p.dataKey === 'suspended')?.value ?? 0}</span></p>
        </div>
      </div>
    );
  }
  return null;
};

// Custom Tooltip for Alerts Chart
const AlertsCustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 text-white p-2.5 rounded-lg shadow-xl text-xs border border-slate-700">
        <p className="font-bold text-slate-300 mb-1">{label}</p>
        <div className="space-y-0.5">
          <p className="text-rose-400">Critical: <span className="font-mono font-bold">{payload.find(p => p.dataKey === 'critical')?.value ?? 0}</span></p>
          <p className="text-amber-400">High: <span className="font-mono font-bold">{payload.find(p => p.dataKey === 'high')?.value ?? 0}</span></p>
          <p className="text-slate-300">Low: <span className="font-mono font-bold">{payload.find(p => p.dataKey === 'low')?.value ?? 0}</span></p>
          <p className="text-orange-400">Medium: <span className="font-mono font-bold">{payload.find(p => p.dataKey === 'medium')?.value ?? 0}</span></p>
        </div>
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState('30D');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(false);

  // Pure real-time metric stats (no prior hardcoded numbers)
  const [stats, setStats] = useState({
    mySessions: 0,
    activeSessions: 0,
    completedSessions: 0,
    myAlerts: 0,
    criticalAlerts: 0,
    todaySessions: 0,
    highAlerts: 0,
  });

  // Dynamic real-time time-series data from MongoDB
  const [sessionsData, setSessionsData] = useState([]);
  const [alertsData, setAlertsData] = useState([]);

  const socketRef = useRef(null);

  // Fetch real telemetry from backend
  const fetchStats = useCallback(async (range = timeRange) => {
    try {
      const res = await api.get(`/ai-engine/dashboard-stats?timeRange=${range}`);
      if (res.data?.success) {
        const d = res.data;
        if (d.stats) {
          setStats({
            mySessions: d.stats.mySessions ?? d.stats.totalSessions ?? 0,
            activeSessions: d.stats.activeSessions ?? 0,
            completedSessions: d.stats.completedSessions ?? 0,
            myAlerts: d.stats.myAlerts ?? d.stats.todaysAlerts ?? 0,
            criticalAlerts: d.stats.criticalAlerts ?? 0,
            highAlerts: d.stats.highAlerts ?? 0,
            todaySessions: d.stats.todaySessions ?? 0,
          });
        }
        if (Array.isArray(d.sessionsOverTime)) {
          setSessionsData(d.sessionsOverTime);
        }
        if (Array.isArray(d.alertsOverTime)) {
          setAlertsData(d.alertsOverTime);
        }
      }
    } catch (err) {
      console.error('[Dashboard] Telemetry fetch error:', err);
    }
  }, [timeRange]);

  // Initial fetch and reactive range changes
  useEffect(() => {
    fetchStats(timeRange);
  }, [timeRange, fetchStats]);

  // Real-time background polling interval (every 4 seconds)
  useEffect(() => {
    const pollInterval = setInterval(() => {
      fetchStats(timeRange);
    }, 4000);
    return () => clearInterval(pollInterval);
  }, [timeRange, fetchStats]);

  // Real-time Socket.IO live listener
  useEffect(() => {
    const token = localStorage.getItem('trueview_token');
    const socket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
      auth: { token: token || undefined },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsLiveConnected(true);
    });

    socket.on('disconnect', () => {
      setIsLiveConnected(false);
    });

    // Real-time push events from monitoring / sessions / alerts
    const handleLiveTrigger = () => {
      fetchStats(timeRange);
    };

    socket.on('DASHBOARD_LIVE_EVENT', handleLiveTrigger);
    socket.on('NEW_ALERT', handleLiveTrigger);
    socket.on('proctor_alert', handleLiveTrigger);
    socket.on('SESSION_STARTED', handleLiveTrigger);
    socket.on('SESSION_CREATED', handleLiveTrigger);
    socket.on('SESSION_ENDED', handleLiveTrigger);
    socket.on('SESSION_SUSPENDED', handleLiveTrigger);
    socket.on('PARTICIPANT_JOINED', handleLiveTrigger);
    socket.on('PARTICIPANT_LEFT', handleLiveTrigger);

    return () => {
      socket.off('DASHBOARD_LIVE_EVENT', handleLiveTrigger);
      socket.off('NEW_ALERT', handleLiveTrigger);
      socket.off('proctor_alert', handleLiveTrigger);
      socket.off('SESSION_STARTED', handleLiveTrigger);
      socket.off('SESSION_CREATED', handleLiveTrigger);
      socket.off('SESSION_ENDED', handleLiveTrigger);
      socket.off('SESSION_SUSPENDED', handleLiveTrigger);
      socket.off('PARTICIPANT_JOINED', handleLiveTrigger);
      socket.off('PARTICIPANT_LEFT', handleLiveTrigger);
      socket.disconnect();
    };
  }, [timeRange, fetchStats]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchStats(timeRange);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Dynamic calculations for chart Y-Axis scaling
  const maxSessionsValue = Math.max(
    4,
    ...sessionsData.map(d => Math.max(d.created || 0, d.started || 0, d.completed || 0, d.suspended || 0))
  );

  const maxAlertsValue = Math.max(
    10,
    ...alertsData.map(d => (d.critical || 0) + (d.high || 0) + (d.medium || 0) + (d.low || 0))
  );

  return (
    <div className="space-y-6 select-none font-sans">
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-[28px] font-extrabold text-slate-900 tracking-tight leading-tight">
              My Dashboard
            </h1>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {isLiveConnected ? <Wifi size={11} className="text-emerald-600 animate-pulse" /> : <WifiOff size={11} className="text-slate-400" />}
              <span>{isLiveConnected ? 'LIVE' : 'SYNCING'}</span>
            </div>
          </div>
          <p className="text-xs md:text-[13px] text-slate-500 font-normal mt-1">
            Your monitored sessions and reports (Real-time dynamic feed)
          </p>
        </div>

        {/* Time Filter Pills + Refresh */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setTimeRange('TODAY')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              timeRange === 'TODAY'
                ? 'bg-black text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Today
          </button>
          
          <button
            onClick={() => setTimeRange('7D')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              timeRange === '7D'
                ? 'bg-black text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            7 Days
          </button>

          <button
            onClick={() => setTimeRange('30D')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              timeRange === '30D'
                ? 'bg-black text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            30 Days
          </button>

          <button
            onClick={() => setTimeRange('CUSTOM')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              timeRange === 'CUSTOM'
                ? 'bg-black text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Custom
          </button>

          <button
            onClick={handleRefresh}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-1.5 ml-1"
          >
            <RotateCw size={13} className={`text-slate-600 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 5 KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {/* 1. MY SESSIONS */}
        <div
          onClick={() => navigate('/sessions')}
          className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
              MY SESSIONS
            </span>
            <div className="w-7 h-7 rounded-lg bg-slate-100/90 text-slate-700 flex items-center justify-center">
              <Activity size={14} />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
              {stats.mySessions}
            </div>
            <div className="text-[11.5px] text-slate-500 mt-1 font-normal">
              {stats.todaySessions} today
            </div>
          </div>
        </div>

        {/* 2. ACTIVE SESSIONS */}
        <div
          onClick={() => navigate('/sessions?filter=ACTIVE')}
          className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
              ACTIVE SESSIONS
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Radio size={14} />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-3xl font-extrabold text-emerald-600 tracking-tight leading-tight">
              {stats.activeSessions}
            </div>
            <div className="text-[11.5px] text-slate-500 mt-1 font-normal truncate">
              currently monitor...
            </div>
          </div>
        </div>

        {/* 3. COMPLETED SESSIONS */}
        <div
          onClick={() => navigate('/reports')}
          className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
              COMPLETED SESSIONS
            </span>
            <div className="w-7 h-7 rounded-lg bg-slate-100/90 text-slate-700 flex items-center justify-center">
              <CheckCircle2 size={14} />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
              {stats.completedSessions}
            </div>
            <div className="text-[11.5px] text-slate-500 mt-1 font-normal">
              with reports
            </div>
          </div>
        </div>

        {/* 4. MY ALERTS */}
        <div
          onClick={() => navigate('/alerts')}
          className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
              MY ALERTS
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center">
              <Bell size={14} />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-3xl font-extrabold text-amber-700 tracking-tight leading-tight">
              {stats.myAlerts}
            </div>
            <div className="text-[11.5px] text-slate-500 mt-1 font-normal">
              {stats.highAlerts} high
            </div>
          </div>
        </div>

        {/* 5. CRITICAL ALERTS */}
        <div
          onClick={() => navigate('/alerts?severity=CRITICAL')}
          className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
              CRITICAL ALERTS
            </span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center">
              <AlertCircle size={14} />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-3xl font-extrabold text-rose-600 tracking-tight leading-tight">
              {stats.criticalAlerts}
            </div>
            <div className="text-[11.5px] text-slate-500 mt-1 font-normal">
              require review
            </div>
          </div>
        </div>
      </div>

      {/* Two Main Real-Time Graphs Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left Chart: SESSIONS OVER TIME */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-800">
              SESSIONS OVER TIME
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Created · Started · Completed · Suspended ({timeRange})
            </div>
          </div>

          <div className="w-full h-[270px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sessionsData} margin={{ top: 15, right: 10, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, maxSessionsValue]}
                  allowDecimals={false}
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<SessionsCustomTooltip />} />
                
                {/* Completed Area with soft green gradient fill */}
                <Area
                  type="monotone"
                  dataKey="completed"
                  stroke="#059669"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorCompleted)"
                  dot={false}
                />
                
                {/* Created Spline Line */}
                <Line
                  type="monotone"
                  dataKey="created"
                  stroke="#64748b"
                  strokeWidth={1.75}
                  dot={false}
                />

                {/* Started Line */}
                <Line
                  type="monotone"
                  dataKey="started"
                  stroke="#0d9488"
                  strokeWidth={1.5}
                  dot={false}
                />

                {/* Suspended Line */}
                <Line
                  type="monotone"
                  dataKey="suspended"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Bottom Legend */}
          <div className="flex items-center justify-center gap-4 pt-3 border-t border-slate-100 text-[11px] font-medium mt-1">
            <div className="flex items-center gap-1 text-emerald-600">
              <span className="inline-block w-3 h-0.5 bg-emerald-600 rounded-full"></span>
              <span>Completed</span>
            </div>
            <div className="flex items-center gap-1 text-slate-500">
              <span className="inline-block w-3 h-0.5 bg-slate-500 rounded-full"></span>
              <span>Created</span>
            </div>
            <div className="flex items-center gap-1 text-teal-600">
              <span className="inline-block w-3 h-0.5 bg-teal-600 rounded-full"></span>
              <span>Started</span>
            </div>
            <div className="flex items-center gap-1 text-rose-500">
              <span className="inline-block w-3 h-0.5 bg-rose-500 rounded-full"></span>
              <span>Suspended</span>
            </div>
          </div>
        </div>

        {/* Right Chart: ALERTS OVER TIME */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-800">
              ALERTS OVER TIME
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Severity distribution ({timeRange})
            </div>
          </div>

          <div className="w-full h-[270px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={alertsData} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, maxAlertsValue]}
                  allowDecimals={false}
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<AlertsCustomTooltip />} />
                
                {/* Stacked Severity Bars */}
                <Bar dataKey="critical" stackId="a" fill="#dc2626" barSize={34} radius={[0, 0, 0, 0]} />
                <Bar dataKey="high" stackId="a" fill="#eab308" barSize={34} />
                <Bar dataKey="low" stackId="a" fill="#94a3b8" barSize={34} />
                <Bar dataKey="medium" stackId="a" fill="#f97316" barSize={34} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Bottom Legend */}
          <div className="flex items-center justify-center gap-5 pt-3 border-t border-slate-100 text-[10.5px] font-mono font-bold mt-1">
            <div className="flex items-center gap-1.5 text-rose-600">
              <span className="inline-block w-2.5 h-2.5 bg-rose-600 rounded-xs"></span>
              <span>CRITICAL</span>
            </div>
            <div className="flex items-center gap-1.5 text-amber-500">
              <span className="inline-block w-2.5 h-2.5 bg-amber-500 rounded-xs"></span>
              <span>HIGH</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400">
              <span className="inline-block w-2.5 h-2.5 bg-slate-400 rounded-xs"></span>
              <span>LOW</span>
            </div>
            <div className="flex items-center gap-1.5 text-orange-500">
              <span className="inline-block w-2.5 h-2.5 bg-orange-500 rounded-xs"></span>
              <span>MEDIUM</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


