import React, { useState } from 'react';
import { UnifiedAIState, SessionState } from '../types';

interface Props {
  state: UnifiedAIState | null;
  sessionState: SessionState;
  onOpenSidePanel: () => void;
  onStop: () => void;
}

export const MonitoringWidget: React.FC<Props> = ({ state, sessionState, onOpenSidePanel, onStop }) => {
  const [minimized, setMinimized] = useState(false);
  const [challengeMsg, setChallengeMsg] = useState<string | null>(null);

  const containerStyle: React.CSSProperties = {
    backgroundColor: '#ffffff',
    color: '#000000',
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #000000',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)',
    width: '300px',
    fontSize: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid #e5e7eb',
    paddingBottom: '8px',
  };

  if (!state) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '11px', color: '#000000' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#d97706', display: 'inline-block' }} />
            <span>TRUEVIEW AI: {sessionState}</span>
          </div>
        </div>
      </div>
    );
  }

  const isFocused = state.attention?.status === 'FOCUSED' || state.attention?.status === 'LOOKING_AT_KEYBOARD';
  const riskScore = state.risk?.score ?? state.risk?.current ?? 0;
  const riskLevel = state.risk?.level ?? 'NORMAL';
  const isHighRisk = riskScore > 50 || riskLevel.includes('HIGH') || riskLevel.includes('CRITICAL');

  const triggerChallenge = (action: string) => {
    setChallengeMsg(`Active Challenge: Please ${action.toLowerCase()}!`);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(`Liveness verification prompt: Please ${action.toLowerCase()}`));
    }
    setTimeout(() => setChallengeMsg(null), 5000);
  };

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '11px', color: '#000000' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#059669', display: 'inline-block' }} />
          <span>TRUEVIEW AI MONITOR V3</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#000000', fontWeight: 700 }}>
            {state.performance?.fps || 4} FPS
          </span>
          <button
            onClick={() => setMinimized(!minimized)}
            style={{
              background: '#f3f4f6',
              border: '1px solid #000000',
              color: '#000000',
              borderRadius: '4px',
              padding: '2px 6px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 800,
            }}
          >
            {minimized ? '＋' : '–'}
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Risk & Attention Pill */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{
              padding: '5px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 800,
              backgroundColor: isHighRisk ? '#fee2e2' : '#d1fae5',
              color: isHighRisk ? '#7f1d1d' : '#064e3b',
              border: isHighRisk ? '1px solid #f87171' : '1px solid #34d399',
              flex: 1
            }}>
              RISK: {Math.round(riskScore)}% ({riskLevel})
            </div>
            <span style={{
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '10px',
              fontWeight: 800,
              backgroundColor: isFocused ? '#f3f4f6' : '#fef3c7',
              color: isFocused ? '#000000' : '#78350f',
              border: isFocused ? '1px solid #000000' : '1px solid #f59e0b'
            }}>
              {state.attention?.status || 'FOCUSED'}
            </span>
          </div>

          {/* Core AI Perception Signals */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px',
            background: '#f9fafb',
            padding: '8px 10px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            fontSize: '11px',
            color: '#000000'
          }}>
            <div>Identity: <b style={{ color: '#047857' }}>{state.identity?.verified ? 'Verified' : 'Unverified'}</b></div>
            <div>Liveness: <b style={{ color: '#047857' }}>{state.liveness?.status?.toUpperCase()}</b></div>
            <div>Eye Gaze: <b style={{ color: '#000000' }}>{state.attention?.gaze}</b></div>
            <div>Head Pose: <b style={{ color: '#000000' }}>{state.attention?.head_pose}</b></div>
          </div>

          {/* YOLO Phone Object Detection Warning Badge */}
          {state.environment?.phone_detected && (
            <div style={{
              padding: '6px 10px',
              borderRadius: '6px',
              backgroundColor: '#fee2e2',
              border: '1px solid #f87171',
              color: '#7f1d1d',
              fontWeight: 800,
              fontSize: '11px',
              textAlign: 'center',
            }}>
              Mobile Phone Detected in Camera View
            </div>
          )}

          {/* Active Liveness Challenge Prompt */}
          {challengeMsg && (
            <div style={{
              padding: '6px 10px',
              borderRadius: '6px',
              backgroundColor: '#dbeafe',
              border: '1px solid #60a5fa',
              color: '#1e3a8a',
              fontWeight: 700,
              fontSize: '10px',
              textAlign: 'center'
            }}>
              {challengeMsg}
            </div>
          )}

          {/* Active Events */}
          {state.behaviour?.events?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {state.behaviour.events.slice(0, 2).map((evt, i) => (
                <div key={evt.event_id || i} style={{
                  padding: '6px 8px',
                  borderRadius: '6px',
                  background: '#fee2e2',
                  border: '1px solid #f87171',
                  color: '#7f1d1d',
                  fontSize: '10px'
                }}>
                  <b>[{evt.type}]</b> {evt.evidence}
                </div>
              ))}
            </div>
          )}

          {/* Quick Proctor Actions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <button
              onClick={() => triggerChallenge('Blink twice slowly')}
              style={{
                backgroundColor: '#ffffff',
                color: '#000000',
                border: '1px solid #000000',
                borderRadius: '6px',
                padding: '5px 6px',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Blink Challenge
            </button>
            <button
              onClick={() => triggerChallenge('Turn head left')}
              style={{
                backgroundColor: '#ffffff',
                color: '#000000',
                border: '1px solid #000000',
                borderRadius: '6px',
                padding: '5px 6px',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Pose Challenge
            </button>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingTop: '4px', borderTop: '1px solid #e5e7eb' }}>
            <button
              onClick={onOpenSidePanel}
              style={{
                backgroundColor: '#000000',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                flex: 1,
                textAlign: 'center',
              }}
            >
              Side Panel
            </button>
            <button
              onClick={onStop}
              style={{
                backgroundColor: '#fee2e2',
                color: '#7f1d1d',
                border: '1px solid #f87171',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Stop
            </button>
          </div>
        </>
      )}
    </div>
  );
};
