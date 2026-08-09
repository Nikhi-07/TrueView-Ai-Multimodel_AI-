/**
 * TrueView Auth Service – Chrome Extension
 * Connects authentication to existing TrueView Node.js Express server (:5000).
 */

import { ExtensionStorage } from '../storage/extension-storage';
import { UserAuth } from '../types';

const API_BASE_URL = 'http://localhost:5000/api';

export class AuthService {
  static async login(email: string, pass: string): Promise<{ success: boolean; error?: string; user?: any }> {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        const userObj = data.user || { id: 'user_1', name: email.split('@')[0], email, role: 'proctor' };
        await ExtensionStorage.setAuth({
          token: data.token,
          user: userObj,
          isAuthenticated: true,
        });
        return { success: true, user: userObj };
      }
      return { success: false, error: data.message || 'Authentication failed.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Cannot reach TrueView server.' };
    }
  }

  static async logout(): Promise<void> {
    await ExtensionStorage.clearAuth();
  }

  static async getCurrentAuth(): Promise<UserAuth> {
    return ExtensionStorage.getAuth();
  }
}
