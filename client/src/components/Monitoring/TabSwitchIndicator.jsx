import React from 'react';
import { AlertTriangle, ShieldAlert, CheckCircle2, Clock, MonitorX, Eye } from 'lucide-react';

export default function TabSwitchIndicator({
  count = 0,
  maxAllowed = 3,
  status = 'NORMAL',
  lastEventTime = null,
  mode = 'EXAM',
  compact = false,
}) {
  const isTerminated = count >= 4 || status === 'TERMINATED';
  const isFinalWarning = count === 3 || status === 'FINAL_WARNING';
  const isWarning = count > 0 && count < 3;

  const statusBadge = isTerminated ? (
    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-extrabold bg-rose-600 text-white flex items-center gap-1 shadow-xs">
      <MonitorX size={11} />
      <span>TERMINATED</span>
    </span>
  ) : isFinalWarning ? (
    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-extrabold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 animate-pulse">
      <ShieldAlert size={11} />
      <span>FINAL WARNING</span>
    </span>
  ) : isWarning ? (
    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
      <AlertTriangle size={11} />
      <span>WARNING</span>
    </span>
  ) : (
    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
      <CheckCircle2 size={11} />
      <span>NORMAL</span>
    </span>
  );

  // Compact badge mode (e.g. for header bar or interview status)
  if (compact) {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-xl border text-xs font-mono font-bold transition-all shadow-xs ${
        isTerminated
          ? 'bg-rose-50 border-rose-300 text-rose-700'
          : isFinalWarning
          ? 'bg-rose-50 border-rose-200 text-rose-700 animate-pulse'
          : isWarning
          ? 'bg-amber-50 border-amber-200 text-amber-800'
          : 'bg-slate-50 border-slate-200 text-slate-700'
      }`}>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">TAB SWITCHES:</span>
        <span className={`text-xs font-extrabold font-mono ${
          isTerminated ? 'text-rose-700' : isFinalWarning ? 'text-rose-600' : isWarning ? 'text-amber-600' : 'text-slate-800'
        }`}>
          {count} / {maxAllowed}
        </span>
        {statusBadge}
      </div>
    );
  }

  // Full Box Indicator (Exam HUD / Live Monitoring sidebar)
  return (
    <div className={`p-4 rounded-2xl border transition-all shadow-xs space-y-2.5 ${
      isTerminated
        ? 'bg-rose-50/70 border-rose-300'
        : isFinalWarning
        ? 'bg-rose-50/50 border-rose-200'
        : isWarning
        ? 'bg-amber-50/50 border-amber-200'
        : 'bg-white border-slate-200'
    }`}>
      {/* Title & Status */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
        <span className="text-[10.5px] font-mono font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <Eye size={13} className={isTerminated || isFinalWarning ? 'text-rose-600' : isWarning ? 'text-amber-600' : 'text-slate-500'} />
          <span>TAB SWITCH VERIFICATION</span>
        </span>
        {statusBadge}
      </div>

      {/* Counter Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
          <span className="text-[10px] font-mono text-slate-400 block uppercase">
            {mode === 'EXAM' ? 'Warnings' : 'Tab Switches'}
          </span>
          <span className={`text-base font-extrabold font-mono mt-0.5 block ${
            isTerminated ? 'text-rose-600' : isFinalWarning ? 'text-rose-600' : isWarning ? 'text-amber-600' : 'text-slate-800'
          }`}>
            {count} / {maxAllowed}
          </span>
        </div>

        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
          <span className="text-[10px] font-mono text-slate-400 block uppercase">Status</span>
          <span className="text-xs font-extrabold text-slate-800 mt-1 block">
            {isTerminated ? 'TERMINATED' : isFinalWarning ? 'FINAL WARNING' : isWarning ? 'WARNING' : 'ACTIVE'}
          </span>
        </div>
      </div>

      {/* Contextual Warning Guidance */}
      {isTerminated ? (
        <div className="p-2 rounded-lg bg-rose-100/70 text-rose-800 text-[11px] font-semibold flex items-center gap-1.5">
          <MonitorX size={13} className="shrink-0 text-rose-600" />
          <span>Session terminated. Maximum tab-switch limit exceeded.</span>
        </div>
      ) : isFinalWarning ? (
        <div className="p-2 rounded-lg bg-rose-100/70 text-rose-800 text-[11px] font-semibold flex items-center gap-1.5 animate-pulse">
          <AlertTriangle size={13} className="shrink-0 text-rose-600" />
          <span>One more tab switch will terminate your session.</span>
        </div>
      ) : isWarning ? (
        <div className="p-2 rounded-lg bg-amber-100/70 text-amber-900 text-[11px] font-semibold flex items-center gap-1.5">
          <AlertTriangle size={13} className="shrink-0 text-amber-700" />
          <span>Please return to the examination window.</span>
        </div>
      ) : (
        <div className="text-[11px] text-slate-400 font-medium">
          Remain in the active test window. Leaving the browser tab will record a violation.
        </div>
      )}

      {lastEventTime && (
        <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 pt-1 border-t border-slate-100">
          <Clock size={10} />
          <span>Last Event: {new Date(lastEventTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
      )}
    </div>
  );
}
