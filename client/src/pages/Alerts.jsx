import { motion } from 'framer-motion';
import { ShieldAlert, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import PageHeader from '../components/Cards/PageHeader';
import DataTable from '../components/Tables/DataTable';
import StatusBadge from '../components/Cards/StatusBadge';
import { mockAlerts } from '../utils/mockData';

export default function Alerts() {
  const columns = [
    { key: 'id', label: 'Alert ID', render: (row) => <span className="font-mono text-xs text-gray-400">{row.id}</span> },
    { key: 'type', label: 'Detection Type', render: (row) => <span className="text-sm font-medium text-gray-200">{row.type}</span> },
    { key: 'severity', label: 'Severity', render: (row) => <StatusBadge label={row.priority} variant={row.severity} dot /> },
    { key: 'user', label: 'User', render: (row) => <span className="text-sm text-gray-300">{row.user}</span> },
    { key: 'session', label: 'Session', render: (row) => <span className="font-mono text-xs text-gray-400">{row.session}</span> },
    { key: 'time', label: 'Timestamp', render: (row) => <span className="text-xs text-gray-500">{new Date(row.time).toLocaleString()}</span> },
    { key: 'status', label: 'Status', render: (row) => (
        <span className={`text-[10px] uppercase font-bold tracking-wider ${row.read ? 'text-gray-500' : 'text-primary-400'}`}>
          {row.read ? 'Dismissed' : 'Active'}
        </span>
    )},
  ];

  const highPriorityCount = mockAlerts.filter(a => a.severity === 'danger' && !a.read).length;

  return (
    <div className="space-y-6">
      <PageHeader 
        title="System Alerts" 
        subtitle="Real-time AI detections and system notifications" 
        breadcrumb={['TrueView AI', 'Alerts']}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass p-5 rounded-2xl flex items-center gap-4 border-l-4 border-l-danger-500">
          <div className="w-12 h-12 rounded-xl bg-danger-500/10 flex items-center justify-center text-danger-400"><ShieldAlert size={24}/></div>
          <div><div className="text-2xl font-bold text-gray-100">{highPriorityCount}</div><div className="text-xs text-gray-500">Critical Alerts</div></div>
        </div>
        <div className="glass p-5 rounded-2xl flex items-center gap-4 border-l-4 border-l-warning-500">
          <div className="w-12 h-12 rounded-xl bg-warning-500/10 flex items-center justify-center text-warning-400"><AlertTriangle size={24}/></div>
          <div><div className="text-2xl font-bold text-gray-100">12</div><div className="text-xs text-gray-500">Warnings</div></div>
        </div>
        <div className="glass p-5 rounded-2xl flex items-center gap-4 border-l-4 border-l-gray-600">
           <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-gray-400"><CheckCircle2 size={24}/></div>
           <div><div className="text-2xl font-bold text-gray-100">84</div><div className="text-xs text-gray-500">Resolved Today</div></div>
        </div>
      </div>

      <div className="glass p-4 rounded-xl flex gap-2 overflow-x-auto">
        <button className="px-4 py-1.5 rounded-lg bg-white/10 text-white text-sm">All Alerts</button>
        <button className="px-4 py-1.5 rounded-lg hover:bg-white/5 text-gray-400 text-sm">Unread</button>
        <button className="px-4 py-1.5 rounded-lg hover:bg-white/5 text-gray-400 text-sm flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-danger-500"/> High Priority</button>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <DataTable columns={columns} data={mockAlerts} />
      </motion.div>
    </div>
  );
}
