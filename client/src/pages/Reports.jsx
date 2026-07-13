import { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Search, Filter, Eye, MoreHorizontal } from 'lucide-react';
import PageHeader from '../components/Cards/PageHeader';
import DataTable from '../components/Tables/DataTable';
import StatusBadge from '../components/Cards/StatusBadge';
import { mockReports } from '../utils/mockData';

export default function Reports() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredReports = mockReports.filter(report => 
    report.reportId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    report.user.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    { key: 'reportId', label: 'Report ID', render: (row) => <span className="font-mono text-gray-300">{row.reportId}</span> },
    { key: 'user', label: 'User' },
    { key: 'session', label: 'Session', render: (row) => <span className="font-mono text-gray-400">{row.session}</span> },
    { key: 'duration', label: 'Duration', render: (row) => <span className="font-mono text-gray-400">{row.duration}</span> },
    { key: 'violations', label: 'Violations', render: (row) => (
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${row.violations > 0 ? 'bg-danger-500/20 text-danger-400' : 'bg-surface-800 text-gray-400'}`}>
          {row.violations}
        </span>
    )},
    { key: 'riskScore', label: 'Risk Score', render: (row) => (
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-surface-800 rounded-full overflow-hidden">
             <div className={`h-full ${row.riskScore > 60 ? 'bg-danger-500' : row.riskScore > 20 ? 'bg-warning-500' : 'bg-success-500'}`} style={{ width: `${row.riskScore}%` }} />
          </div>
          <span className="text-[10px] font-mono text-gray-400">{row.riskScore}</span>
        </div>
    )},
    { key: 'status', label: 'Status', render: (row) => {
        let variant = 'success';
        if (row.status === 'Warning') variant = 'warning';
        if (row.status === 'Review Needed') variant = 'danger';
        return <StatusBadge label={row.status} variant={variant} dot />;
    }},
    { key: 'generatedTime', label: 'Generated', render: (row) => <span className="text-xs text-gray-500">{new Date(row.generatedTime).toLocaleDateString()}</span> },
    { key: 'actions', label: '', render: () => (
        <div className="flex gap-1 justify-end">
          <button className="p-1.5 text-gray-500 hover:text-primary-400 hover:bg-primary-500/10 rounded transition-colors" title="View"><Eye size={14}/></button>
          <button className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-white/5 rounded transition-colors" title="More"><MoreHorizontal size={14}/></button>
        </div>
    )},
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <PageHeader 
        title="Session Reports" 
        subtitle="Detailed analysis and risk scores for completed sessions" 
        breadcrumb={['TrueView AI', 'Reports']}
        actions={
          <button className="btn-primary text-sm flex items-center gap-2">
            <Download size={14} /> Export CSV
          </button>
        }
      />

      <div className="glass p-4 mb-4 flex flex-wrap items-center gap-3 rounded-xl">
        <div className="relative max-w-sm w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input 
            type="text" 
            placeholder="Search by Report ID or User..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-glass pl-9 text-sm w-full" 
          />
        </div>
        <button className="input-glass flex items-center gap-2 text-sm px-4">
          <Filter size={14} /> Filters
        </button>
      </div>

      <DataTable columns={columns} data={filteredReports} />
    </motion.div>
  );
}
