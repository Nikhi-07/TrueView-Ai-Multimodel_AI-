import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Volume2, AlertTriangle, ShieldCheck, CheckCircle2, X } from 'lucide-react';

export default function VoiceCommandController({ onCommandExecuted }) {
  const [isListening, setIsListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const [activeConfirmation, setActiveConfirmation] = useState(null); // { command, label, payload }
  const [feedbackMsg, setFeedbackMsg] = useState(null);
  const recognitionRef = useRef(null);

  // Initialize SpeechRecognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[VoiceCommand] Web Speech API not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const current = event.resultIndex;
      const transcript = event.results[current][0].transcript.trim().toLowerCase();
      console.log(`[VoiceCommand] Heard: "${transcript}"`);
      setLastTranscript(transcript);
      parseAndExecuteCommand(transcript);
    };

    recognition.onerror = (err) => {
      console.warn('[VoiceCommand] Speech recognition error:', err.error);
    };

    recognition.onend = () => {
      if (isListening) {
        try {
          recognition.start();
        } catch (_) {}
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }
    };
  }, [isListening]);

  // Toggle Speech Recognition
  const toggleListening = () => {
    if (!recognitionRef.current) {
      showFeedback('Voice recognition not supported on browser');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      showFeedback('Voice Control Disabled');
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
        showFeedback('Voice Control Active - Listening...');
      } catch (err) {
        console.error(err);
      }
    }
  };

  const showFeedback = (msg) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  // Command Parser Logic
  const parseAndExecuteCommand = useCallback((phrase) => {
    // 1. Destructive Commands requiring Confirmation Modal
    if (phrase.includes('end session') || phrase.includes('finish session')) {
      setActiveConfirmation({
        command: 'END_SESSION',
        label: 'End Session',
        message: 'Are you sure you want to end this proctoring session for all participants?'
      });
      return;
    }

    if (phrase.includes('suspend session') || phrase.includes('suspend candidate')) {
      setActiveConfirmation({
        command: 'SUSPEND_SESSION',
        label: 'Suspend Session',
        message: 'Are you sure you want to suspend this candidate session?'
      });
      return;
    }

    // 2. Safe Instant Reviewer Commands
    if (phrase.includes('pause session')) {
      onCommandExecuted('PAUSE_SESSION');
      showFeedback('Executed: Pause Session');
    } else if (phrase.includes('resume session')) {
      onCommandExecuted('RESUME_SESSION');
      showFeedback('Executed: Resume Session');
    } else if (phrase.includes('critical alerts') || phrase.includes('show critical')) {
      onCommandExecuted('FILTER_ALERTS', 'CRITICAL');
      showFeedback('Filtered View: Critical Alerts');
    } else if (phrase.includes('recent alerts') || phrase.includes('show recent')) {
      onCommandExecuted('FILTER_ALERTS', 'ALL');
      showFeedback('Filtered View: Recent Alerts');
    } else if (phrase.includes('show timeline') || phrase.includes('view timeline')) {
      onCommandExecuted('NAVIGATE_TAB', 'timeline');
      showFeedback('View: Event Timeline');
    } else if (phrase.includes('show participant') || phrase.includes('view participant')) {
      onCommandExecuted('NAVIGATE_TAB', 'video');
      showFeedback('View: Participant Video');
    } else if (phrase.includes('voice events') || phrase.includes('show voice')) {
      onCommandExecuted('FILTER_ALERTS', 'VOICE');
      showFeedback('Filtered View: Voice Events');
    } else if (phrase.includes('suspicious activity') || phrase.includes('show suspicious')) {
      onCommandExecuted('FILTER_ALERTS', 'SUSPICIOUS');
      showFeedback('Filtered View: Suspicious Activity');
    }
  }, [onCommandExecuted]);

  const confirmAction = () => {
    if (activeConfirmation) {
      onCommandExecuted(activeConfirmation.command);
      showFeedback(`Confirmed: ${activeConfirmation.label}`);
      setActiveConfirmation(null);
    }
  };

  const cancelAction = () => {
    setActiveConfirmation(null);
    showFeedback('Voice Command Cancelled');
  };

  return (
    <div className="relative flex items-center gap-3 font-mono text-xs">
      
      {/* Voice Recognition Toggle Button */}
      <button
        onClick={toggleListening}
        className={`px-3.5 py-2 rounded-xl border transition flex items-center gap-2 font-semibold ${
          isListening
            ? 'bg-red-950/40 border-red-500/60 text-red-300 animate-pulse'
            : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
        }`}
      >
        {isListening ? <Mic size={14} className="text-red-400" /> : <MicOff size={14} className="text-zinc-500" />}
        <span>{isListening ? 'VOICE CONTROL: ACTIVE' : 'ENABLE VOICE CONTROL'}</span>
      </button>

      {/* Last Recognized Transcript Toast */}
      {lastTranscript && isListening && (
        <span className="hidden xl:inline text-[11px] text-zinc-400 bg-zinc-900 px-3 py-1 rounded border border-zinc-800 truncate max-w-xs">
          Heard: "{lastTranscript}"
        </span>
      )}

      {/* Action Feedback Banner */}
      {feedbackMsg && (
        <div className="absolute top-12 left-0 z-40 bg-zinc-900 border border-zinc-700 text-zinc-200 px-3.5 py-2 rounded-xl shadow-xl flex items-center gap-2 whitespace-nowrap animate-fadeIn">
          <Volume2 size={14} className="text-emerald-400" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Confirmation Modal for Destructive Commands */}
      {activeConfirmation && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 max-w-md w-full rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2 bg-red-950 border border-red-800 rounded-xl">
                <AlertTriangle size={20} />
              </div>
              <h3 className="text-base font-bold text-white font-sans">
                Confirm Voice Command: {activeConfirmation.label}
              </h3>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed font-sans">
              {activeConfirmation.message}
            </p>

            <div className="pt-2 flex items-center justify-end gap-3 font-sans">
              <button
                onClick={cancelAction}
                className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs font-semibold text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-semibold text-white shadow-lg shadow-red-950"
              >
                Confirm Command
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
