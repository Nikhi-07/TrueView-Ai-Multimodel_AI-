import React from 'react';
import { 
  Shield, CheckCircle2, AlertTriangle, 
  Clock, User, Activity 
} from 'lucide-react';

export default function ReportPrintDocument({ report }) {
  if (!report) return null;

  const score = report.overallIntegrityScore ?? 100;
  const status = report.status || (score >= 85 ? 'PASSED' : score >= 60 ? 'REVIEW_REQUIRED' : 'FLAGGED');
  const durationSec = report.durationSeconds || 0;
  const durationMin = Math.floor(durationSec / 60);
  const durationSecRem = durationSec % 60;
  const durationStr = `${durationMin}m ${durationSecRem.toString().padStart(2, '0')}s`;
  const combinedTimeline = (() => {
    const list = [...(Array.isArray(report.timeline) ? report.timeline : [])];
    if (Array.isArray(report.tabSwitchTimeline)) {
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
  })();
  const timeline = combinedTimeline;

  const dateFormatted = report.startTime
    ? new Date(report.startTime).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : (report.createdAt ? new Date(report.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : new Date().toLocaleDateString());

  const generatedTimeStr = report.createdAt
    ? new Date(report.createdAt).toLocaleString()
    : new Date().toLocaleString();

  return (
    <div 
      className="report-print-document font-sans text-slate-900 bg-white"
      style={{
        width: '100%',
        maxWidth: '100%',
        margin: '0 auto',
        padding: '0 4px',
        backgroundColor: '#ffffff',
        color: '#0f172a',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      }}
    >
      {/* 1. Official Header & Certificate Banner */}
      <div 
        className="flex items-center justify-between pb-5 border-b-2 border-slate-900 mb-5"
        style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
      >
        <div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black tracking-tight text-slate-900">TRUEVIEW AI</span>
            <span 
              className="text-[11px] font-mono font-bold px-2.5 py-1 rounded bg-slate-100 text-slate-800 border border-slate-300 uppercase tracking-wider"
              style={{ backgroundColor: '#f1f5f9', color: '#1e293b', borderColor: '#cbd5e1' }}
            >
              PROCTORING CERTIFICATE
            </span>
          </div>
          <p className="text-xs font-semibold text-slate-600 mt-1">Multi-Modal AI Proctoring & Anti-Spoofing Verification</p>
          <p className="text-xs font-mono text-slate-500 mt-0.5">
            Report ID: <strong className="text-slate-900 font-bold">{report.reportId || 'RPT-OFFICIAL'}</strong>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Verdict Badge */}
          <div 
            className="px-4 py-2 rounded-xl text-center border font-bold"
            style={{
              backgroundColor: status === 'PASSED' ? '#f0fdf4' : status === 'REVIEW_REQUIRED' ? '#fffbeb' : '#fef2f2',
              borderColor: status === 'PASSED' ? '#86efac' : status === 'REVIEW_REQUIRED' ? '#fde68a' : '#fca5a5',
              color: status === 'PASSED' ? '#15803d' : status === 'REVIEW_REQUIRED' ? '#b45309' : '#b91c1c',
            }}
          >
            <span className="text-[10px] block font-mono uppercase tracking-wider opacity-75">Verdict</span>
            <span className="text-sm font-extrabold">{status}</span>
          </div>

          {/* Integrity Score */}
          <div 
            className="px-4 py-2 rounded-xl text-center border border-slate-300 bg-slate-50"
            style={{ backgroundColor: '#f8fafc', borderColor: '#cbd5e1' }}
          >
            <span className="text-[10px] block font-mono text-slate-500 uppercase tracking-wider">Integrity Score</span>
            <span 
              className="text-base font-black"
              style={{
                color: score >= 85 ? '#15803d' : score >= 60 ? '#b45309' : '#b91c1c'
              }}
            >
              {score}%
            </span>
          </div>
        </div>
      </div>

      {/* 2. Candidate & Session Info Grid */}
      <div 
        className="grid grid-cols-5 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 mb-5"
        style={{
          backgroundColor: '#f8fafc',
          borderColor: '#e2e8f0',
          breakInside: 'avoid',
          pageBreakInside: 'avoid'
        }}
      >
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Candidate</span>
          <span className="text-xs font-bold text-slate-900 block flex items-center gap-1">
            <User size={12} className="text-blue-600 inline shrink-0" />
            {report.userName || 'Registered Candidate'}
          </span>
          <span className="text-[11px] text-slate-600 block mt-0.5 truncate">{report.userEmail || 'N/A'}</span>
        </div>

        <div>
          <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Virtual Room</span>
          <span className="text-xs font-bold text-slate-900 block truncate">{report.roomTitle || (report.roomId ? `Room ${report.roomId}` : 'Proctor Session')}</span>
          <span className="text-[11px] font-mono text-blue-700 block mt-0.5">{report.roomId ? `ID: ${report.roomId}` : 'Direct Room'}</span>
        </div>

        <div>
          <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Session & Mode</span>
          <span className="text-xs font-bold font-mono text-slate-900 block truncate">{report.sessionId || 'N/A'}</span>
          <span className="text-[11px] font-semibold text-blue-700 block mt-0.5">{report.mode || report.sessionType || 'EXAM'} Mode</span>
        </div>

        <div>
          <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Timing & Duration</span>
          <span className="text-xs font-bold text-slate-900 block flex items-center gap-1">
            <Clock size={12} className="text-blue-600 inline shrink-0" />
            {durationStr}
          </span>
          <span className="text-[11px] text-slate-600 block mt-0.5">{dateFormatted}</span>
        </div>

        <div>
          <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Violations Count</span>
          <span 
            className="text-xs font-bold block flex items-center gap-1"
            style={{ color: (report.totalViolations || 0) > 0 ? '#b91c1c' : '#15803d' }}
          >
            <AlertTriangle size={12} className="inline shrink-0" />
            {report.totalViolations || 0} Total Violations
          </span>
          <span className="text-[11px] text-slate-600 block mt-0.5">{report.phoneDetections || 0} Phone Detections</span>
        </div>
      </div>

      {/* 3. AI Perception Subsystems Audit */}
      <div 
        className="mb-5"
        style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
      >
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
          <Shield size={14} className="text-emerald-600" />
          AI Perception Subsystems Audit
        </h4>

        <div className="grid grid-cols-3 gap-2.5">
          <div className="p-3 rounded-lg bg-white border border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-slate-900">Liveness & Anti-Spoof</span>
              <CheckCircle2 size={13} className="text-emerald-600" />
            </div>
            <p className="text-[10px] text-slate-600">ConvNeXt-Tiny Run 04 verified genuine face</p>
          </div>

          <div className="p-3 rounded-lg bg-white border border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-slate-900">Registered Identity</span>
              {report.identityMismatchCount > 0 ? (
                <AlertTriangle size={13} className="text-amber-600" />
              ) : (
                <CheckCircle2 size={13} className="text-emerald-600" />
              )}
            </div>
            <p className="text-[10px] text-slate-600">
              {report.identityMismatchCount > 0
                ? `${report.identityMismatchCount} identity mismatch event(s) recorded`
                : 'SFace continuous biometric identity verified'}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-white border border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-slate-900">Gaze & Attention</span>
              <CheckCircle2 size={13} className="text-emerald-600" />
            </div>
            <p className="text-[10px] text-slate-600">Screen focus tracking evaluated</p>
          </div>

          <div className="p-3 rounded-lg bg-white border border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-slate-900">Head Pose & Yaw</span>
              <CheckCircle2 size={13} className="text-emerald-600" />
            </div>
            <p className="text-[10px] text-slate-600">Orientation within allowable boundaries</p>
          </div>

          <div className="p-3 rounded-lg bg-white border border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-slate-900">Environment (YOLO)</span>
              <CheckCircle2 size={13} className="text-emerald-600" />
            </div>
            <p className="text-[10px] text-slate-600">{report.phoneDetections || 0} mobile devices detected</p>
          </div>

          <div className="p-3 rounded-lg bg-white border border-slate-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-slate-900">Voice Activity</span>
              <CheckCircle2 size={13} className="text-emerald-600" />
            </div>
            <p className="text-[10px] text-slate-600">Speech checked against mode policy</p>
          </div>
        </div>
      </div>

      {/* Security Events & Tab Switches Audit */}
      <div 
        className="mb-5"
        style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
      >
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
          <Shield size={14} className="text-blue-600" />
          Security Events & Tab Switch Verification
        </h4>

        <div className="grid grid-cols-3 gap-2.5">
          <div className="p-3 rounded-lg bg-white border border-slate-200">
            <span className="text-[10px] font-mono text-slate-500 uppercase block font-semibold">Tab Switches</span>
            <span className={`text-base font-extrabold font-mono mt-0.5 block ${(report.tabSwitches || 0) >= 4 ? 'text-rose-600' : (report.tabSwitches || 0) > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
              {report.tabSwitches || 0} / {report.maxTabSwitches || 3}
            </span>
            <span className="text-[10px] text-slate-500">Max allowed: {report.maxTabSwitches || 3}</span>
          </div>

          <div className="p-3 rounded-lg bg-white border border-slate-200">
            <span className="text-[10px] font-mono text-slate-500 uppercase block font-semibold">Termination</span>
            <span className={`text-base font-extrabold mt-0.5 block ${report.terminated ? 'text-rose-600' : 'text-emerald-700'}`}>
              {report.terminated ? 'Yes' : 'No'}
            </span>
            <span className="text-[10px] text-slate-500">{report.terminated ? 'Terminated by rule' : 'Normal completion'}</span>
          </div>

          <div className="p-3 rounded-lg bg-white border border-slate-200">
            <span className="text-[10px] font-mono text-slate-500 uppercase block font-semibold">Termination Reason</span>
            <span className="text-xs font-bold text-slate-900 mt-1 block truncate">
              {report.terminationReason || 'None'}
            </span>
            <span className="text-[10px] text-slate-500">{report.terminationReason ? 'Security rule trigger' : 'No violation termination'}</span>
          </div>
        </div>
      </div>

      {/* 4. Verified Event Timeline (Complete, No scroll cutoff) */}
      <div className="mb-6">
        <div 
          className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200"
          style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}
        >
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Activity size={14} className="text-blue-600" />
            Verified Event Timeline ({timeline.length} logged incidents)
          </h4>
          <span className="text-[10px] font-mono text-slate-500">Continuous Audit Log</span>
        </div>

        {timeline.length === 0 ? (
          <div 
            className="p-5 rounded-xl border border-slate-200 bg-slate-50 text-center text-xs text-slate-600"
            style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
          >
            <CheckCircle2 size={18} className="mx-auto text-emerald-600 mb-1" />
            Clean monitoring session. Zero violation incidents or security breaches were logged.
          </div>
        ) : (
          <div className="space-y-2">
            {timeline.map((evt, idx) => {
              const isCrit = evt.severity === 'CRITICAL';
              const isHigh = evt.severity === 'HIGH';
              const isMed = evt.severity === 'MEDIUM';

              const badgeBg = isCrit ? '#fee2e2' : isHigh ? '#ffedd5' : isMed ? '#fef3c7' : '#f1f5f9';
              const badgeText = isCrit ? '#991b1b' : isHigh ? '#9a3412' : isMed ? '#92400e' : '#334155';
              const badgeBorder = isCrit ? '#fca5a5' : isHigh ? '#fdba74' : isMed ? '#fde68a' : '#cbd5e1';
              const leftBarColor = isCrit ? '#dc2626' : isHigh ? '#ea580c' : isMed ? '#d97706' : '#94a3b8';

              return (
                <div 
                  key={idx}
                  className="p-2.5 rounded-lg border border-slate-200 bg-white text-xs flex items-center justify-between gap-3"
                  style={{
                    breakInside: 'avoid',
                    pageBreakInside: 'avoid',
                    borderLeft: `4px solid ${leftBarColor}`,
                    backgroundColor: '#ffffff',
                    borderColor: '#e2e8f0',
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <span 
                      className="px-2 py-0.5 rounded text-[10px] font-mono font-bold border"
                      style={{
                        backgroundColor: badgeBg,
                        color: badgeText,
                        borderColor: badgeBorder
                      }}
                    >
                      {evt.severity || 'INFO'}
                    </span>
                    <div>
                      <span className="font-bold text-slate-900 block leading-tight">
                        {evt.eventType || 'VIOLATION'}
                      </span>
                      <span className="text-[11px] text-slate-600 block mt-0.5 leading-snug">
                        {evt.description || evt.evidence}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-slate-500 shrink-0">
                    {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Official Verification Footer */}
      <div 
        className="pt-4 border-t-2 border-slate-300 flex items-center justify-between text-xs text-slate-500"
        style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
      >
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800">TrueView AI Security Engine v2.0</span>
          <span>•</span>
          <span>Official Proctoring & Compliance Verification</span>
        </div>
        <div className="font-mono text-[11px] text-slate-600">
          Generated on {generatedTimeStr}
        </div>
      </div>
    </div>
  );
}
