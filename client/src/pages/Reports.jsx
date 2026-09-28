import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  Download, Search, Eye, RefreshCw, FileText, Printer, Shield, 
  CheckCircle2, AlertTriangle, Calendar, Clock, User
} from 'lucide-react';
import PageHeader from '../components/Cards/PageHeader';
import api from '../services/api';
import ReportDetailModal from '../components/Modals/ReportDetailModal';

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterMode, setFilterMode] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
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
    } catch (err) {
      console.error('Failed to load reports:', err);
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

  const openReport = (report) => {
    setSelectedReportId(report.reportId || null);
    setSelectedSessionId(report.sessionId || null);
    setIsModalOpen(true);
  };

  // Client-side real-time filtering on loaded data
  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      // 1. Search matching
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const matchesReportId = (report.reportId || '').toLowerCase().includes(q);
        const matchesCandidate = (report.userName || report.userEmail || '').toLowerCase().includes(q);
        const matchesSessionId = (report.sessionId || '').toLowerCase().includes(q);
        const matchesRoomId = (report.roomId || '').toLowerCase().includes(q);
        const matchesTitle = (report.roomTitle || '').toLowerCase().includes(q);

        if (!matchesReportId && !matchesCandidate && !matchesSessionId && !matchesRoomId && !matchesTitle) {
          return false;
        }
      }
      
      // 2. Status matching
      if (filterStatus !== 'ALL') {
        const canonicalStatus = report.verdict || report.status || 'PASSED';
        if (canonicalStatus !== filterStatus) return false;
      }

      // 3. Mode matching
      if (filterMode !== 'ALL') {
        const rawMode = (report.mode || report.sessionType || 'EXAM').toUpperCase().replace(/[\s-]/g, '_');
        const filterVal = filterMode.toUpperCase().replace(/[\s-]/g, '_');
        if (rawMode !== filterVal) return false;
      }

      return true;
    });
  }, [reports, searchTerm, filterStatus, filterMode]);

  const renderVerdictBadge = (verdict) => {
    switch (verdict) {
      case 'PASSED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={12} className="text-emerald-600" />
            PASSED
          </span>
        );
      case 'REVIEW_REQUIRED':
      case 'REVIEW REQUIRED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
            <AlertTriangle size={12} className="text-amber-600" />
            REVIEW REQUIRED
          </span>
        );
      case 'FLAGGED':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200">
            <AlertTriangle size={12} className="text-rose-600" />
            FLAGGED
          </span>
        );
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <PageHeader 
        title="My Reports" 
        subtitle="Audited proctoring integrity certificates, AI risk assessments, and forensic event records" 
        breadcrumb={['TrueView AI', 'My Reports']}
        actions={
          <div className="flex items-center gap-2 relative">
            <button 
              onClick={fetchReports} 
              className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin text-blue-600' : ''} /> Refresh
            </button>
            
            <div className="relative">
              <button 
                onClick={() => setShowExportMenu(!showExportMenu)} 
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 transition-colors shadow-sm"
              >
                <Download size={14} /> Export Reports
              </button>

              {showExportMenu && (
                <div className="absolute right-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-30 py-1.5 text-xs">
                  <button
                    onClick={handleExportCsv}
                    className="w-full text-left px-4 py-2 hover:bg-slate-50 text-slate-800 font-semibold flex items-center gap-2"
                  >
                    <Download size={14} className="text-emerald-600" />
                    Download CSV Spreadsheet
                  </button>
                  <button
                    onClick={handlePrintSummary}
                    className="w-full text-left px-4 py-2 hover:bg-slate-50 text-slate-800 font-semibold flex items-center gap-2 border-t border-slate-100"
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
      <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-96">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search by Report ID, Candidate, Session ID, Room ID, Title..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium" 
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">Status:</span>
            {['ALL', 'PASSED', 'REVIEW_REQUIRED', 'FLAGGED'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border shrink-0 ${
                  filterStatus === st 
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs' 
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {st === 'ALL' ? 'All Status' : st === 'REVIEW_REQUIRED' ? 'Review Required' : st.charAt(0) + st.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Mode Filter */}
        <div className="flex items-center gap-1 pt-2 border-t border-slate-100 overflow-x-auto pb-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">Mode:</span>
          {[
            { id: 'ALL', label: 'All Modes' },
            { id: 'EXAM', label: 'Exam' },
            { id: 'INTERVIEW', label: 'Interview' },
            { id: 'ONLINE_CLASS', label: 'Online Class' },
            { id: 'MEETING', label: 'Meeting' },
            { id: 'WORKPLACE', label: 'Workplace' },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => setFilterMode(m.id)}
              className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors border shrink-0 ${
                filterMode === m.id
                  ? 'bg-slate-800 text-white border-slate-800 font-semibold'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {m.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-500 font-medium shrink-0 pl-2">
            Showing {filteredReports.length} of {reports.length} reports
          </span>
        </div>
      </div>

      {/* Reports Display Table / Empty State */}
      {loading ? (
        <div className="text-center py-20 text-slate-500 font-semibold text-sm">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Loading verified proctoring reports...
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center space-y-3 shadow-xs">
          <Shield size={40} className="mx-auto text-slate-300 mb-2" />
          <h3 className="text-base font-extrabold text-slate-800">No dynamic proctoring reports created yet.</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Reports are automatically generated when live proctoring or virtual room sessions complete.
          </p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3 shadow-xs">
          <Shield size={36} className="mx-auto text-slate-400" />
          <h3 className="text-base font-bold text-slate-800">No reports matched your filters</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Try resetting your search query or status/mode filter to view your reports.
          </p>
          <button
            onClick={() => {
              setFilterStatus('ALL');
              setFilterMode('ALL');
              setSearchTerm('');
            }}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 underline"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3.5 px-4">Report ID</th>
                  <th className="py-3.5 px-4">Candidate</th>
                  <th className="py-3.5 px-4">Exam / Room</th>
                  <th className="py-3.5 px-4">Session ID</th>
                  <th className="py-3.5 px-4">Mode</th>
                  <th className="py-3.5 px-4">Duration</th>
                  <th className="py-3.5 px-4 text-center">Violations</th>
                  <th className="py-3.5 px-4 text-center">Score</th>
                  <th className="py-3.5 px-4">Verdict</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredReports.map((report) => {
                  const durationSec = report.durationSeconds || 0;
                  const durationMin = Math.floor(durationSec / 60);
                  const durationRem = durationSec % 60;
                  const durationStr = durationMin > 0 ? `${durationMin}m ${durationRem}s` : `${durationRem}s`;
                  const score = report.overallIntegrityScore ?? 100;
                  const verdict = report.verdict || report.status || (score >= 85 ? 'PASSED' : score >= 60 ? 'REVIEW_REQUIRED' : 'FLAGGED');

                  return (
                    <tr 
                      key={report._id || report.reportId} 
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                      onClick={() => openReport(report)}
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {report.reportId}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 leading-snug">{report.userName}</div>
                        <div className="text-[11px] text-slate-500">{report.userEmail}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800 line-clamp-1 max-w-[180px]">{report.roomTitle || 'Proctor Session'}</div>
                        {report.roomId && (
                          <div className="text-[11px] font-mono text-blue-600">Room: {report.roomId}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-700 font-medium">
                        {report.sessionId}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-800 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px]">
                          {report.mode || report.sessionType || 'EXAM'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-700">
                        {durationStr}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          (report.totalViolations || 0) > 0 
                            ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          {report.totalViolations || 0}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`font-black text-xs ${
                          score >= 85 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-rose-600'
                        }`}>
                          {score}%
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {renderVerdictBadge(verdict)}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px]">
                        {report.createdAt ? new Date(report.createdAt).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            openReport(report);
                          }}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white rounded-lg transition-colors font-bold text-xs flex items-center gap-1.5 ml-auto border border-blue-200 hover:border-blue-600" 
                          title="Open Proctoring Integrity Report"
                        >
                          <Eye size={13} /> View Report
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report Detail Modal */}
      <ReportDetailModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        reportId={selectedReportId}
        sessionId={selectedSessionId}
      />
    </motion.div>
  );
}
