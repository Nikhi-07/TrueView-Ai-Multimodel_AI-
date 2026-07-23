/**
 * Google Meet Platform Adapter – TrueView AI Extension
 * Handles meet.google.com SPA detection, session URL extraction, and meeting state checks.
 */

import { PlatformAdapter } from '../base/PlatformAdapter';
import { PlatformInfo, SessionMode } from '../../types';

export class GoogleMeetAdapter implements PlatformAdapter {
  name = 'Google Meet';

  detectPlatform(): PlatformInfo {
    const href = window.location.href;
    const hostname = window.location.hostname;
    const isMeet = hostname.includes('meet.google.com');

    return {
      platform: 'GOOGLE_MEET',
      supported: isMeet,
      url: href,
      hostname,
      confidence: isMeet ? 1.0 : 0.0,
    };
  }

  isSessionActive(): boolean {
    // Check if in an active meeting call (meet URL pattern meet.google.com/abc-defg-hij)
    const pathname = window.location.pathname;
    const codePattern = /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/i;
    return codePattern.test(pathname);
  }

  getSessionContext(): { title: string; sessionId: string; mode: SessionMode; url: string } {
    const pathname = window.location.pathname;
    const meetCode = pathname.replace('/', '').replace(/-/g, '') || `meet_${Date.now()}`;
    const pageTitle = document.title || 'Google Meet Session';

    // Mode determination
    let mode: SessionMode = 'MEETING';
    const lowerTitle = pageTitle.toLowerCase();
    if (lowerTitle.includes('exam') || lowerTitle.includes('quiz') || lowerTitle.includes('test')) {
      mode = 'EXAM';
    } else if (lowerTitle.includes('interview') || lowerTitle.includes('assessment')) {
      mode = 'INTERVIEW';
    } else if (lowerTitle.includes('class') || lowerTitle.includes('lecture')) {
      mode = 'ONLINE_CLASS';
    }

    return {
      title: pageTitle.replace('- Google Meet', '').trim(),
      sessionId: `meet_${meetCode}`,
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
