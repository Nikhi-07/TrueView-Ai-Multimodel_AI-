import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import PageHeader from '../components/Cards/PageHeader';
import DataTable from '../components/Tables/DataTable';
import StatusBadge from '../components/Cards/StatusBadge';
import api from '../services/api';

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    try {
      const res = await api.get('/ai-engine/alerts');
      if (res.data.success) {
        // Transform the data to match the UI expectations
        const formattedAlerts = res.data.alerts.map(a => ({
          id: a._id.substring(a._id.length - 6),
          type: a.type,
          severity: a.severity,
          priority: a.severity === 'danger' ? 'High' : a.severity === 'warning' ? 'Medium' : 'Low',
          user: a.userName,
          session: a.sessionId,
          time: a.timestamp,
          read: a.read || false,
        }));
        setAlerts(formattedAlerts);
      }
    } catch (error) {
      console.error("Failed to fetch alerts", error);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { key: 'id', label: 'Alert ID', render: (row) => <span className="font-mono text-xs text-gray-600">{row.id}</span> },
    { key: 'type', label: 'Detection Type', render: (row) => <span className="text-sm font-bold text-black">{row.type}</span> },
    { key: 'severity', label: 'Severity', render: (row) => <StatusBadge label={row.priority} variant={row.severity} dot /> },
    { key: 'user', label: 'User', render: (row) => <span className="text-sm font-semibold text-gray-800">{row.user}</span> },
    { key: 'session', label: 'Session', render: (row) => <span className="font-mono text-xs text-gray-600">{row.session}</span> },
    { key: 'time', label: 'Timestamp', render: (row) => <span className="text-xs font-semibold text-gray-500">{new Date(row.time).toLocaleString()}</span> },
    { key: 'status', label: 'Status', render: (row) => (
        <span className={`text-[10px] uppercase font-extrabold tracking-wider ${row.read ? 'text-gray-500' : 'text-primary-600'}`}>
          {row.read ? 'Dismissed' : 'Active'}
        </span>
    )},
  ];

  const highPriorityCount = alerts.filter(a => a.severity === 'danger' && !a.read).length;

  return (
    <div className="space-y-6">
      <PageHeader 
        title="System Alerts" 
        subtitle="Real-time AI detections and system notifications" 
        breadcrumb={['TrueView AI', 'Alerts']}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 shadow-sm p-5 rounded-2xl flex items-center gap-4 border-l-4 border-l-danger-500">
          <div className="w-12 h-12 rounded-xl bg-danger-50 flex items-center justify-center text-danger-500"><ShieldAlert size={24}/></div>
          <div><div className="text-2xl font-extrabold text-black">{highPriorityCount}</div><div className="text-xs font-semibold text-gray-500">Critical Alerts</div></div>
        </div>
        <div className="bg-white border border-gray-200 shadow-sm p-5 rounded-2xl flex items-center gap-4 border-l-4 border-l-warning-500">
          <div className="w-12 h-12 rounded-xl bg-warning-50 flex items-center justify-center text-warning-500"><AlertTriangle size={24}/></div>
          <div><div className="text-2xl font-extrabold text-black">{alerts.filter(a => a.severity === 'warning').length}</div><div className="text-xs font-semibold text-gray-500">Warnings</div></div>
        </div>
        <div className="bg-white border border-gray-200 shadow-sm p-5 rounded-2xl flex items-center gap-4 border-l-4 border-l-gray-400">
           <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600"><CheckCircle2 size={24}/></div>
           <div><div className="text-2xl font-extrabold text-black">{alerts.filter(a => a.read).length}</div><div className="text-xs font-semibold text-gray-500">Resolved</div></div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 shadow-sm p-4 rounded-xl flex gap-2 overflow-x-auto">
        <button className="px-4 py-1.5 rounded-lg bg-black text-white font-bold text-sm">All Alerts</button>
        <button className="px-4 py-1.5 rounded-lg hover:bg-gray-100 text-gray-600 font-semibold text-sm">Unread</button>
        <button className="px-4 py-1.5 rounded-lg hover:bg-gray-100 text-gray-600 font-semibold text-sm flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-danger-500"/> High Priority</button>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        {loading ? (
          <div className="text-center py-8 text-gray-500 font-semibold text-sm">Loading alerts...</div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-8 text-gray-500 font-semibold text-sm bg-white border border-gray-200 rounded-xl shadow-sm">No alerts found for your account.</div>
        ) : (
          <DataTable columns={columns} data={alerts} />
        )}
      </motion.div>
    </div>
  );
}
