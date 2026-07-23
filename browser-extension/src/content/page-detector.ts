/**
 * Page Detector – TrueView AI Extension
 * Selects the appropriate PlatformAdapter (Google Meet, Teams Web, or Generic).
 */

import { PlatformAdapter } from '../platforms/base/PlatformAdapter';
import { GoogleMeetAdapter } from '../platforms/google-meet/GoogleMeetAdapter';
import { TeamsWebAdapter } from '../platforms/teams-web/TeamsWebAdapter';
import { GenericWebAdapter } from '../platforms/generic/GenericWebAdapter';
import { PlatformInfo } from '../types';

export class PageDetector {
  private adapters: PlatformAdapter[];

  constructor() {
    this.adapters = [
      new GoogleMeetAdapter(),
      new TeamsWebAdapter(),
    ];
  }

  detect(): { adapter: PlatformAdapter; info: PlatformInfo } {
    for (const adapter of this.adapters) {
      const info = adapter.detectPlatform();
      if (info.supported) {
        return { adapter, info };
      }
    }
    // Fallback to generic adapter
    const generic = new GenericWebAdapter();
    return { adapter: generic, info: generic.detectPlatform() };
  }
}
