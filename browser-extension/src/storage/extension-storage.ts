/**
 * Chrome Storage Local Wrapper
 * Safely persists non-sensitive configuration, user consent, and UI preferences.
 */

import { UserAuth, SessionState } from '../types';

export class ExtensionStorage {
  static async getAuth(): Promise<UserAuth> {
    const data = await chrome.storage.local.get(['token', 'user']);
    return {
      token: data.token || '',
      user: data.user || null,
      isAuthenticated: Boolean(data.token),
    };
  }

  static async setAuth(auth: Partial<UserAuth>): Promise<void> {
    await chrome.storage.local.set({
      token: auth.token || '',
      user: auth.user || null,
    });
  }

  static async clearAuth(): Promise<void> {
    await chrome.storage.local.remove(['token', 'user']);
  }

  static async getConsentAcknowledged(): Promise<boolean> {
    const data = await chrome.storage.local.get('consent_acknowledged');
    return Boolean(data.consent_acknowledged);
  }

  static async setConsentAcknowledged(value: boolean): Promise<void> {
    await chrome.storage.local.set({ consent_acknowledged: value });
  }

  static async getWidgetPosition(): Promise<{ x: number; y: number } | null> {
    const data = await chrome.storage.local.get('widget_pos');
    return data.widget_pos || null;
  }

  static async setWidgetPosition(pos: { x: number; y: number }): Promise<void> {
    await chrome.storage.local.set({ widget_pos: pos });
  }
}
