import React, { useState } from 'react';
import { Shield, Lock, Eye, Camera, Mic, CheckCircle, ArrowRight } from 'lucide-react';
import { ExtensionStorage } from '../storage/extension-storage';

export default function Onboarding() {
  const [acknowledged, setAcknowledged] = useState(false);

  const handleContinue = async () => {
    await ExtensionStorage.setConsentAcknowledged(true);
    window.close();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-surface-950 text-gray-100 font-sans">
      <div className="glass max-w-xl w-full p-8 rounded-3xl border border-white/10 space-y-6 bg-surface-900/80 shadow-2xl">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-cyan-500 flex items-center justify-center mx-auto shadow-glow">
            <Shield size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-100">Welcome to TrueView AI Monitor</h1>
          <p className="text-xs text-gray-400">
            Real-time multimodal behavioural intelligence & secure proctoring layer for Chrome/Edge
          </p>
        </div>

        {/* Core Principles */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-surface-950/60 border border-white/5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-primary-400">
              <Camera size={16} /> Webcam Analysis
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Analyzes face mesh, liveness, gaze, and prohibited objects locally via TrueView Engine. Never records without consent.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-surface-950/60 border border-white/5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-cyan-400">
              <Mic size={16} /> Audio VAD
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Evaluates voice activity and speech presence during examinations. Raw audio is never stored continuously.
            </p>
          </div>
        </div>

        {/* Consent Acknowledgement Checkbox */}
        <div className="p-4 rounded-2xl bg-surface-800/40 border border-white/10 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={e => setAcknowledged(e.target.checked)}
              className="w-5 h-5 rounded accent-primary-500 mt-0.5"
            />
            <span className="text-xs text-gray-300 leading-relaxed">
              I acknowledge that TrueView AI will analyze video and audio input solely during authorized proctoring sessions in supported browser applications.
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-4 pt-2">
          <a
            href="http://localhost:5173/help"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-gray-400 hover:text-gray-200 underline"
          >
            Privacy Information
          </a>
          <button
            onClick={handleContinue}
            disabled={!acknowledged}
            className="btn-primary py-2.5 px-6 text-xs font-bold flex items-center gap-2 disabled:opacity-50 shadow-glow"
          >
            <span>Continue to Extension</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
