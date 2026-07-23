import React, { useState, useEffect } from 'react';
import { Shield, Play, Square, Video, ExternalLink, User, LogOut } from 'lucide-react';
import { AuthService } from '../auth/auth-service';
import { UserAuth, PlatformInfo, SessionState, UnifiedAIState } from '../types';

export default function Popup() {
  const [auth, setAuth] = useState<UserAuth>({ token: '', user: null, isAuthenticated: false });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>('NO_SESSION');
  const [aiState, setAiState] = useState<UnifiedAIState | null>(null);

  useEffect(() => {
    AuthService.getCurrentAuth().then(setAuth);

    // Query active tab state
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
            setPlatformInfo({
              platform: platformName,
              supported: isHttp,
              url,
              hostname: url ? new URL(url).hostname : '',
              confidence: isMeet || isTeams ? 1.0 : 0.8,
            });
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const res = await AuthService.login(email, password);
    if (res.success) {
      const updated = await AuthService.getCurrentAuth();
      setAuth(updated);
    } else {
      setLoginError(res.error || 'Login failed');
    }
  };

  const handleLogout = async () => {
    await AuthService.logout();
    setAuth({ token: '', user: null, isAuthenticated: false });
  };

  const handleStartMonitoring = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { type: 'START_MONITORING' }, async (res) => {
          if (chrome.runtime.lastError || !res) {
            try {
              await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content/content-script.js'],
              });
              setTimeout(() => {
                chrome.tabs.sendMessage(tabId, { type: 'START_MONITORING' }, (res2) => {
                  if (res2?.success) setSessionState('MONITORING');
                });
              }, 200);
            } catch (err) {
              console.error("Script injection error:", err);
            }
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
      if (tabs[0]?.id && chrome.sidePanel && chrome.sidePanel.open) {
        chrome.sidePanel.open({ tabId: tabs[0].id });
      }
    });
  };

  const openDashboard = () => {
    chrome.tabs.create({ url: 'http://localhost:5173' });
  };

  return (
    <div className="p-4 space-y-4 h-full flex flex-col justify-between bg-white text-slate-900 font-sans">
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
        {auth.isAuthenticated && (
          <button onClick={handleLogout} className="text-slate-400 hover:text-rose-600 p-1" title="Sign Out">
            <LogOut size={14} />
          </button>
        )}
      </div>

      {/* Main Body */}
      {!auth.isAuthenticated ? (
        <form onSubmit={handleLogin} className="space-y-3 my-auto">
          <div className="text-center space-y-1">
            <h2 className="text-sm font-bold text-slate-900">Sign In to TrueView</h2>
            <p className="text-[11px] text-slate-500">Connect extension to TrueView AI account</p>
          </div>

          {loginError && (
            <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-medium">
              {loginError}
            </div>
          )}

          <div>
            <label className="text-[10px] font-semibold text-slate-600 block mb-1">Email Address</label>
            <input
              type="email"
              required
              placeholder="proctor@trueview.ai"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-slate-800"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-600 block mb-1">Password</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-slate-800"
            />
          </div>

          <button type="submit" className="w-full py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold">
            Authenticate Extension
          </button>
        </form>
      ) : (
        <div className="space-y-3 flex-1 overflow-y-auto">
          {/* User Info */}
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <User size={14} className="text-slate-700" />
              <span className="font-semibold text-slate-900 truncate max-w-[140px]">
                {auth.user?.name || auth.user?.email || 'Authenticated User'}
              </span>
            </div>
            <span className="text-[10px] font-semibold text-emerald-800 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200">
              CONNECTED
            </span>
          </div>

          {/* Platform Status */}
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Target Environment:</span>
              <b className="text-slate-900">{platformInfo?.platform || 'Detecting...'}</b>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Monitoring Status:</span>
              <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${sessionState === 'MONITORING' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-200 text-slate-700'}`}>
                {sessionState}
              </span>
            </div>
          </div>

          {/* Monitoring Controls */}
          {sessionState === 'MONITORING' ? (
            <button
              onClick={handleStopMonitoring}
              className="w-full py-2.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold flex items-center justify-center gap-2"
            >
              <Square size={14} />
              Stop AI Monitoring
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

          {/* Secondary Links */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              onClick={openSidePanel}
              className="py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs flex items-center justify-center gap-1.5 font-medium"
            >
              <Video size={13} />
              Side Panel
            </button>
            <button
              onClick={openDashboard}
              className="py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs flex items-center justify-center gap-1.5 font-medium"
            >
              <ExternalLink size={13} />
              Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-[10px] text-slate-400 text-center pt-2 border-t border-slate-200">
        TrueView AI Engine • Manifest V3 Autonomous Layer
      </div>
    </div>
  );
}
