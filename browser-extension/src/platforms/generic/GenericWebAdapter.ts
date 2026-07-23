/**
 * Generic Web Adapter – TrueView AI Extension
 * Allows authorized custom exam portals, LMS platforms, or custom web domains to use TrueView monitoring.
 */

import { PlatformAdapter } from '../base/PlatformAdapter';
import { PlatformInfo, SessionMode } from '../../types';

export class GenericWebAdapter implements PlatformAdapter {
  name = 'Generic Supported Website';

  detectPlatform(): PlatformInfo {
    const href = window.location.href;
    const hostname = window.location.hostname;

    return {
      platform: 'GENERIC',
      supported: true,
      url: href,
      hostname,
      confidence: 0.8,
    };
  }

  isSessionActive(): boolean {
    return true;
  }

  getSessionContext(): { title: string; sessionId: string; mode: SessionMode; url: string } {
    const pageTitle = document.title || 'Generic Session';

    let mode: SessionMode = 'EXAM';
    const lowerTitle = pageTitle.toLowerCase();
    if (lowerTitle.includes('interview')) {
      mode = 'INTERVIEW';
    } else if (lowerTitle.includes('class') || lowerTitle.includes('lecture')) {
      mode = 'ONLINE_CLASS';
    } else if (lowerTitle.includes('meeting')) {
      mode = 'MEETING';
    }

    return {
      title: pageTitle.trim(),
      sessionId: `generic_${Date.now()}`,
      mode,
      url: window.location.href,
    };
  }

  observeNavigation(onStateChange: () => void): void {
    let lastUrl = window.location.href;
    const observer = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        onStateChange();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}
