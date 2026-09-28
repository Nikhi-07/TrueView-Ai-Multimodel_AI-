import React, { useState, useEffect } from 'react';
import { 
  X, Video, Shield, AlertTriangle, Clock, Calendar, CheckCircle2, 
  FileText, Download, User, Smartphone, Eye, Mic, Activity, Scan, Brain, Box, Info
} from 'lucide-react';
import api from '../../services/api';

export default function SessionDetailModal({ isOpen, onClose, sessionId, onOpenReport }) {
  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && sessionId) {
      fetchSessionDetails();
    }
  }, [isOpen, sessionId]);

  const fetchSessionDetails = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/ai-engine/sessions/${sessionId}`);
      if (res.data.success) {
        setSessionData(res.data);
      }
    } catch (err) {
      console.error("Failed to load session details", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const session = sessionData?.session;
  const timeline = sessionData?.timeline || [];
  const alerts = sessionData?.alerts || [];

  const startTime = session ? new Date(session.startTime || session.createdAt) : new Date();
  const endTime = session?.endTime ? new Date(session.endTime) : null;
  const durationSec = session?.durationSeconds || (endTime ? Math.max(0, Math.round((endTime - startTime) / 1000)) : 0);
  const durationMin = Math.floor(durationSec / 60);
  const durationSecRem = durationSec % 60;
  const durationStr = `${durationMin}m ${durationSecRem.toString().padStart(2, '0')}s`;
  const riskScore = Math.round(session?.peakRiskScore || 0);
  const integrityScore = session?.overallIntegrityScore ?? Math.max(0, 100 - riskScore);
  const riskLevel = riskScore > 60 ? 'HIGH' : riskScore > 20 ? 'MEDIUM' : 'NORMAL';

  // Subsystem stats from alerts
  const phoneAlerts = alerts.filter(a => a.type === 'PHONE_DETECTED' || a.eventType === 'PHONE_DETECTED' || a.type === 'MOBILE_PHONE_DETECTED' || a.eventType === 'MOBILE_PHONE_DETECTED').length;
  const livenessAlerts = alerts.filter(a => a.type?.includes('SPOOF') || a.type?.includes('LIVENESS')).length;
  const gazeAlerts = alerts.filter(a => a.type?.includes('GAZE') || a.type?.includes('LOOKING_AWAY') || a.type?.includes('OFFSCREEN')).length;
  const headAlerts = alerts.filter(a => a.type?.includes('HEAD') || a.type?.includes('POSE')).length;
  const voiceAlerts = alerts.filter(a => a.type?.includes('SPEECH') || a.type?.includes('VOICE') || a.type?.includes('SPEAKER')).length;
  const multiPersonAlerts = alerts.filter(a => a.type?.includes('MULTIPLE_PERSONS') || a.type?.includes('MULTIPLE_FACES')).length;
  const identityMismatchCount = session?.identityMismatchCount || alerts.filter(a => a.type === 'IDENTITY_MISMATCH' || a.eventType === 'IDENTITY_MISMATCH').length;

  const rawStatus = (session?.status || 'COMPLETED').toUpperCase();
  const statusBadge = () => {
    if (rawStatus === 'ACTIVE' || rawStatus === 'LIVE') {
      return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">ACTIVE</span>;
    }
    if (rawStatus === 'SUSPENDED') {
      return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">SUSPENDED</span>;
    }
    if (rawStatus === 'FAILED') {
      return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">FAILED</span>;
    }
    return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">COMPLETED</span>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden my-8 text-slate-900">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
              <Shield size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900">Session Monitoring Details</h3>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-semibold">
                  {sessionId}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200 font-bold uppercase">
                  {session?.mode || session?.sessionType || 'EXAM'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {session?.roomTitle ? `${session.roomTitle} — ` : ''}
                Candidate: <strong className="text-slate-800">{session?.userName || session?.userEmail || 'Candidate'}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-20 text-center text-slate-500 text-sm font-medium">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading verified session telemetry...
          </div>
        ) : !session ? (
          <div className="py-16 text-center text-slate-500 text-sm">
            Session data not found.
          </div>
        ) : (
          <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
            
            {/* Top Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block mb-1">Status</span>
                <div className="flex items-center gap-2">
                  {statusBadge()}
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block mb-1">Duration</span>
                <div className="flex items-center gap-1.5 text-slate-800 font-mono font-bold text-sm">
                  <Clock size={14} className="text-blue-600" />
                  {durationStr}
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block mb-1">Integrity Score</span>
                <div className="flex items-center gap-1.5 font-bold text-sm">
                  <CheckCircle2 size={14} className={integrityScore >= 85 ? "text-emerald-600" : integrityScore >= 60 ? "text-amber-600" : "text-rose-600"} />
                  <span className={integrityScore >= 85 ? "text-emerald-600" : integrityScore >= 60 ? "text-amber-600" : "text-rose-600"}>
                    {integrityScore}%
                  </span>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block mb-1">Total Alerts</span>
                <div className="flex items-center gap-1.5 font-bold text-sm">
                  <Activity size={14} className="text-purple-600" />
                  <span className="text-slate-800">{alerts.length} events</span>
                </div>
              </div>
            </div>

            {/* Session Overview Details */}
            <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Info size={14} className="text-blue-600" />
                Session & Candidate Overview
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Candidate</span>
                  <span className="text-slate-900 font-bold block">{session.userName || 'Student'}</span>
                  <span className="text-slate-500 text-[11px] block">{session.userEmail || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Virtual Room</span>
                  <span className="text-slate-900 font-bold block">{session.roomTitle || (session.roomId ? `Room ${session.roomId}` : 'Direct Session')}</span>
                  <span className="text-slate-500 font-mono text-[11px] block">{session.roomId || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Host</span>
                  <span className="text-slate-900 font-bold block">{session.hostName || 'Proctor Host'}</span>
                  <span className="text-slate-500 text-[11px] block">{session.hostEmail || ''}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Timing</span>
                  <span className="text-slate-900 font-semibold block">Start: {startTime.toLocaleTimeString()}</span>
                  <span className="text-slate-500 text-[11px] block">End: {endTime ? endTime.toLocaleTimeString() : 'In Progress'}</span>
                </div>
              </div>
            </div>

            {/* AI Summary Subsystems */}
            <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Brain size={14} className="text-emerald-600" />
                Multimodal AI Perception Subsystems
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
                  <span className="text-slate-700 flex items-center gap-1.5 font-medium">
                    <Scan size={14} className="text-blue-600" /> Liveness (ConvNeXt)
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${livenessAlerts > 0 ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>
                    {livenessAlerts > 0 ? `${livenessAlerts} flags` : 'Passed'}
                  </span>
                </div>
                <div className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
                  <span className="text-slate-700 flex items-center gap-1.5 font-medium">
                    <User size={14} className="text-indigo-600" /> Identity (SFace)
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${identityMismatchCount > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                    {identityMismatchCount > 0 ? `${identityMismatchCount} mismatch` : 'Verified'}
                  </span>
                </div>
                <div className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
                  <span className="text-slate-700 flex items-center gap-1.5 font-medium">
                    <Eye size={14} className="text-emerald-600" /> Eye Gaze & Attention
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${gazeAlerts > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                    {gazeAlerts > 0 ? `${gazeAlerts} deviations` : 'Clean'}
                  </span>
                </div>
                <div className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
                  <span className="text-slate-700 flex items-center gap-1.5 font-medium">
                    <Activity size={14} className="text-cyan-600" /> Head Pose
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${headAlerts > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                    {headAlerts > 0 ? `${headAlerts} flags` : 'Normal'}
                  </span>
                </div>
                <div className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
                  <span className="text-slate-700 flex items-center gap-1.5 font-medium">
                    <Box size={14} className="text-purple-600" /> Environment (YOLO)
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${phoneAlerts > 0 || multiPersonAlerts > 0 ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>
                    {phoneAlerts > 0 ? `${phoneAlerts} phone` : multiPersonAlerts > 0 ? 'Multi-face' : 'Clean'}
                  </span>
                </div>
                <div className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
                  <span className="text-slate-700 flex items-center gap-1.5 font-medium">
                    <Mic size={14} className="text-yellow-600" /> Voice Activity
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${voiceAlerts > 0 && session.mode === 'EXAM' ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                    {voiceAlerts > 0 ? `${voiceAlerts} voice flags` : 'Clean'}
                  </span>
                </div>
              </div>
            </div>

            {/* Video Playback Section */}
            {session.recordingUrl && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    <Video size={14} className="text-blue-600" />
                    Session Video Recording
                  </h4>
                  <a
                    href={session.recordingUrl}
                    download={`trueview_${sessionId}.webm`}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded border border-blue-200 transition-colors"
                  >
                    <Download size={12} /> Download WebM
                  </a>
                </div>

                <div className="relative rounded-lg overflow-hidden bg-black aspect-video border border-slate-300 flex items-center justify-center">
                  <video 
                    src={session.recordingUrl} 
                    controls 
                    playsInline
                    className="w-full h-full object-contain" 
                  />
                </div>
              </div>
            )}

            {/* Chronological Alert Timeline */}
            <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Activity size={14} className="text-blue-600" />
                Verified Event Timeline ({timeline.length} recorded)
              </h4>

              {timeline.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                  <CheckCircle2 size={24} className="mx-auto text-emerald-600 mb-2 opacity-80" />
                  No security violations or alerts recorded during this session.
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                  {timeline.map((evt, idx) => {
                    const isCritical = evt.severity === 'CRITICAL' || evt.type?.includes('SPOOF') || evt.type?.includes('PHONE');
                    const isWarning = evt.severity === 'HIGH' || evt.severity === 'MEDIUM';

                    return (
                      <div 
                        key={evt.id || idx}
                        className={`p-3 rounded-lg border text-xs flex items-start justify-between gap-3 ${
                          isCritical ? 'bg-rose-50 border-rose-200 text-rose-900' :
                          isWarning ? 'bg-amber-50 border-amber-200 text-amber-900' :
                          'bg-white border-slate-200 text-slate-800'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${
                            isCritical ? 'bg-rose-600 text-white' :
                            isWarning ? 'bg-amber-500 text-black' :
                            'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {evt.severity || 'INFO'}
                          </span>
                          <div>
                            <span className="font-bold text-slate-900 block mb-0.5">
                              {evt.type?.replace(/_/g, ' ') || 'AI Event'}
                            </span>
                            <span className="text-[11px] text-slate-600">{evt.evidence || evt.description}</span>
                          </div>
                        </div>
                        <span className="font-mono text-[10px] text-slate-500 shrink-0">
                          {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            Status: {statusBadge()}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                onClose();
                if (onOpenReport) onOpenReport(sessionId);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-colors shadow-sm"
            >
              <FileText size={14} />
              View Report
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
    </div>
  );
}
