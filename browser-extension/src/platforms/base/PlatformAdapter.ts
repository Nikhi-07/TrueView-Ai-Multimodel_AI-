/**
 * PlatformAdapter Interface – TrueView AI Extension
 * Defines standard contracts for platform-specific SPA web application detection & context.
 */

import { PlatformInfo, SessionMode } from '../../types';

export interface PlatformAdapter {
  name: string;
  detectPlatform(): PlatformInfo;
  isSessionActive(): boolean;
  getSessionContext(): {
    title: string;
    sessionId: string;
    mode: SessionMode;
    url: string;
  };
  observeNavigation(onStateChange: () => void): void;
}
