import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Search, Filter, Eye, RefreshCw, FileText, Printer, Shield, CheckCircle2, AlertTriangle } from 'lucide-react';
import PageHeader from '../components/Cards/PageHeader';
import DataTable from '../components/Tables/DataTable';
import api from '../services/api';
import ReportDetailModal from '../components/Modals/ReportDetailModal';

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterMode, setFilterMode] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await api.get('/reports');
      const data = res.data;
      if (data.success && Array.isArray(data.reports)) {
        setReports(data.reports);
      }
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = async () => {
    setShowExportMenu(false);
    try {
      const token = localStorage.getItem('trueview_token');
      const res = await fetch('/api/reports/export/csv', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trueview_reports_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error("CSV Export failed", e);
    }
  };

  const handlePrintSummary = () => {
    setShowExportMenu(false);
    window.print();
  };

  const openReport = (reportId) => {
    setSelectedReportId(reportId);
    setIsModalOpen(true);
  };

  const filteredReports = reports.filter(report => {
    const matchesSearch = 
      (report.reportId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (report.userName || report.userEmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (report.sessionId || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === 'ALL' || report.status === filterStatus;
    const matchesMode = filterMode === 'ALL' || (report.sessionType || 'EXAM') === filterMode;

    return matchesSearch && matchesStatus && matchesMode;
  });

  const columns = [
    { key: 'reportId', label: 'Report ID', render: (row) => <span className="font-mono font-bold text-slate-900">{row.reportId}</span> },
    { key: 'userName', label: 'Candidate', render: (row) => <span className="font-bold text-slate-900">{row.userName || row.userEmail}</span> },
    { key: 'sessionId', label: 'Session ID', render: (row) => <span className="font-mono text-slate-700 font-semibold">{row.sessionId}</span> },
    { key: 'sessionType', label: 'Mode', render: (row) => <span className="font-semibold text-slate-800 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-xs">{row.sessionType || 'EXAM'}</span> },
    { key: 'totalViolations', label: 'Violations', render: (row) => (
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${row.totalViolations > 0 ? 'bg-red-100 text-red-950 border border-red-300' : 'bg-emerald-50 text-emerald-900 border border-emerald-200'}`}>
          {row.totalViolations || 0}
        </span>
    )},
    { key: 'overallIntegrityScore', label: 'Integrity Score', render: (row) => (
        <div className="flex items-center gap-1.5 font-bold">
          <span className={`text-xs ${row.overallIntegrityScore >= 85 ? 'text-emerald-600' : row.overallIntegrityScore >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>
            {row.overallIntegrityScore ?? 100}%
          </span>
        </div>
    )},
    { key: 'status', label: 'Status', render: (row) => {
        let variant = 'badge-success';
        if (row.status === 'REVIEW_REQUIRED') variant = 'badge-warning';
        if (row.status === 'FLAGGED') variant = 'badge-danger';
        return <span className={variant}>{row.status}</span>;
    }},
    { key: 'createdAt', label: 'Date', render: (row) => <span className="text-xs font-semibold text-slate-600 font-mono">{new Date(row.createdAt).toLocaleDateString()}</span> },
    { key: 'actions', label: '', render: (row) => (
        <div className="flex gap-1 justify-end">
          <button 
            onClick={() => openReport(row.reportId)}
            className="p-1.5 text-slate-700 hover:bg-slate-200 rounded transition-colors" 
            title="View Full Integrity Report"
          >
            <Eye size={15}/>
          </button>
        </div>
    )},
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <PageHeader 
        title="Session Reports" 
        subtitle="Detailed analysis, risk audits, and integrity certificates for completed proctoring sessions" 
        breadcrumb={['TrueView AI', 'Reports']}
        actions={
          <div className="flex items-center gap-2 relative">
            <button onClick={fetchReports} className="btn-ghost text-xs flex items-center gap-1.5">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            
            <div className="relative">
              <button 
                onClick={() => setShowExportMenu(!showExportMenu)} 
                className="btn-primary text-xs flex items-center gap-2 font-bold"
              >
                <Download size={14} /> Export Reports
              </button>

              {showExportMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-30 py-1.5 text-xs">
                  <button
                    onClick={handleExportCsv}
                    className="w-full text-left px-4 py-2 hover:bg-slate-100 text-slate-800 font-semibold flex items-center gap-2"
                  >
                    <Download size={14} className="text-emerald-600" />
                    Download CSV Table
                  </button>
                  <button
                    onClick={handlePrintSummary}
                    className="w-full text-left px-4 py-2 hover:bg-slate-100 text-slate-800 font-semibold flex items-center gap-2 border-t border-slate-100"
                  >
                    <Printer size={14} className="text-blue-600" />
                    Print / Save PDF Summary
                  </button>
                </div>
              )}
            </div>
          </div>
        }
      />

      {/* Controls & Filter Bar */}
      <div className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-3 shadow-sm">
        <div className="relative max-w-sm w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search by Report ID, User, or Session..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-glass pl-9 text-xs w-full text-slate-900 font-semibold" 
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
            {['ALL', 'PASSED', 'REVIEW_REQUIRED', 'FLAGGED'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-2.5 py-1 rounded font-semibold text-[11px] transition-colors ${
                  filterStatus === st ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st === 'ALL' ? 'All Status' : st.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Mode Filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
            {['ALL', 'EXAM', 'INTERVIEW', 'ONLINE_CLASS', 'MEETING'].map((m) => (
              <button
                key={m}
                onClick={() => setFilterMode(m)}
                className={`px-2.5 py-1 rounded font-semibold text-[11px] transition-colors ${
                  filterMode === m ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {m === 'ALL' ? 'All Modes' : m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-900 space-y-2 shadow-sm">
          <Shield size={32} className="mx-auto text-slate-400 mb-2" />
          <p className="text-sm font-extrabold text-slate-900">No dynamic proctoring reports created yet.</p>
          <p className="text-xs font-semibold text-slate-500">Reports are automatically generated when live proctoring or virtual room sessions complete.</p>
        </div>
      ) : (
        <DataTable columns={columns} data={filteredReports} onRowClick={(row) => openReport(row.reportId)} />
      )}

      {/* Report Detail Modal */}
      <ReportDetailModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        reportId={selectedReportId}
      />
    </motion.div>
  );
}
