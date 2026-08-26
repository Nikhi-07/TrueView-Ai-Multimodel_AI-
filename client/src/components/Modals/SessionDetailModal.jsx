import React, { useState, useEffect } from 'react';
import { 
  X, Video, Play, Shield, AlertTriangle, Clock, Calendar, CheckCircle2, 
  FileText, Download, User, Smartphone, Eye, Mic, Activity, Compass, Scan, Brain, Box
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
  const durationSec = session?.durationSeconds || (endTime ? Math.round((endTime - startTime) / 1000) : 0);
  const durationMin = Math.floor(durationSec / 60);
  const durationSecRem = durationSec % 60;
  const durationStr = `${durationMin}m ${durationSecRem.toString().padStart(2, '0')}s`;
  const riskScore = Math.round(session?.peakRiskScore || 0);
  const integrityScore = session?.overallIntegrityScore ?? Math.max(0, 100 - riskScore);
  const riskLevel = riskScore > 60 ? 'HIGH' : riskScore > 20 ? 'MEDIUM' : 'NORMAL';

  // Subsystem stats from alerts
  const phoneAlerts = alerts.filter(a => a.type === 'PHONE_DETECTED' || a.eventType === 'PHONE_DETECTED').length;
  const livenessAlerts = alerts.filter(a => a.type?.includes('SPOOF') || a.type?.includes('LIVENESS')).length;
  const gazeAlerts = alerts.filter(a => a.type?.includes('GAZE') || a.type?.includes('LOOKING_AWAY')).length;
  const voiceAlerts = alerts.filter(a => a.type?.includes('SPEECH') || a.type?.includes('VOICE') || a.type?.includes('SPEAKER')).length;
  const multiPersonAlerts = alerts.filter(a => a.type?.includes('MULTIPLE_PERSONS') || a.type?.includes('MULTIPLE_FACES')).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Shield size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-white">Session Detail & Video Playback</h3>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  {sessionId}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold">
                  {session?.mode || session?.sessionType || 'EXAM'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {session?.roomTitle ? `${session.roomTitle} — ` : ''}
                Candidate: <span className="text-slate-200 font-semibold">{session?.userName || session?.userEmail || 'Candidate'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm font-medium">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading session telemetry & recording...
          </div>
        ) : !session ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            Session data not found.
          </div>
        ) : (
          <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
            
            {/* Top Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3.5">
                <span className="text-[11px] text-slate-400 font-medium block mb-1">Duration</span>
                <div className="flex items-center gap-1.5 text-slate-100 font-mono font-bold text-sm">
                  <Clock size={14} className="text-blue-400" />
                  {durationStr}
                </div>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3.5">
                <span className="text-[11px] text-slate-400 font-medium block mb-1">Integrity Score</span>
                <div className="flex items-center gap-1.5 text-slate-100 font-bold text-sm">
                  <CheckCircle2 size={14} className={integrityScore > 75 ? "text-emerald-400" : "text-amber-400"} />
                  <span className={integrityScore > 75 ? "text-emerald-400" : integrityScore > 50 ? "text-amber-400" : "text-rose-400"}>
                    {integrityScore}%
                  </span>
                </div>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3.5">
                <span className="text-[11px] text-slate-400 font-medium block mb-1">Peak Risk Score</span>
                <div className="flex items-center gap-1.5 font-bold text-sm">
                  <AlertTriangle size={14} className={riskScore > 60 ? "text-rose-400" : "text-slate-400"} />
                  <span className={riskScore > 60 ? "text-rose-400" : riskScore > 20 ? "text-amber-400" : "text-emerald-400"}>
                    {riskScore}/100 ({riskLevel})
                  </span>
                </div>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3.5">
                <span className="text-[11px] text-slate-400 font-medium block mb-1">Violations / Alerts</span>
                <div className="flex items-center gap-1.5 text-slate-100 font-bold text-sm">
                  <Activity size={14} className="text-purple-400" />
                  <span>{alerts.length} events</span>
                </div>
              </div>
            </div>

            {/* Session Overview Details */}
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Info size={14} className="text-blue-400" />
                Session Overview
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px]">Candidate</span>
                  <span className="text-slate-200 font-semibold">{session.userName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Mode</span>
                  <span className="text-slate-200 font-semibold">{session.mode}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Start Time</span>
                  <span className="text-slate-200 font-mono">{startTime.toLocaleTimeString()}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Status</span>
                  <span className="text-emerald-400 font-semibold">{session.status}</span>
                </div>
              </div>
            </div>

            {/* AI Summary Subsystems */}
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Brain size={14} className="text-emerald-400" />
                Multimodal AI Subsystems Summary
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Scan size={13} className="text-blue-400" /> ConvNeXt Liveness
                  </span>
                  <span className={livenessAlerts > 0 ? "text-rose-400 font-bold" : "text-emerald-400 font-semibold"}>
                    {livenessAlerts > 0 ? `${livenessAlerts} flags` : 'Passed'}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Eye size={13} className="text-emerald-400" /> Gaze & Head Pose
                  </span>
                  <span className={gazeAlerts > 0 ? "text-amber-400 font-bold" : "text-emerald-400 font-semibold"}>
                    {gazeAlerts > 0 ? `${gazeAlerts} deviations` : 'Clean'}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Box size={13} className="text-purple-400" /> YOLO Environment
                  </span>
                  <span className={phoneAlerts > 0 || multiPersonAlerts > 0 ? "text-rose-400 font-bold" : "text-emerald-400 font-semibold"}>
                    {phoneAlerts > 0 ? 'Phone detected' : multiPersonAlerts > 0 ? 'Multiple persons' : 'Clean'}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Mic size={13} className="text-yellow-400" /> Voice VAD
                  </span>
                  <span className={voiceAlerts > 0 && session.mode === 'EXAM' ? "text-amber-400 font-bold" : "text-emerald-400 font-semibold"}>
                    {voiceAlerts > 0 ? `${voiceAlerts} voice events` : 'Normal'}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Activity size={13} className="text-rose-400" /> Behaviour Control
                  </span>
                  <span className="text-slate-200 font-semibold">
                    {alerts.length > 5 ? 'Elevated Activity' : 'Normal'}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Brain size={13} className="text-cyan-400" /> Decision Engine
                  </span>
                  <span className={riskScore > 60 ? "text-rose-400 font-bold" : "text-emerald-400 font-semibold"}>
                    {riskScore > 60 ? 'Review Required' : 'Approved'}
                  </span>
                </div>
              </div>
            </div>

            {/* Video Playback Section */}
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Video size={14} className="text-emerald-400" />
                  Session Video Recording
                </h4>
                {session.recordingUrl && (
                  <a
                    href={session.recordingUrl}
                    download={`trueview_${sessionId}.webm`}
                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20 transition-colors"
                  >
                    <Download size={12} /> Download WebM
                  </a>
                )}
              </div>

              {session.recordingUrl ? (
                <div className="relative rounded-lg overflow-hidden bg-black aspect-video border border-slate-700 flex items-center justify-center">
                  <video 
                    src={session.recordingUrl} 
                    controls 
                    playsInline
                    className="w-full h-full object-contain" 
                    onLoadedMetadata={(e) => {
                      console.log(`[SessionDetailModal] Video loaded: ${e.target.videoWidth}x${e.target.videoHeight}, duration: ${e.target.duration}s`);
                    }}
                    onError={(e) => {
                      console.error('[SessionDetailModal] Video playback error:', e);
                    }}
                  />
                </div>
              ) : (
                <div className="bg-slate-900/60 border border-dashed border-slate-700 rounded-lg p-8 text-center space-y-2">
                  <Play size={28} className="mx-auto text-slate-500 opacity-60" />
                  <p className="text-xs font-semibold text-slate-300">Recording unavailable for this session.</p>
                  <p className="text-[11px] text-slate-500">No video recording stream was archived for this session.</p>
                </div>
              )}
            </div>

            {/* Chronological AI Event Timeline */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Activity size={14} className="text-blue-400" />
                Chronological Violation & Alert Timeline ({timeline.length} recorded)
              </h4>

              {timeline.length === 0 ? (
                <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-6 text-center text-xs text-slate-400">
                  <CheckCircle2 size={24} className="mx-auto text-emerald-400 mb-2 opacity-80" />
                  No security violations or alerts recorded during this session. Behavior clean.
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
                          isCritical ? 'bg-rose-500/10 border-rose-500/30 text-rose-200' :
                          isWarning ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' :
                          'bg-slate-800/50 border-slate-700/50 text-slate-300'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${
                            isCritical ? 'bg-rose-500 text-white' :
                            isWarning ? 'bg-amber-500 text-black' :
                            'bg-slate-700 text-slate-200'
                          }`}>
                            {evt.severity || 'INFO'}
                          </span>
                          <div>
                            <span className="font-bold text-white block mb-0.5">
                              {evt.type?.replace(/_/g, ' ') || 'AI Event'}
                            </span>
                            <span className="text-[11px] opacity-90">{evt.evidence || evt.description}</span>
                          </div>
                        </div>
                        <span className="font-mono text-[10px] text-slate-400 shrink-0">
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
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/90">
          <div className="text-xs text-slate-400">
            Status: <span className="font-semibold text-emerald-400">{session?.status || 'COMPLETED'}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                onClose();
                if (onOpenReport) onOpenReport(sessionId);
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-colors shadow-sm"
            >
              <FileText size={14} />
              View Full Report
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
    </div>
  );
}
