/**
 * TrueView REST API Client – Browser Extension
 * Bridges communication with TrueView AI Engine (port 8000) and Express server (port 5001).
 */

import { UnifiedAIState, SessionMode } from '../types';

const FASTAPI_AI_URL = 'http://localhost:8000/api/ai';

export class TrueViewApiClient {
  static async startSession(sessionId: string, userId: string, mode: SessionMode): Promise<any> {
    const res = await fetch(`${FASTAPI_AI_URL}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        user_id: userId,
        session_type: mode,
      }),
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
