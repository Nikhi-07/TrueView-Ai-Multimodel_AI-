import React, { useState, useEffect } from 'react';
import { Shield, Eye, ScanFace, Fingerprint, Mic, Boxes, Clock } from 'lucide-react';
import { UnifiedAIState, SessionState } from '../types';

export default function SidePanel() {
  const [sessionState, setSessionState] = useState<SessionState>('NO_SESSION');
  const [aiState, setAiState] = useState<UnifiedAIState | null>(null);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_SESSION_STATE' }, (res) => {
          if (res) {
            setSessionState(res.sessionState);
            setAiState(res.aiState);
          }
        });
      }
    });

    const listener = (msg: any) => {
      if (msg.type === 'AI_STATE_UPDATE') {
        setSessionState(msg.payload.sessionState);
        setAiState(msg.payload.aiState);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const riskScore = aiState?.risk?.score ?? aiState?.risk?.current ?? 0;
  const riskLevel = aiState?.risk?.level ?? 'NORMAL';
  const isHighRisk = riskScore > 50 || riskLevel.includes('HIGH') || riskLevel.includes('CRITICAL');

  return (
    <div className="p-4 space-y-4 bg-slate-50 text-slate-900 min-h-screen font-sans">
      {/* Side Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3 bg-white p-3 rounded-xl border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center">
            <Shield size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-xs font-bold text-slate-900">TrueView Side Panel</h1>
            <p className="text-[10px] text-slate-500 font-mono">Unified AI State Inspector</p>
          </div>
        </div>
        <span className={sessionState === 'MONITORING' ? 'badge-success' : 'badge-neutral'}>
          {sessionState}
        </span>
      </div>

      {!aiState ? (
        <div className="text-center py-12 text-slate-500 space-y-3 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <Clock size={36} className="mx-auto text-slate-400" />
          <p className="text-xs font-medium text-slate-700">No active monitoring session in current tab.</p>
          <p className="text-[11px] text-slate-500">Open Google Meet / Teams and click "Start TrueView AI Monitoring" in Popup.</p>
        </div>
      ) : (
        <>
          {/* SECTION 1: Dynamic Risk Score Gauge */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 text-center space-y-1 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Dynamic Risk Score</span>
            <div className="text-3xl font-mono font-extrabold text-slate-900">{Math.round(riskScore)} / 100</div>
            <span className={isHighRisk ? 'badge-danger' : 'badge-success'}>{riskLevel}</span>
          </div>

          {/* SECTION 2: Identity & Liveness */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 shadow-sm">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Identity & Liveness</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1"><ScanFace size={12}/> Identity</span>
                <b className={aiState.identity?.verified ? 'text-emerald-700 block' : 'text-rose-700 block'}>
                  {aiState.identity?.verified ? 'Verified' : 'Unverified'}
                </b>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1"><Fingerprint size={12}/> Liveness</span>
                <b className="text-emerald-700 block">{aiState.liveness?.status?.toUpperCase()}</b>
              </div>
            </div>
          </div>

          {/* SECTION 3: Attention & Gaze */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 shadow-sm">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Attention & Gaze</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1"><Eye size={12}/> Status</span>
                <b className="text-slate-900 block">{aiState.attention?.status}</b>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-medium text-slate-500 block">Score</span>
                <b className="text-slate-900 block">{aiState.attention?.score}%</b>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-medium text-slate-500 block">Eye Gaze</span>
                <b className="text-slate-800 block">{aiState.attention?.gaze}</b>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-medium text-slate-500 block">Head Pose</span>
                <b className="text-slate-800 block">{aiState.attention?.head_pose}</b>
              </div>
            </div>
          </div>

          {/* SECTION 4: Audio & Environment */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 shadow-sm">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Audio & Environment</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1"><Mic size={12}/> Speech</span>
                <b className={aiState.audio?.speaking ? 'text-amber-700 block' : 'text-slate-600 block'}>
                  {aiState.audio?.speaking ? 'SPEAKING' : 'QUIET'}
                </b>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1"><Boxes size={12}/> Persons</span>
                <b className="text-slate-900 block">{aiState.environment?.person_count || 1} Person(s)</b>
              </div>
            </div>

            {aiState.environment?.phone_detected && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold text-center">
                Mobile Phone Detected in Camera View
              </div>
            )}
          </div>

          {/* SECTION 5: Confirmed Events Log */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 shadow-sm">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Confirmed Events Log</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {!aiState.behaviour?.events?.length ? (
                <div className="text-xs text-slate-400 text-center py-3">No suspicious events logged.</div>
              ) : (
                aiState.behaviour.events.map((evt, i) => (
                  <div key={evt.event_id || i} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                    <div className="flex items-center justify-between font-semibold text-slate-900">
                      <span>[{evt.type}]</span>
                      <span className="badge-warning">{evt.severity}</span>
                    </div>
                    <p className="text-[11px] text-slate-600">{evt.evidence}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
