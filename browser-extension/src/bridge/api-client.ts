/**
 * TrueView REST API Client – Browser Extension
 * Bridges communication between:
 *   - TrueView AI Engine  (FastAPI, port 8000) — frame processing
 *   - TrueView Node.js    (Express, port 5000) — sessions, reports, logging
 *
 * Sessions started by the extension are registered in MongoDB and will appear
 * in "My Sessions" (/sessions) and "Reports" (/reports) in the main dashboard.
 */

import { UnifiedAIState, SessionMode } from '../types';

const FASTAPI_AI_URL = 'http://localhost:8000/api/ai';
const NODE_API_URL = 'http://localhost:5000/api';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: get stored JWT token
// ─────────────────────────────────────────────────────────────────────────────
function getAuthHeaders(token?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

async function getStoredToken(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get('token', (data) => {
        resolve(data?.token || null);
      });
    } catch {
      resolve(null);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TrueView AI Engine (FastAPI) — frame-level inference
// ─────────────────────────────────────────────────────────────────────────────
export class TrueViewApiClient {
  static async startSession(sessionId: string, userId: string, mode: SessionMode): Promise<any> {
    const res = await fetch(`${FASTAPI_AI_URL}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, user_id: userId, session_type: mode }),
    });
    return res.json();
  }

  static async processFrame(
    sessionId: string,
    mode: SessionMode,
    frameBase64: string | null,
    audioSamples: number[] | null
  ): Promise<UnifiedAIState> {
    const res = await fetch(`${FASTAPI_AI_URL}/session/${sessionId}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        user_id: 'extension_candidate',
        session_type: mode,
        video_frame: frameBase64,
        audio_samples: audioSamples,
        timestamp: Date.now() / 1000.0,
      }),
    });
    return res.json();
  }

  static async stopSession(sessionId: string): Promise<any> {
    const res = await fetch(`${FASTAPI_AI_URL}/session/${sessionId}/stop`, {
      method: 'POST',
    });
    return res.json();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TrueView Node.js Backend — session lifecycle + reporting
// These calls register the session / report in MongoDB so they appear in
// "My Sessions" and "Reports" in the main TrueView dashboard.
// ─────────────────────────────────────────────────────────────────────────────
export class TrueViewSessionClient {
  /**
   * Register a new proctoring session in MongoDB the moment monitoring starts.
   * This makes the session appear immediately in "My Sessions" with ACTIVE status.
   */
  static async registerSession(
    sessionId: string,
    opts: {
      roomId?: string;
      roomTitle?: string;
      mode?: string;
      userName?: string;
      userEmail?: string;
    }
  ): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    try {
      const token = await getStoredToken();
      const res = await fetch(`${NODE_API_URL}/ai-engine/sessions/${sessionId}/start`, {
        method: 'POST',
        headers: getAuthHeaders(token || undefined),
        body: JSON.stringify({
          roomId: opts.roomId || null,
          roomTitle: opts.roomTitle || null,
          mode: opts.mode || 'EXAM',
          sessionType: opts.mode || 'EXAM',
          source: 'EXTENSION',
          userName: opts.userName,
          userEmail: opts.userEmail,
        }),
      });
      const data = await res.json();
      return { success: data.success === true, sessionId: data.sessionId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Log a frame's AI output to Node.js backend.
   * This keeps the Session document updated with latest risk scores and alerts.
   */
  static async logEvent(sessionId: string, aiState: UnifiedAIState): Promise<void> {
    try {
      const token = await getStoredToken();
      await fetch(`${NODE_API_URL}/ai-engine/log`, {
        method: 'POST',
        headers: getAuthHeaders(token || undefined),
        body: JSON.stringify({
          ...aiState,
          session_id: sessionId,
        }),
      });
    } catch (_) {}
  }

  /**
   * Finalize a monitoring session.
   * Node.js computes integrity score, saves Session as COMPLETED, and creates
   * a Report document in MongoDB — visible immediately in "Reports".
   * Socket.IO emits REPORT_CREATED + SESSION_COMPLETED for real-time refresh.
   */
  static async finalizeSession(
    sessionId: string,
    opts?: { roomId?: string; roomTitle?: string }
  ): Promise<{ success: boolean; reportId?: string; integrityScore?: number; error?: string }> {
    try {
      const token = await getStoredToken();
      const res = await fetch(`${NODE_API_URL}/ai-engine/sessions/${sessionId}/end`, {
        method: 'POST',
        headers: getAuthHeaders(token || undefined),
        body: JSON.stringify({
          roomId: opts?.roomId || null,
          roomTitle: opts?.roomTitle || null,
          source: 'EXTENSION',
        }),
      });
      const data = await res.json();
      if (data.success) {
        return {
          success: true,
          reportId: data.report?.reportId,
          integrityScore: data.session?.overallIntegrityScore ?? data.report?.overallIntegrityScore,
        };
      }
      return { success: false, error: data.message };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
