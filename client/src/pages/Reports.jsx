import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Download, Search, Filter, Eye, RefreshCw } from 'lucide-react';
import PageHeader from '../components/Cards/PageHeader';
import DataTable from '../components/Tables/DataTable';

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/reports');
      const data = await res.json();
      if (data.success && Array.isArray(data.reports)) {
        setReports(data.reports);
      }
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  const filteredReports = reports.filter(report => 
    (report.reportId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (report.userName || report.userEmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (report.sessionId || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    { key: 'reportId', label: 'Report ID', render: (row) => <span className="font-mono font-bold text-black">{row.reportId}</span> },
    { key: 'userName', label: 'User Name', render: (row) => <span className="font-bold text-black">{row.userName || row.userEmail}</span> },
    { key: 'sessionId', label: 'Session ID', render: (row) => <span className="font-mono text-black font-semibold">{row.sessionId}</span> },
    { key: 'sessionType', label: 'Mode', render: (row) => <span className="font-semibold text-black">{row.sessionType}</span> },
    { key: 'totalViolations', label: 'Violations', render: (row) => (
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${row.totalViolations > 0 ? 'bg-red-100 text-red-950 border border-red-300' : 'bg-gray-100 text-black border border-gray-300'}`}>
          {row.totalViolations || 0}
        </span>
    )},
    { key: 'overallIntegrityScore', label: 'Integrity Score', render: (row) => (
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-black">{row.overallIntegrityScore ?? 100}%</span>
        </div>
    )},
    { key: 'status', label: 'Status', render: (row) => {
        let variant = 'badge-success';
        if (row.status === 'REVIEW_REQUIRED') variant = 'badge-warning';
        if (row.status === 'FLAGGED') variant = 'badge-danger';
        return <span className={variant}>{row.status}</span>;
    }},
    { key: 'createdAt', label: 'Generated', render: (row) => <span className="text-xs font-semibold text-black font-mono">{new Date(row.createdAt).toLocaleDateString()}</span> },
    { key: 'actions', label: '', render: (row) => (
        <div className="flex gap-1 justify-end">
          <button className="p-1.5 text-black hover:bg-gray-200 rounded transition-colors" title="View Report"><Eye size={14}/></button>
        </div>
    )},
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <PageHeader 
        title="Session Reports" 
        subtitle="Detailed analysis and risk scores for completed proctoring sessions" 
        breadcrumb={['TrueView AI', 'Reports']}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={fetchReports} className="btn-ghost text-xs flex items-center gap-1.5">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button className="btn-primary text-xs flex items-center gap-2 font-bold">
              <Download size={14} /> Export Reports
            </button>
          </div>
        }
      />

      <div className="bg-white border border-gray-300 p-4 rounded-xl flex flex-wrap items-center gap-3 shadow-sm">
        <div className="relative max-w-sm w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-black" />
          <input 
            type="text" 
            placeholder="Search by Report ID, User, or Session..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-glass pl-9 text-xs w-full text-black font-semibold" 
          />
        </div>
        <button className="btn-ghost flex items-center gap-2 text-xs">
          <Filter size={14} /> Filters
        </button>
      </div>

      {reports.length === 0 ? (
        <div className="bg-white border border-gray-300 rounded-xl p-12 text-center text-black space-y-2 shadow-sm">
          <p className="text-sm font-extrabold text-black">No dynamic proctoring reports created yet.</p>
          <p className="text-xs font-semibold text-black">Reports are automatically generated when live proctoring or virtual room sessions complete.</p>
        </div>
      ) : (
        <DataTable columns={columns} data={filteredReports} />
      )}
    </motion.div>
  );
}
