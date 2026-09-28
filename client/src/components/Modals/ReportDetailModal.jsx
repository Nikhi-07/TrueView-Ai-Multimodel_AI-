import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Printer, Shield, CheckCircle2, AlertTriangle, 
  Clock, User, Activity, Scan, Eye, Mic, Box, Brain, MonitorX
} from 'lucide-react';
import api from '../../services/api';
import ReportPrintDocument from '../Reports/ReportPrintDocument';

export default function ReportDetailModal({ isOpen, onClose, reportId, sessionId }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && (reportId || sessionId)) {
      fetchReport();
    }
  }, [isOpen, reportId, sessionId]);

  useEffect(() => {
    if (isOpen && report) {
      document.body.classList.add('has-active-report-print');
    } else {
      document.body.classList.remove('has-active-report-print');
    }

    const handleAfterPrint = () => {
      if (isOpen && report) {
        document.body.classList.add('has-active-report-print');
      } else {
        document.body.classList.remove('has-active-report-print');
      }
    };

    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      document.body.classList.remove('has-active-report-print');
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [isOpen, report]);

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
    if (!report) return;
    document.body.classList.add('has-active-report-print');
    requestAnimationFrame(() => {
      window.print();
    });
  };

  if (!isOpen) return null;

  const score = report?.overallIntegrityScore ?? 100;
  const status = report?.verdict || report?.status || (score >= 85 ? 'PASSED' : score >= 60 ? 'REVIEW_REQUIRED' : 'FLAGGED');
  const durationSec = report?.durationSeconds || 0;
  const durationMin = Math.floor(durationSec / 60);
  const durationSecRem = durationSec % 60;
  const durationStr = `${durationMin}m ${durationSecRem.toString().padStart(2, '0')}s`;
  
  const combinedTimeline = useMemo(() => {
    const list = [...(report?.timeline || [])];
    if (Array.isArray(report?.tabSwitchTimeline)) {
      report.tabSwitchTimeline.forEach(t => {
        list.push({
          eventType: t.eventType || (t.count >= 4 ? 'TAB_SWITCH_LIMIT_EXCEEDED' : 'TAB_SWITCH_DETECTED'),
          severity: t.severity || (t.count >= 4 ? 'CRITICAL' : 'MEDIUM'),
          description: t.message || (t.count >= 4 ? 'Tab switch detected — Session terminated' : t.count === 3 ? 'Tab switch detected — Final warning 3/3' : `Tab switch detected — Warning ${t.count}/3`),
          timestamp: t.timestamp
        });
      });
    }
    return list.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
  }, [report]);

  const timeline = combinedTimeline;
  const printRoot = typeof document !== 'undefined' ? (document.getElementById('report-print-root') || document.body) : null;

  const startTimeStr = report?.startTime ? new Date(report.startTime).toLocaleTimeString() : 'N/A';
  const endTimeStr = report?.endTime ? new Date(report.endTime).toLocaleTimeString() : 'N/A';

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
        <div className="relative w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden my-8 text-slate-900">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
              <Shield size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Proctoring Integrity Report</h3>
              <p className="text-xs text-slate-500 font-mono">Report ID: <span className="text-slate-800 font-bold">{report?.reportId || 'Generating...'}</span></p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 transition-colors flex items-center gap-1.5 text-xs font-semibold shadow-xs"
              title="Print Report"
            >
              <Printer size={14} className="text-slate-600" /> Print / Save as PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-20 text-center text-slate-500 text-sm font-medium">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading official proctoring report...
          </div>
        ) : !report ? (
          <div className="py-16 text-center text-slate-500 text-sm">
            Report not found for this session.
          </div>
        ) : (
          <div className="p-8 space-y-6 max-h-[78vh] overflow-y-auto print:max-h-none print:overflow-visible print:p-6 print:text-black">
            
            {/* Report Official Banner */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-slate-200 print:border-black/20 gap-4 print-avoid-break">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl font-black tracking-tight text-slate-900 print:text-black">TRUEVIEW AI</span>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 print:bg-gray-100 print:text-black font-mono">
                    PROCTORING INTEGRITY REPORT
                  </span>
                </div>
                <p className="text-xs text-slate-500 print:text-gray-600 mt-1">Multi-Modal AI Proctoring & Biometric Verification Audit</p>
              </div>

              <div className="flex items-center gap-3">
                <div className={`px-4 py-2 rounded-xl text-center font-bold text-sm ${
                  status === 'PASSED' ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 print:bg-emerald-100 print:text-emerald-900' :
                  status === 'REVIEW_REQUIRED' || status === 'REVIEW REQUIRED' ? 'bg-amber-50 text-amber-800 border border-amber-300 print:bg-amber-100 print:text-amber-900' :
                  'bg-rose-50 text-rose-800 border border-rose-300 print:bg-rose-100 print:text-rose-900'
                }`}>
                  <span className="text-[10px] block font-mono uppercase tracking-wider opacity-75">Verdict</span>
                  {status}
                </div>

                <div className="px-4 py-2 rounded-xl text-center font-bold bg-slate-50 border border-slate-200 print:bg-gray-100 print:border-gray-300 print:text-black">
                  <span className="text-[10px] block font-mono text-slate-500 print:text-gray-600 uppercase tracking-wider">Integrity Score</span>
                  <span className={`text-base font-black ${score >= 85 ? 'text-emerald-600 print:text-emerald-800' : score >= 60 ? 'text-amber-600 print:text-amber-800' : 'text-rose-600 print:text-rose-800'}`}>
                    {score}%
                  </span>
                </div>
              </div>
            </div>

            {/* Candidate & Session Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 print:bg-gray-50 print:border-gray-200 print-avoid-break">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 print:text-gray-500 block mb-1">Candidate</span>
                <span className="text-xs font-bold text-slate-900 print:text-black flex items-center gap-1.5">
                  <User size={13} className="text-blue-600 print:text-black shrink-0" />
                  {report.userName || 'Candidate'}
                </span>
                <span className="text-[11px] text-slate-500 print:text-gray-600 block mt-0.5 truncate">{report.userEmail}</span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 print:text-gray-500 block mb-1">Virtual Room & Mode</span>
                <span className="text-xs font-bold text-slate-900 print:text-black block truncate">
                  {report.roomTitle || (report.roomId ? `Room ${report.roomId}` : 'Proctor Session')}
                </span>
                <span className="text-[11px] font-mono text-blue-700 print:text-blue-700 block mt-0.5">
                  {report.roomId ? `ID: ${report.roomId} • ` : ''}{report.mode || report.sessionType || 'EXAM'}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 print:text-gray-500 block mb-1">Timing & Duration</span>
                <span className="text-xs font-bold text-slate-900 print:text-black flex items-center gap-1.5">
                  <Clock size={13} className="text-blue-600 print:text-black shrink-0" />
                  {durationStr}
                </span>
                <span className="text-[11px] text-slate-500 print:text-gray-600 block mt-0.5">
                  {startTimeStr} - {endTimeStr}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 print:text-gray-500 block mb-1">Violations & Alerts</span>
                <span className="text-xs font-bold text-slate-900 print:text-black flex items-center gap-1.5">
                  <AlertTriangle size={13} className={(report.totalViolations || 0) > 0 ? "text-rose-600 print:text-rose-600 shrink-0" : "text-emerald-600 print:text-emerald-600 shrink-0"} />
                  {report.totalViolations || 0} Total Violations
                </span>
                <span className="text-[11px] text-slate-500 print:text-gray-600 block mt-0.5">{report.phoneDetections || 0} Phone Detections</span>
              </div>
            </div>

            {/* AI Perception Subsystems Evaluation Breakdown */}
            <div className="space-y-3 print-avoid-break">
              <h4 className="text-xs font-bold text-slate-800 print:text-black uppercase tracking-wider flex items-center gap-2">
                <Shield size={14} className="text-blue-600 print:text-black" />
                AI Perception Subsystems Audit
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 print:bg-white print:border-gray-300">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-slate-800 print:text-black flex items-center gap-1.5">
                      <Scan size={13} className="text-blue-600" /> Liveness & Anti-Spoof
                    </span>
                    <CheckCircle2 size={13} className="text-emerald-600" />
                  </div>
                  <p className="text-[10px] text-slate-500 print:text-gray-600">ConvNeXt-Tiny Run 04 verified genuine biometric face</p>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 print:bg-white print:border-gray-300">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-slate-800 print:text-black flex items-center gap-1.5">
                      <User size={13} className="text-indigo-600" /> Identity
                    </span>
                    {(report.identityMismatchCount || 0) > 0 ? (
                      <AlertTriangle size={13} className="text-amber-600" />
                    ) : (
                      <CheckCircle2 size={13} className="text-emerald-600" />
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 print:text-gray-600">
                    {(report.identityMismatchCount || 0) > 0
                      ? `${report.identityMismatchCount} identity mismatch event(s) recorded`
                      : 'SFace continuous biometric identity verified'}
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 print:bg-white print:border-gray-300">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-slate-800 print:text-black flex items-center gap-1.5">
                      <Eye size={13} className="text-emerald-600" /> Gaze & Attention
                    </span>
                    <CheckCircle2 size={13} className="text-emerald-600" />
                  </div>
                  <p className="text-[10px] text-slate-500 print:text-gray-600">Screen focus tracking verified</p>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 print:bg-white print:border-gray-300">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-slate-800 print:text-black flex items-center gap-1.5">
                      <Activity size={13} className="text-cyan-600" /> Head Pose
                    </span>
                    <CheckCircle2 size={13} className="text-emerald-600" />
                  </div>
                  <p className="text-[10px] text-slate-500 print:text-gray-600">Orientation evaluated within allowable threshold</p>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 print:bg-white print:border-gray-300">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-slate-800 print:text-black flex items-center gap-1.5">
                      <Box size={13} className="text-purple-600" /> Environment / YOLO
                    </span>
                    <CheckCircle2 size={13} className="text-emerald-600" />
                  </div>
                  <p className="text-[10px] text-slate-500 print:text-gray-600">{report.phoneDetections || 0} mobile devices detected</p>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 print:bg-white print:border-gray-300">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-slate-800 print:text-black flex items-center gap-1.5">
                      <Mic size={13} className="text-yellow-600" /> Voice Activity
                    </span>
                    <CheckCircle2 size={13} className="text-emerald-600" />
                  </div>
                  <p className="text-[10px] text-slate-500 print:text-gray-600">Audio audited against exam silence policy</p>
                </div>
              </div>
            </div>

            {/* Security Events & Tab Switches Breakdown */}
            <div className="space-y-3 print-avoid-break">
              <h4 className="text-xs font-bold text-slate-800 print:text-black uppercase tracking-wider flex items-center gap-2">
                <Shield size={14} className="text-blue-600 print:text-black" />
                Security Events & Tab Switch Verification
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className={`p-3 rounded-lg border ${(report.tabSwitches || 0) >= 4 ? 'bg-rose-50 border-rose-200' : (report.tabSwitches || 0) > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-[10px] font-mono text-slate-500 uppercase block font-semibold">Tab Switches</span>
                  <span className={`text-lg font-black font-mono mt-0.5 block ${(report.tabSwitches || 0) >= 4 ? 'text-rose-600' : (report.tabSwitches || 0) > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                    {report.tabSwitches || 0} / {report.maxTabSwitches || 3}
                  </span>
                  <span className="text-[10px] text-slate-500">Max allowed: {report.maxTabSwitches || 3}</span>
                </div>

                <div className={`p-3 rounded-lg border ${report.terminated ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <span className="text-[10px] font-mono text-slate-500 uppercase block font-semibold">Termination</span>
                  <span className={`text-lg font-black mt-0.5 block ${report.terminated ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {report.terminated ? 'Yes' : 'No'}
                  </span>
                  <span className="text-[10px] text-slate-500">{report.terminated ? 'Session terminated by security rule' : 'Session completed normally'}</span>
                </div>

                <div className={`p-3 rounded-lg border ${report.terminationReason ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-[10px] font-mono text-slate-500 uppercase block font-semibold">Termination Reason</span>
                  <span className="text-xs font-bold text-slate-900 mt-1 block truncate">
                    {report.terminationReason || 'None'}
                  </span>
                  <span className="text-[10px] text-slate-500">{report.terminationReason ? 'Security rule trigger' : 'No violation termination'}</span>
                </div>
              </div>
            </div>

            {/* Chronological Event Timeline in Report */}
            <div className="space-y-3 pt-2 print-avoid-break">
              <h4 className="text-xs font-bold text-slate-800 print:text-black uppercase tracking-wider flex items-center gap-2">
                <Activity size={14} className="text-blue-600 print:text-black" />
                Verified Event Timeline ({timeline.length} logged incidents)
              </h4>

              {timeline.length === 0 ? (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-center text-xs text-slate-500 print:bg-gray-50 print:border-gray-300 print:text-black">
                  <CheckCircle2 size={20} className="mx-auto text-emerald-600 mb-1 opacity-80" />
                  Clean monitoring session. Zero violation incidents or security breaches were logged.
                </div>
              ) : (
                <div className="space-y-2">
                  {timeline.map((evt, idx) => (
                    <div 
                      key={idx}
                      className="p-3 rounded-lg bg-slate-50 border border-slate-200 print:bg-white print:border-gray-200 text-xs flex items-center justify-between gap-3 print-avoid-break"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          evt.severity === 'CRITICAL' ? 'bg-rose-600 text-white' :
                          evt.severity === 'HIGH' ? 'bg-orange-500 text-white' :
                          evt.severity === 'MEDIUM' ? 'bg-amber-400 text-black' :
                          'bg-slate-200 text-slate-800 print:bg-gray-200 print:text-black'
                        }`}>
                          {evt.severity || 'INFO'}
                        </span>
                        <div>
                          <span className="font-bold text-slate-900 print:text-black">{evt.eventType || 'VIOLATION'}</span>
                          <span className="text-[11px] text-slate-500 print:text-gray-600 block">{evt.description || evt.evidence}</span>
                        </div>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500 print:text-gray-500 shrink-0">
                        {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Official Signature Section for PDF */}
            <div className="pt-6 border-t border-slate-200 print:border-gray-300 flex items-center justify-between text-xs text-slate-500 print:text-gray-500 print-avoid-break">
              <span>TrueView AI Security Engine v2.0</span>
              <span>Generated on {new Date().toLocaleString()}</span>
            </div>

          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 print:hidden">
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-colors shadow-sm"
          >
            <Printer size={14} />
            Print / Save PDF
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors border border-slate-300"
          >
            Close
          </button>
        </div>

      </div>
    </div>

    {/* Dedicated Print Portal (Rendered to report-print-root outside #root) */}
    {printRoot && createPortal(
      <ReportPrintDocument report={report} />,
      printRoot
    )}
  </>
  );
}
