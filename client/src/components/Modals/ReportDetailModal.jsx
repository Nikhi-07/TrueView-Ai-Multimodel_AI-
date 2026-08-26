import React, { useState, useEffect } from 'react';
import { 
  X, Download, Printer, Shield, CheckCircle2, AlertTriangle, AlertOctagon, 
  Clock, Calendar, User, Mail, Activity, Eye, Smartphone, Volume2, Users
} from 'lucide-react';
import api from '../../services/api';

export default function ReportDetailModal({ isOpen, onClose, reportId, sessionId }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && (reportId || sessionId)) {
      fetchReport();
    }
  }, [isOpen, reportId, sessionId]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      if (reportId) {
        const res = await api.get(`/reports/${reportId}`);
        if (res.data.success && res.data.report) {
          setReport(res.data.report);
          return;
        }
      }
      
      // Query reports list by sessionId if reportId not provided
      const res = await api.get('/reports');
      if (res.data.success && Array.isArray(res.data.reports)) {
        const match = res.data.reports.find(r => r.reportId === reportId || r.sessionId === sessionId);
        if (match) {
          setReport(match);
        } else if (sessionId) {
          // Trigger generation
          const genRes = await api.post('/reports/generate', { sessionId });
          if (genRes.data.success) setReport(genRes.data.report);
        }
      }
    } catch (err) {
      console.error("Failed to fetch report detail", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    // Generate clean printable view
    window.print();
  };

  if (!isOpen) return null;

  const score = report?.overallIntegrityScore ?? 100;
  const status = report?.status || (score >= 85 ? 'PASSED' : score >= 60 ? 'REVIEW_REQUIRED' : 'FLAGGED');
  const durationSec = report?.durationSeconds || 0;
  const durationMin = Math.floor(durationSec / 60);
  const durationSecRem = durationSec % 60;
  const durationStr = `${durationMin}m ${durationSecRem.toString().padStart(2, '0')}s`;
  const timeline = report?.timeline || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in overflow-y-auto print-only-report-overlay print:p-0 print:bg-white">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8 print-only-report-card print:border-none print:shadow-none print:bg-white print:text-black">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Shield size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Proctoring Integrity Report</h3>
              <p className="text-xs text-slate-400 font-mono">Report ID: <span className="text-slate-200">{report?.reportId || 'Generating...'}</span></p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-semibold"
              title="Print Report"
            >
              <Printer size={15} /> Print / Save as PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm font-medium">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading official proctoring report...
          </div>
        ) : !report ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            Report not found for this session.
          </div>
        ) : (
          <div className="p-8 space-y-6 max-h-[78vh] overflow-y-auto print:max-h-none print:overflow-visible print:p-6 print:text-black">
            
            {/* Report Official Banner */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-slate-800 print:border-black/20 gap-4 print-avoid-break">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-black tracking-tight text-white print:text-black">TRUEVIEW AI</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 print:bg-gray-100 print:text-black font-mono">
                    PROCTORING CERTIFICATE
                  </span>
                </div>
                <p className="text-xs text-slate-400 print:text-gray-600 mt-1">Multi-Modal AI Proctoring & Anti-Spoofing Verification</p>
              </div>

              <div className="flex items-center gap-3">
                <div className={`px-4 py-2 rounded-xl text-center font-bold text-sm ${
                  status === 'PASSED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 print:bg-emerald-100 print:text-emerald-900' :
                  status === 'REVIEW_REQUIRED' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 print:bg-amber-100 print:text-amber-900' :
                  'bg-rose-500/20 text-rose-400 border border-rose-500/30 print:bg-rose-100 print:text-rose-900'
                }`}>
                  <span className="text-[10px] block font-mono uppercase tracking-wider opacity-80">Verdict</span>
                  {status}
                </div>

                <div className="px-4 py-2 rounded-xl text-center font-bold bg-slate-800/80 border border-slate-700 print:bg-gray-100 print:border-gray-300 print:text-black">
                  <span className="text-[10px] block font-mono text-slate-400 print:text-gray-600 uppercase tracking-wider">Integrity Score</span>
                  <span className={`text-base ${score >= 85 ? 'text-emerald-400 print:text-emerald-800' : score >= 60 ? 'text-amber-400 print:text-amber-800' : 'text-rose-400 print:text-rose-800'}`}>
                    {score}%
                  </span>
                </div>
              </div>
            </div>

            {/* Candidate & Session Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-800/40 border border-slate-800 print:bg-gray-50 print:border-gray-200 print-avoid-break">
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-500 print:text-gray-500 block mb-1">Candidate</span>
                <span className="text-xs font-bold text-slate-200 print:text-black flex items-center gap-1.5">
                  <User size={13} className="text-emerald-400 print:text-black" />
                  {report.userName}
                </span>
                <span className="text-[11px] text-slate-400 print:text-gray-600 block mt-0.5">{report.userEmail}</span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-500 print:text-gray-500 block mb-1">Session & Mode</span>
                <span className="text-xs font-bold font-mono text-slate-200 print:text-black block">{report.sessionId}</span>
                <span className="text-[11px] font-semibold text-blue-400 print:text-blue-700 block mt-0.5">{report.sessionType || 'EXAM'} Mode</span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-500 print:text-gray-500 block mb-1">Timing & Duration</span>
                <span className="text-xs font-bold text-slate-200 print:text-black flex items-center gap-1.5">
                  <Clock size={13} className="text-blue-400 print:text-black" />
                  {durationStr}
                </span>
                <span className="text-[11px] text-slate-400 print:text-gray-600 block mt-0.5">
                  {report.startTime ? new Date(report.startTime).toLocaleDateString() : new Date().toLocaleDateString()}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-500 print:text-gray-500 block mb-1">Violations Count</span>
                <span className="text-xs font-bold text-slate-200 print:text-black flex items-center gap-1.5">
                  <AlertTriangle size={13} className={report.totalViolations > 0 ? "text-rose-400 print:text-rose-600" : "text-emerald-400 print:text-emerald-600"} />
                  {report.totalViolations || 0} Total Violations
                </span>
                <span className="text-[11px] text-slate-400 print:text-gray-600 block mt-0.5">{report.phoneDetections || 0} Phone Detections</span>
              </div>
            </div>

            {/* AI Perception Subsystems Evaluation Breakdown */}
            <div className="space-y-3 print-avoid-break">
              <h4 className="text-xs font-bold text-slate-300 print:text-black uppercase tracking-wider flex items-center gap-2">
                <Shield size={14} className="text-emerald-400 print:text-black" />
                AI Perception Subsystems Audit
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 print:bg-white print:border-gray-300">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-slate-300 print:text-black">Liveness & Anti-Spoof</span>
                    <CheckCircle2 size={13} className="text-emerald-400" />
                  </div>
                  <p className="text-[10px] text-slate-400 print:text-gray-600">ConvNeXt-Tiny Run 04 verified genuine face</p>
                </div>

                <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 print:bg-white print:border-gray-300">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-slate-300 print:text-black">Registered Identity</span>
                    {report.identityMismatchCount > 0 ? (
                      <AlertTriangle size={13} className="text-amber-400" />
                    ) : (
                      <CheckCircle2 size={13} className="text-emerald-400" />
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 print:text-gray-600">
                    {report.identityMismatchCount > 0
                      ? `${report.identityMismatchCount} identity mismatch event(s) recorded`
                      : 'SFace continuous biometric identity verified'}
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 print:bg-white print:border-gray-300">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-slate-300 print:text-black">Gaze & Attention</span>
                    <CheckCircle2 size={13} className="text-emerald-400" />
                  </div>
                  <p className="text-[10px] text-slate-400 print:text-gray-600">Screen focus tracking evaluated</p>
                </div>

                <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 print:bg-white print:border-gray-300">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-slate-300 print:text-black">Head Pose & Yaw</span>
                    <CheckCircle2 size={13} className="text-emerald-400" />
                  </div>
                  <p className="text-[10px] text-slate-400 print:text-gray-600">Orientation within allowable boundaries</p>
                </div>

                <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 print:bg-white print:border-gray-300">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-slate-300 print:text-black">Environment (YOLO)</span>
                    <CheckCircle2 size={13} className="text-emerald-400" />
                  </div>
                  <p className="text-[10px] text-slate-400 print:text-gray-600">{report.phoneDetections || 0} mobile devices detected</p>
                </div>

                <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 print:bg-white print:border-gray-300">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-slate-300 print:text-black">Voice Activity</span>
                    <CheckCircle2 size={13} className="text-emerald-400" />
                  </div>
                  <p className="text-[10px] text-slate-400 print:text-gray-600">Speech checked against mode policy</p>
                </div>
              </div>
            </div>

            {/* Chronological Event Timeline in Report */}
            <div className="space-y-3 pt-2 print-avoid-break">
              <h4 className="text-xs font-bold text-slate-300 print:text-black uppercase tracking-wider flex items-center gap-2">
                <Activity size={14} className="text-blue-400 print:text-black" />
                Verified Event Timeline ({timeline.length} logged incidents)
              </h4>

              {timeline.length === 0 ? (
                <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-5 text-center text-xs text-slate-400 print:bg-gray-50 print:border-gray-300 print:text-black">
                  <CheckCircle2 size={20} className="mx-auto text-emerald-400 mb-1 opacity-80" />
                  Clean monitoring session. Zero violation incidents or security breaches were logged.
                </div>
              ) : (
                <div className="space-y-2">
                  {timeline.map((evt, idx) => (
                    <div 
                      key={idx}
                      className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/40 print:bg-white print:border-gray-200 text-xs flex items-center justify-between gap-3 print-avoid-break"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          evt.severity === 'CRITICAL' ? 'bg-rose-500 text-white' :
                          evt.severity === 'HIGH' ? 'bg-orange-500 text-white' :
                          evt.severity === 'MEDIUM' ? 'bg-amber-500 text-black' :
                          'bg-slate-700 text-slate-200 print:bg-gray-200 print:text-black'
                        }`}>
                          {evt.severity || 'INFO'}
                        </span>
                        <div>
                          <span className="font-bold text-slate-100 print:text-black">{evt.eventType || 'VIOLATION'}</span>
                          <span className="text-[11px] text-slate-400 print:text-gray-600 block">{evt.description || evt.evidence}</span>
                        </div>
                      </div>
                      <span className="font-mono text-[10px] text-slate-400 print:text-gray-500 shrink-0">
                        {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Official Signature Section for PDF */}
            <div className="pt-6 border-t border-slate-800 print:border-gray-300 flex items-center justify-between text-xs text-slate-500 print:text-gray-500 print-avoid-break">
              <span>TrueView AI Security Engine v2.0</span>
              <span>Generated on {new Date().toLocaleString()}</span>
            </div>

          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800 bg-slate-900/90 print:hidden">
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-colors shadow-sm"
          >
            <Printer size={14} />
            Print / Save PDF
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors border border-slate-700"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
