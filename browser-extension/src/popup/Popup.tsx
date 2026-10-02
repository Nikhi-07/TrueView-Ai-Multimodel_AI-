import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Shield, Play, Square, Video, ExternalLink, User, LogOut,
  Camera, Eye, CheckCircle, XCircle, AlertTriangle, Loader2, ScanFace
} from 'lucide-react';
import { AuthService } from '../auth/auth-service';
import { UserAuth, PlatformInfo, SessionState, UnifiedAIState } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Login Flow Steps
// ─────────────────────────────────────────────────────────────────────────────
type LoginStep = 'credentials' | 'face_scan' | 'face_verifying' | 'done';

// ─────────────────────────────────────────────────────────────────────────────
// Face Capture Overlay
// Mirrors the system's FaceRegistration.jsx behaviour:
//   - Live webcam preview with oval guide
//   - Captures 3 frames over 2 seconds
//   - Sends to POST /api/auth/face-login
// ─────────────────────────────────────────────────────────────────────────────
function FaceScanStep({
  token,
  userEmail,
  onSuccess,
  onSkip,
}: {
  token: string;
  userEmail?: string;
  onSuccess: () => void;
  onSkip: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'verifying' | 'success' | 'failed' | 'no_camera'>('starting');
  const [progress, setProgress] = useState(0); // 0-100
  const [msg, setMsg] = useState('Initialising camera…');
  const [confidence, setConfidence] = useState<number | null>(null);

  const capturedFrames = useRef<string[]>([]);
  const scanTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('scanning');
        setMsg('Look directly at the camera…');

        // Capture 3 frames over ~2 seconds
        let frameCount = 0;
        scanTimer.current = setInterval(() => {
          if (frameCount >= 3) {
            if (scanTimer.current) clearInterval(scanTimer.current);
            runVerification();
            return;
          }
          const frame = captureFrame();
          if (frame) {
            capturedFrames.current.push(frame);
            frameCount++;
            setProgress(Math.round((frameCount / 3) * 70));
          }
        }, 700);
      } catch {
        if (!cancelled) { setStatus('no_camera'); setMsg('Camera unavailable — login without face scan?'); }
      }
    }

    async function runVerification() {
      setStatus('verifying');
      setMsg('Verifying identity…');
      setProgress(80);

      const result = await AuthService.verifyFace(capturedFrames.current, token, userEmail);
      setProgress(100);

      if (result.success) {
        setStatus('success');
        setConfidence(result.confidence ?? null);
        setMsg('Identity verified!');
        setTimeout(onSuccess, 1000);
      } else {
        setStatus('failed');
        setMsg(result.error || 'Verification failed — try again or skip.');
      }
    }

    start();

    return () => {
      cancelled = true;
      if (scanTimer.current) clearInterval(scanTimer.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [token, captureFrame, onSuccess]);

  const statusColor = status === 'success' ? '#10b981' : status === 'failed' ? '#ef4444' : '#6366f1';

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      {/* Camera Preview */}
      <div className="relative w-44 h-36 rounded-xl overflow-hidden bg-slate-900 border-2"
        style={{ borderColor: statusColor }}>
        <video
          ref={videoRef}
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
          style={{ display: status === 'no_camera' ? 'none' : 'block' }}
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Oval Face Guide */}
        {(status === 'scanning' || status === 'verifying') && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-28 h-32 rounded-full border-2 border-dashed opacity-80"
              style={{ borderColor: statusColor }} />
          </div>
        )}

        {/* Overlay icons */}
        {status === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70">
            <Loader2 size={24} className="text-indigo-400 animate-spin" />
          </div>
        )}
        {status === 'success' && (
          <div className="absolute inset-0 flex items-center justify-center bg-emerald-900/60">
            <CheckCircle size={32} className="text-emerald-400" />
          </div>
        )}
        {status === 'failed' && (
          <div className="absolute inset-0 flex items-center justify-center bg-rose-900/60">
            <XCircle size={32} className="text-rose-400" />
          </div>
        )}
        {status === 'no_camera' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-900">
            <Camera size={22} className="text-slate-500" />
            <span className="text-[9px] text-slate-400 text-center px-2">No camera access</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {status !== 'no_camera' && (
        <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, backgroundColor: statusColor }}
          />
        </div>
      )}

      {/* Status message */}
      <p className="text-[11px] text-slate-600 text-center font-medium">{msg}</p>

      {/* Confidence badge */}
      {status === 'success' && confidence !== null && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
          {Math.round(confidence * 100)}% confidence
        </span>
      )}

      {/* Biometric checklist */}
      <div className="w-full space-y-1">
        {[
          { label: 'MiniFASNet liveness check', done: progress >= 50 },
          { label: 'SFace identity match', done: progress >= 90 },
        ].map(({ label, done }) => (
          <div key={label} className="flex items-center gap-1.5 text-[10px]">
            {done
              ? <CheckCircle size={11} className="text-emerald-500 shrink-0" />
              : <div className="w-2.5 h-2.5 rounded-full border border-slate-300 shrink-0" />
            }
            <span className={done ? 'text-emerald-700 font-medium' : 'text-slate-400'}>{label}</span>
          </div>
        ))}
      </div>

      {/* Skip / retry */}
      <div className="flex gap-2 w-full pt-1">
        {status === 'failed' && (
          <button
            onClick={() => { capturedFrames.current = []; setProgress(0); setStatus('starting'); }}
            className="flex-1 py-1.5 text-[11px] rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
          >
            Retry
          </button>
        )}
        <button
          onClick={onSkip}
          className="flex-1 py-1.5 text-[11px] rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 font-medium"
        >
          {status === 'no_camera' ? 'Continue without scan' : 'Skip verification'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Popup
// ─────────────────────────────────────────────────────────────────────────────
export default function Popup() {
  const [auth, setAuth] = useState<UserAuth>({ token: '', user: null, isAuthenticated: false });
  const [loginStep, setLoginStep] = useState<LoginStep>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [pendingToken, setPendingToken] = useState<string>('');

  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>('NO_SESSION');
  const [aiState, setAiState] = useState<UnifiedAIState | null>(null);

  useEffect(() => {
    AuthService.getCurrentAuth().then((a) => {
      setAuth(a);
      if (a.isAuthenticated) setLoginStep('done');
    });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id) {
        const url = activeTab.url || '';
        const isMeet = url.includes('meet.google.com');
        const isTeams = url.includes('teams.microsoft.com') || url.includes('teams.live.com');
        const isHttp = url.startsWith('http://') || url.startsWith('https://');

        chrome.tabs.sendMessage(activeTab.id, { type: 'GET_SESSION_STATE' }, (res) => {
          if (chrome.runtime.lastError || !res) {
            if (isHttp && activeTab.id) {
              chrome.scripting.executeScript({
                target: { tabId: activeTab.id },
                files: ['content/content-script.js'],
              }).catch(() => {});
            }
            const platformName = isMeet ? 'GOOGLE_MEET' : isTeams ? 'TEAMS_WEB' : isHttp ? 'GENERIC' : 'UNKNOWN';
            setPlatformInfo({ platform: platformName, supported: isHttp, url, hostname: url ? new URL(url).hostname : '', confidence: isMeet || isTeams ? 1.0 : 0.8 });
          } else {
            setPlatformInfo(res.platformInfo);
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

  // Stage 1 — credentials
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);
    const res = await AuthService.login(email, password);
    setIsLoggingIn(false);

    if (res.success) {
      setPendingToken(res.token || '');
      if (res.requiresFaceVerification) {
        setLoginStep('face_scan');
      } else {
        const updated = await AuthService.getCurrentAuth();
        setAuth(updated);
        setLoginStep('done');
      }
    } else {
      setLoginError(res.error || 'Login failed');
    }
  };

  // Stage 2 — face scan complete
  const handleFaceSuccess = async () => {
    const updated = await AuthService.getCurrentAuth();
    setAuth(updated);
    setLoginStep('done');
  };

  const handleFaceSkip = async () => {
    const updated = await AuthService.getCurrentAuth();
    setAuth(updated);
    setLoginStep('done');
  };

  const handleLogout = async () => {
    await AuthService.logout();
    setAuth({ token: '', user: null, isAuthenticated: false });
    setLoginStep('credentials');
    setEmail('');
    setPassword('');
  };

  const handleStartMonitoring = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { type: 'START_MONITORING' }, async (res) => {
          if (chrome.runtime.lastError || !res) {
            try {
              await chrome.scripting.executeScript({ target: { tabId }, files: ['content/content-script.js'] });
              setTimeout(() => {
                chrome.tabs.sendMessage(tabId, { type: 'START_MONITORING' }, (res2) => {
                  if (res2?.success) setSessionState('MONITORING');
                });
              }, 200);
            } catch {}
          } else if (res.success) {
            setSessionState('MONITORING');
          }
        });
      }
    });
  };

  const handleStopMonitoring = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'STOP_MONITORING' }, () => {
          setSessionState('COMPLETED');
          setAiState(null);
        });
      }
    });
  };

  const openSidePanel = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id && chrome.sidePanel?.open) {
        chrome.sidePanel.open({ tabId: tabs[0].id });
      }
    });
  };

  const openDashboard = () => chrome.tabs.create({ url: 'http://localhost:5173' });

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-3 min-h-full flex flex-col bg-white text-slate-900 font-sans" style={{ width: 320, minHeight: 460 }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center">
            <Shield size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-xs font-bold text-slate-900 leading-none">TRUEVIEW AI</h1>
            <span className="text-[9px] text-slate-500 font-mono">BROWSER MONITOR V3</span>
          </div>
        </div>
        {loginStep === 'done' && (
          <button onClick={handleLogout} className="text-slate-400 hover:text-rose-600 p-1" title="Sign Out">
            <LogOut size={14} />
          </button>
        )}
      </div>

      {/* ── Step 1: Credentials ─────────────────────────────────────── */}
      {loginStep === 'credentials' && (
        <form onSubmit={handleLogin} className="space-y-3 flex-1 flex flex-col justify-center">
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Shield size={16} className="text-slate-700" />
              <h2 className="text-sm font-bold text-slate-900">Sign In to TrueView</h2>
            </div>
            <p className="text-[11px] text-slate-500">Connect extension to your TrueView account</p>
          </div>

          {loginError && (
            <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-medium flex items-center gap-1.5">
              <AlertTriangle size={12} className="shrink-0" />
              {loginError}
            </div>
          )}

          <div>
            <label className="text-[10px] font-semibold text-slate-600 block mb-1">Email Address</label>
            <input
              type="email" required placeholder="student@trueview.ai"
              value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-slate-800"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-600 block mb-1">Password</label>
            <input
              type="password" required placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-slate-800"
            />
          </div>

          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center gap-2"
          >
            {isLoggingIn ? <Loader2 size={13} className="animate-spin" /> : <Shield size={13} />}
            {isLoggingIn ? 'Authenticating…' : 'Authenticate'}
          </button>
        </form>
      )}

      {/* ── Step 2: Face Scan ────────────────────────────────────────── */}
      {loginStep === 'face_scan' && (
        <div className="flex-1 flex flex-col">
          <div className="text-center mb-3">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <ScanFace size={16} className="text-indigo-600" />
              <h2 className="text-sm font-bold text-slate-900">Biometric Verification</h2>
            </div>
            <p className="text-[11px] text-slate-500">Face scan required to complete authentication</p>
          </div>
          <FaceScanStep
            token={pendingToken}
            userEmail={email}
            onSuccess={handleFaceSuccess}
            onSkip={handleFaceSkip}
          />
        </div>
      )}

      {/* ── Authenticated ────────────────────────────────────────────── */}
      {loginStep === 'done' && (
        <div className="space-y-3 flex-1">
          {/* User info */}
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <User size={14} className="text-slate-700" />
              <span className="font-semibold text-slate-900 truncate max-w-[150px]">
                {auth.user?.name || auth.user?.fullName || auth.user?.email || 'Authenticated User'}
              </span>
            </div>
            <span className="text-[10px] font-semibold text-emerald-800 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200">
              CONNECTED
            </span>
          </div>

          {/* Platform status */}
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Target Environment:</span>
              <b className="text-slate-900">{platformInfo?.platform || 'Detecting…'}</b>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Monitoring Status:</span>
              <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                sessionState === 'MONITORING'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-slate-200 text-slate-700'
              }`}>
                {sessionState}
              </span>
            </div>
            {/* Risk score if monitoring */}
            {sessionState === 'MONITORING' && aiState?.risk && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Risk Score:</span>
                <span className={`font-bold text-[10px] px-2 py-0.5 rounded ${
                  (aiState.risk.score ?? 0) > 60
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : (aiState.risk.score ?? 0) > 30
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}>
                  {Math.round(aiState.risk.score ?? 0)}%
                </span>
              </div>
            )}
          </div>

          {/* Monitoring controls */}
          {sessionState === 'MONITORING' ? (
            <button
              onClick={handleStopMonitoring}
              className="w-full py-2.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold flex items-center justify-center gap-2"
            >
              <Square size={14} />
              Stop Monitoring & Generate Report
            </button>
          ) : (
            <button
              onClick={handleStartMonitoring}
              disabled={!platformInfo?.supported}
              className="w-full py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2"
            >
              <Play size={14} />
              Start TrueView AI Monitoring
            </button>
          )}

          {/* Session completion notice */}
          {sessionState === 'COMPLETED' && (
            <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium flex items-center gap-1.5">
              <CheckCircle size={12} className="shrink-0" />
              Session complete! Report generated in your dashboard.
            </div>
          )}

          {/* Links */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={openSidePanel}
              className="py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs flex items-center justify-center gap-1.5 font-medium">
              <Video size={13} />
              Side Panel
            </button>
            <button onClick={openDashboard}
              className="py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs flex items-center justify-center gap-1.5 font-medium">
              <ExternalLink size={13} />
              Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-[10px] text-slate-400 text-center pt-2 border-t border-slate-200">
        TrueView AI Engine • Manifest V3 • Autonomous Proctoring Layer
      </div>
    </div>
  );
}
