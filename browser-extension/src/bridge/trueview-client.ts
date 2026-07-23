/**
 * Master TrueView Bridge – Chrome Extension
 * Coordinates frame capture, audio streaming, AI processing loop, and state dispatch.
 */

import { TrueViewApiClient } from './api-client';
import { UnifiedAIState, SessionMode, SessionState } from '../types';

export class TrueViewBridge {
  private sessionId: string = '';
  private sessionMode: SessionMode = 'EXAM';
  private isRunning: boolean = false;
  private intervalId: any = null;

  private onStateUpdateCb: ((state: UnifiedAIState) => void) | null = null;
  private onErrorCb: ((err: string) => void) | null = null;

  async startMonitoring(
    sessionId: string,
    mode: SessionMode,
    getFrame: () => string | null,
    onStateUpdate: (state: UnifiedAIState) => void,
    onError: (err: string) => void
  ): Promise<boolean> {
    this.sessionId = sessionId;
    this.sessionMode = mode;
    this.onStateUpdateCb = onStateUpdate;
    this.onErrorCb = onError;

    try {
      // 1. Initialize session in AI Engine
      await TrueViewApiClient.startSession(sessionId, 'candidate_ext', mode);
      this.isRunning = true;

      // 2. Start unified processing loop (~4 Hz)
      this.intervalId = setInterval(async () => {
        if (!this.isRunning) return;
        try {
          const frameBase64 = getFrame();
          const state = await TrueViewApiClient.processFrame(
            this.sessionId,
            this.sessionMode,
            frameBase64,
            null
          );
          if (state && this.onStateUpdateCb) {
            this.onStateUpdateCb(state);
          }
        } catch (err: any) {
          if (this.onErrorCb) this.onErrorCb(err.message || 'AI Engine processing failure');
        }
      }, 250);

      return true;
    } catch (err: any) {
      if (this.onErrorCb) this.onErrorCb(err.message || 'Failed to start AI session');
      return false;
    }
  }

  async stopMonitoring(): Promise<void> {
    this.isRunning = false;
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.sessionId) {
      await TrueViewApiClient.stopSession(this.sessionId).catch(() => {});
    }
  }
}
