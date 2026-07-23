/**
 * Microsoft Teams Web Adapter – TrueView AI Extension
 * Handles teams.microsoft.com SPA detection and session context extraction.
 */

import { PlatformAdapter } from '../base/PlatformAdapter';
import { PlatformInfo, SessionMode } from '../../types';

export class TeamsWebAdapter implements PlatformAdapter {
  name = 'Microsoft Teams Web';

  detectPlatform(): PlatformInfo {
    const href = window.location.href;
    const hostname = window.location.hostname;
    const isTeams = hostname.includes('teams.microsoft.com') || hostname.includes('teams.live.com');

    return {
      platform: 'TEAMS_WEB',
      supported: isTeams,
      url: href,
      hostname,
      confidence: isTeams ? 1.0 : 0.0,
    };
  }

  isSessionActive(): boolean {
    return window.location.href.includes('/calling/') || window.location.href.includes('/meet/');
  }

  getSessionContext(): { title: string; sessionId: string; mode: SessionMode; url: string } {
    const pageTitle = document.title || 'Teams Meeting Session';

    let mode: SessionMode = 'MEETING';
    const lowerTitle = pageTitle.toLowerCase();
    if (lowerTitle.includes('exam') || lowerTitle.includes('assessment')) {
      mode = 'EXAM';
    } else if (lowerTitle.includes('interview')) {
      mode = 'INTERVIEW';
    } else if (lowerTitle.includes('class') || lowerTitle.includes('lecture')) {
      mode = 'ONLINE_CLASS';
    }

    return {
      title: pageTitle.replace('| Microsoft Teams', '').trim(),
      sessionId: `teams_${Date.now()}`,
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
