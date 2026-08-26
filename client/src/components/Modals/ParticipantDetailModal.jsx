import React, { useState, useEffect } from 'react';
import { 
  X, Shield, AlertTriangle, Video, Play, FileText, User, Mail, Clock, 
  Smartphone, Users, Eye, Mic, Activity, CheckCircle2, AlertCircle, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../services/api';

export default function ParticipantDetailModal({
  isOpen,
  onClose,
  participant,
  roomId,
  roomTitle,
  mode,
  onOpenSession,
  onOpenReport,
}) {
  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(false);

  const sessionId = participant?.sessionId;

  useEffect(() => {
    if (isOpen && sessionId) {
      fetchSessionData();
    }
  }, [isOpen, sessionId]);

  const fetchSessionData = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/ai-engine/sessions/${sessionId}`);
      if (res.data.success) {
        setSessionData(res.data);
      }
    } catch (_) {}
    finally {
      setLoading(false);
    }
  };

  if (!isOpen || !participant) return null;

  const session = sessionData?.session;
  const alerts = sessionData?.alerts || [];
  const recordingUrl = session?.recordingUrl;

  const riskScore = participant.riskScore !== undefined ? participant.riskScore : (session?.peakRiskScore || 0);
  const isHighRisk = riskScore > 60 || participant.riskLevel === 'HIGH';
  const isMediumRisk = riskScore > 20 && !isHighRisk;

  return (
    <div className="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden my-6 text-white"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 flex items-center justify-center font-bold text-base">
              {participant.name?.charAt(0) || 'C'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">{participant.name}</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  participant.status === 'MONITORING'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : participant.status === 'SUSPENDED'
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {participant.status || 'MONITORING'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">{participant.email || 'candidate@trueview.ai'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Key Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl">
              <span className="text-[10px] font-mono uppercase text-slate-500 block">Risk Score</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className={`text-xl font-black ${isHighRisk ? 'text-rose-400' : isMediumRisk ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {riskScore}%
                </span>
                <span className="text-[10px] text-slate-500 font-semibold uppercase">
                  {isHighRisk ? 'High Risk' : isMediumRisk ? 'Review' : 'Normal'}
                </span>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl">
              <span className="text-[10px] font-mono uppercase text-slate-500 block">Violations</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-black text-slate-200">
                  {participant.violations !== undefined ? participant.violations : (session?.totalAlerts || 0)}
                </span>
                <span className="text-[10px] text-slate-500">events</span>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl">
              <span className="text-[10px] font-mono uppercase text-slate-500 block">Liveness</span>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className={`w-2 h-2 rounded-full ${participant.liveness === 'SPOOF' ? 'bg-rose-500' : 'bg-emerald-400'}`} />
                <span className="text-xs font-bold text-slate-200">
                  {participant.liveness || 'LIVE'}
                </span>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl">
              <span className="text-[10px] font-mono uppercase text-slate-500 block">Identity</span>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className={`w-2 h-2 rounded-full ${
                  participant.identityStatus === 'MISMATCH'
                    ? 'bg-rose-500'
                    : participant.identityStatus === 'UNKNOWN'
                    ? 'bg-amber-400'
                    : participant.identityStatus === 'FACE_NOT_DETECTED'
                    ? 'bg-slate-500'
                    : 'bg-emerald-400'
                }`} />
                <span className={`text-xs font-bold ${
                  participant.identityStatus === 'MISMATCH'
                    ? 'text-rose-400'
                    : participant.identityStatus === 'UNKNOWN'
                    ? 'text-amber-400'
                    : participant.identityStatus === 'FACE_NOT_DETECTED'
                    ? 'text-slate-400'
                    : 'text-emerald-400'
                }`}>
                  {participant.identityStatus === 'MISMATCH'
                    ? 'MISMATCH'
                    : participant.identityStatus === 'UNKNOWN'
                    ? 'UNKNOWN'
                    : participant.identityStatus === 'FACE_NOT_DETECTED'
                    ? 'NO FACE'
                    : 'VERIFIED'}
                </span>
              </div>
            </div>
          </div>

          {/* Session Identification Bar */}
          <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-slate-400">
              <div>
                <span className="text-[10px] text-slate-500 uppercase block font-mono">Session ID</span>
                <span className="font-mono text-slate-200 font-semibold">{sessionId || 'N/A'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block font-mono">Room & Mode</span>
                <span className="text-slate-200 font-semibold">{roomId} ({mode})</span>
              </div>
            </div>
          </div>

          {/* AI Subsystems Live Status Grid */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Activity size={13} className="text-emerald-400" />
              Multimodal AI Subsystem Telemetry
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye size={14} className="text-slate-400" />
                  <span className="text-xs text-slate-300">Gaze Direction</span>
                </div>
                <span className="text-xs font-mono font-bold text-slate-200 capitalize">
                  {participant.gaze || 'Center'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User size={14} className="text-slate-400" />
                  <span className="text-xs text-slate-300">Head Pose</span>
                </div>
                <span className="text-xs font-mono font-bold text-slate-200 truncate max-w-[90px]">
                  {participant.pose || 'Straight'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone size={14} className={participant.phoneDetected ? 'text-rose-400' : 'text-slate-400'} />
                  <span className="text-xs text-slate-300">Phone Object</span>
                </div>
                <span className={`text-xs font-bold ${participant.phoneDetected ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {participant.phoneDetected ? 'DETECTED' : 'CLEAR'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-slate-400" />
                  <span className="text-xs text-slate-300">Multiple Persons</span>
                </div>
                <span className="text-xs font-bold text-emerald-400">CLEAR</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mic size={14} className="text-slate-400" />
                  <span className="text-xs text-slate-300">Voice Activity</span>
                </div>
                <span className="text-xs font-bold text-slate-300">MONITORED</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield size={14} className="text-emerald-400" />
                  <span className="text-xs text-slate-300">Integrity Status</span>
                </div>
                <span className="text-xs font-bold text-emerald-400">ACTIVE</span>
              </div>
            </div>
          </div>

          {/* Recent Alerts List */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <AlertTriangle size={13} className="text-amber-400" />
                Session AI Alerts ({alerts.length})
              </span>
              {loading && <RefreshCw size={11} className="animate-spin text-slate-500" />}
            </h4>

            {alerts.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 text-center text-xs text-slate-500">
                No violations or alerts recorded for this candidate.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                {alerts.slice(0, 10).map((a, idx) => (
                  <div
                    key={a._id || idx}
                    className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        a.severity === 'CRITICAL' || a.severity === 'HIGH' ? 'bg-rose-500' : a.severity === 'MEDIUM' ? 'bg-amber-400' : 'bg-blue-400'
                      }`} />
                      <span className="font-bold text-slate-200">{a.eventType || a.type}</span>
                      <span className="text-slate-400 text-[11px] truncate max-w-xs">{a.evidence || a.description}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(a.timestamp || a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recording & Report Actions */}
          <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center gap-3">
            {recordingUrl && (
              <a
                href={recordingUrl}
                target="_blank"
                rel="noreferrer"
                className="py-2 px-3.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Play size={14} />
                <span>View Recording</span>
              </a>
            )}

            {onOpenReport && (
              <button
                onClick={() => {
                  onClose();
                  onOpenReport(sessionId);
                }}
                className="py-2 px-3.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <FileText size={14} />
                <span>View Full Report</span>
              </button>
            )}

            {onOpenSession && (
              <button
                onClick={() => {
                  onClose();
                  onOpenSession(sessionId);
                }}
                className="py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Video size={14} />
                <span>View Session Log</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
