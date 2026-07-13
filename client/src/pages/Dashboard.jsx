import {
  Activity, AlertTriangle, ShieldCheck, Users, Camera, Mic, 
  Cpu, Server, ShieldAlert, HeartPulse
} from 'lucide-react';
import { motion } from 'framer-motion';
import StatCard from '../components/Cards/StatCard';
import StatusBadge from '../components/Cards/StatusBadge';
import PageHeader from '../components/Cards/PageHeader';
import Timeline from '../components/Cards/Timeline';
import MetricGauge from '../components/Charts/MetricGauge';
import { mockDashboardStats, mockActivityTimeline, mockAlerts } from '../utils/mockData';

export default function Dashboard() {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show">
      <PageHeader
        title="Dashboard Overview"
        subtitle="Real-time system status and proctoring metrics"
        breadcrumb={['TrueView AI', 'Dashboard']}
      />

      {/* Top Stats Grid (4 Widgets) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <motion.div variants={item}><StatCard icon={Activity} label="Active Sessions" value={mockDashboardStats.activeSessions} trendValue="+3" trendDirection="up" /></motion.div>
        <motion.div variants={item}><StatCard icon={Users} label="Users Online" value={mockDashboardStats.usersOnline} trendValue="+12%" trendDirection="up" /></motion.div>
        <motion.div variants={item}><StatCard icon={AlertTriangle} label="Today's Alerts" value={mockDashboardStats.todaysAlerts} trendValue="-5%" trendDirection="down" /></motion.div>
        <motion.div variants={item}><StatCard icon={ShieldAlert} label="Total Violations" value={mockDashboardStats.totalViolations} trendValue="2 pending" trendDirection="warning" /></motion.div>
      </div>

      {/* System Health & Status Grid (4 Widgets) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <motion.div variants={item} className="glass p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-200">System Health</h3>
            <HeartPulse size={16} className="text-success-400 animate-pulse" />
          </div>
          <div className="flex items-end justify-between">
            <div>
              <span className="text-3xl font-bold text-gray-100">{mockDashboardStats.systemHealth}%</span>
              <span className="text-xs text-gray-500 block mt-1">All services operational</span>
            </div>
          </div>
        </motion.div>
        
        <motion.div variants={item} className="glass p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-200">AI Status</h3>
            <Cpu size={16} className="text-primary-400" />
          </div>
          <div className="space-y-3">
             <div className="flex justify-between items-center"><span className="text-xs text-gray-400">Ollama Engine</span><StatusBadge label="Running" variant="success" dot /></div>
             <div className="flex justify-between items-center"><span className="text-xs text-gray-400">Inference Latency</span><span className="text-xs font-mono text-gray-200">45ms</span></div>
          </div>
        </motion.div>

        <motion.div variants={item} className="glass p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-200">Camera Feeds</h3>
            <Camera size={16} className="text-gray-400" />
          </div>
          <div className="flex items-center gap-4">
            <MetricGauge value={mockDashboardStats.activeSessions} max={30} size={70} strokeWidth={6} />
            <div>
              <div className="text-sm font-medium text-gray-200">Active Streams</div>
              <div className="text-xs text-gray-500 mt-1">1080p @ 30fps</div>
            </div>
          </div>
        </motion.div>

        <motion.div variants={item} className="glass p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-200">Voice Status</h3>
            <Mic size={16} className="text-gray-400" />
          </div>
          <div className="flex items-center gap-4">
             <div className="flex-1">
                <div className="flex justify-between text-xs mb-1"><span className="text-gray-400">Processing Load</span><span className="text-gray-200">42%</span></div>
                <div className="h-1.5 w-full bg-surface-800 rounded-full overflow-hidden"><div className="h-full bg-primary-500 w-[42%]" /></div>
             </div>
          </div>
          <div className="mt-4 flex justify-between items-center"><span className="text-xs text-gray-400">Noise Gate</span><span className="text-xs font-mono text-gray-200">-45dB</span></div>
        </motion.div>
      </div>

      {/* Main Content Grid (Timeline + Recent Alerts) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={item} className="glass">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2"><Server size={16}/> System Timeline</h3>
          </div>
          <div className="p-5 max-h-[400px] overflow-y-auto">
            <Timeline items={mockActivityTimeline} />
          </div>
        </motion.div>

        <motion.div variants={item} className="glass">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2"><AlertTriangle size={16}/> Recent Alerts</h3>
            <button className="text-xs text-primary-400 hover:text-primary-300 transition-colors">View All</button>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {mockAlerts.slice(0, 5).map((alert) => (
              <div key={alert.id} className="px-5 py-3.5 hover:bg-white/[0.02] transition-colors group">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge label={alert.severity.toUpperCase()} variant={alert.severity} dot />
                    <span className="text-sm font-medium text-gray-200">{alert.type}</span>
                  </div>
                  <span className="text-xs text-gray-500 font-mono">{new Date(alert.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400 mt-2">
                  <span>User: <span className="text-gray-300">{alert.user}</span></span>
                  <span>Session: <span className="text-gray-300 font-mono">{alert.session}</span></span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
