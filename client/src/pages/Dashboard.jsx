import { useState, useEffect } from 'react';
import {
  Activity, AlertTriangle, Users, Camera, Mic, 
  Cpu, Server, ShieldAlert, HeartPulse
} from 'lucide-react';
import { motion } from 'framer-motion';
import StatCard from '../components/Cards/StatCard';
import PageHeader from '../components/Cards/PageHeader';
import Timeline from '../components/Cards/Timeline';
import MetricGauge from '../components/Charts/MetricGauge';
import api from '../services/api';

export default function Dashboard() {
  const [stats, setStats] = useState({
    activeSessions: 0,
    usersOnline: 1,
    todaysAlerts: 0,
    totalViolations: 0,
    systemHealth: 100,
  });
  const [timelineItems, setTimelineItems] = useState([]);
  const [recentAlerts, setRecentAlerts] = useState([]);

  useEffect(() => {
    fetchDashboardStats();
    const interval = setInterval(fetchDashboardStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const res = await api.get('/ai-engine/dashboard-stats');
      const data = res.data;
      if (data.success) {
        if (data.stats) setStats(data.stats);
        if (data.timeline) setTimelineItems(data.timeline);
        if (data.alerts) setRecentAlerts(data.alerts);
      }
    } catch (_) {}
  };

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } }
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.2 } }
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <PageHeader
        title="Dashboard Overview"
        subtitle="Real-time system status and proctoring metrics"
        breadcrumb={['TrueView AI', 'Dashboard']}
      />

      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div variants={item}><StatCard icon={Activity} label="Active Sessions" value={stats.activeSessions} trendValue="Live" trendDirection="up" /></motion.div>
        <motion.div variants={item}><StatCard icon={Users} label="Users Online" value={stats.usersOnline} trendValue="Active" trendDirection="up" /></motion.div>
        <motion.div variants={item}><StatCard icon={AlertTriangle} label="Today's Alerts" value={stats.todaysAlerts} trendValue="Tracked" trendDirection="neutral" /></motion.div>
        <motion.div variants={item}><StatCard icon={ShieldAlert} label="Total Violations" value={stats.totalViolations} trendValue="Verified" trendDirection="warning" /></motion.div>
      </div>

      {/* System Health Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <motion.div variants={item} className="bg-white border border-gray-300 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-black uppercase tracking-wider">System Health</h3>
            <HeartPulse size={16} className="text-emerald-700 animate-pulse" />
          </div>
          <div className="flex items-end justify-between">
            <div>
              <span className="text-3xl font-extrabold text-black">{stats.systemHealth}%</span>
              <span className="text-xs font-semibold text-black block mt-1">All services operational</span>
            </div>
          </div>
        </motion.div>
        
        <motion.div variants={item} className="bg-white border border-gray-300 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-black uppercase tracking-wider">AI Engine</h3>
            <Cpu size={16} className="text-black" />
          </div>
          <div className="space-y-3">
             <div className="flex justify-between items-center"><span className="text-xs font-semibold text-black">Multimodal Engine</span><span className="badge-success">Operational</span></div>
             <div className="flex justify-between items-center"><span className="text-xs font-semibold text-black">Inference Latency</span><span className="text-xs font-mono font-bold text-black">45ms</span></div>
          </div>
        </motion.div>

        <motion.div variants={item} className="bg-white border border-gray-300 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-black uppercase tracking-wider">Camera Feeds</h3>
            <Camera size={16} className="text-black" />
          </div>
          <div className="flex items-center gap-4">
            <MetricGauge value={stats.activeSessions} max={30} size={64} strokeWidth={6} />
            <div>
              <div className="text-sm font-bold text-black">Active Streams</div>
              <div className="text-xs font-semibold text-black mt-1">1080p @ 30fps</div>
            </div>
          </div>
        </motion.div>

        <motion.div variants={item} className="bg-white border border-gray-300 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-black uppercase tracking-wider">Voice VAD</h3>
            <Mic size={16} className="text-black" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs"><span className="font-semibold text-black">Processing Load</span><span className="font-bold text-black">12%</span></div>
            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden border border-gray-300"><div className="h-full bg-black w-[12%]" /></div>
            <div className="flex justify-between items-center pt-2"><span className="text-xs font-semibold text-black">Noise Gate</span><span className="text-xs font-mono font-bold text-black">-45dB</span></div>
          </div>
        </motion.div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={item} className="bg-white border border-gray-300 rounded-xl shadow-sm">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50 rounded-t-xl">
            <h3 className="text-sm font-extrabold text-black flex items-center gap-2"><Server size={16}/> System Timeline</h3>
          </div>
          <div className="p-5 max-h-[380px] overflow-y-auto">
            {timelineItems.length === 0 ? (
              <div className="text-xs font-semibold text-black text-center py-8">
                No system events logged yet. Start a Live Monitoring or Virtual Room session to log new events.
              </div>
            ) : (
              <Timeline items={timelineItems} />
            )}
          </div>
        </motion.div>

        <motion.div variants={item} className="bg-white border border-gray-300 rounded-xl shadow-sm">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50 rounded-t-xl">
            <h3 className="text-sm font-extrabold text-black flex items-center gap-2"><AlertTriangle size={16}/> Recent Alerts</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {recentAlerts.length === 0 ? (
              <div className="text-xs font-semibold text-black text-center py-8">
                No proctoring alerts recorded yet.
              </div>
            ) : (
              recentAlerts.slice(0, 5).map((alert, idx) => (
                <div key={alert._id || idx} className="px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={alert.severity === 'danger' ? 'badge-danger' : alert.severity === 'warning' ? 'badge-warning' : 'badge-neutral'}>
                        {(alert.severity || 'info').toUpperCase()}
                      </span>
                      <span className="text-sm font-bold text-black">{alert.type}</span>
                    </div>
                    <span className="text-xs font-semibold text-black font-mono">{new Date(alert.timestamp || alert.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-medium text-black mt-1">
                    <span>User: <span className="font-bold text-black">{alert.userName || alert.userEmail}</span></span>
                    <span>Session: <span className="font-bold text-black font-mono">{alert.sessionId}</span></span>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
