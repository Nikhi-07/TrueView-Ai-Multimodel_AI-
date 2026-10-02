/**
 * TrueView Auth Service – Chrome Extension
 *
 * 2-stage authentication:
 *   Stage 1: Password credentials → POST /api/auth/login
 *   Stage 2: Face biometric verification (multi-frame) → POST /api/auth/face-login
 *
 * Face verification matches the system's existing biometric flow:
 *   MiniFASNet liveness check + SFace identity verification
 */

import { ExtensionStorage } from '../storage/extension-storage';
import { UserAuth } from '../types';

const API_BASE_URL = 'http://localhost:5000/api';

// ─────────────────────────────────────────────────────────────────────────────
// Stage 1: Password Authentication
// ─────────────────────────────────────────────────────────────────────────────
export interface CredentialResult {
  success: boolean;
  error?: string;
  user?: any;
  token?: string;
  requiresFaceVerification?: boolean;
}

export class AuthService {
  static async login(
    email: string,
    pass: string
  ): Promise<CredentialResult> {
    const trimmedEmail = (email || '').trim();
    const baseUrls = [API_BASE_URL, 'http://127.0.0.1:5000/api'];
    let lastError = 'Cannot reach TrueView server.';

    for (const baseUrl of baseUrls) {
      try {
        // Try dedicated extension-login endpoint first
        let res = await fetch(`${baseUrl}/auth/extension-login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-client-type': 'extension',
          },
          body: JSON.stringify({ email: trimmedEmail, password: pass, isExtension: true }),
        });

        // Fallback to /auth/login with extension markers if endpoint not found
        if (res.status === 404) {
          res = await fetch(`${baseUrl}/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-client-type': 'extension',
            },
            body: JSON.stringify({ email: trimmedEmail, password: pass, isExtension: true }),
          });
        }

        const data = await res.json().catch(() => ({}));

        if (res.ok && (data.token || data.tempLoginToken)) {
          const userObj = data.user || {
            id: data.userId || 'user_1',
            name: data.fullName || trimmedEmail.split('@')[0],
            email: trimmedEmail,
            role: data.role || 'user',
          };

          const activeToken = data.token || data.tempLoginToken;
          const isDirectAuth = Boolean(data.token && !data.requiresFaceScan);

          await ExtensionStorage.setAuth({
            token: activeToken,
            user: userObj,
            isAuthenticated: isDirectAuth,
          });

          return {
            success: true,
            user: userObj,
            token: activeToken,
            requiresFaceVerification: Boolean(data.requiresFaceScan || (!data.token && userObj.role !== 'admin')),
          };
        }

        if (data && data.message) {
          return { success: false, error: data.message };
        }
      } catch (err: any) {
        lastError = err.message || lastError;
      }
    }

    return { success: false, error: lastError };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Stage 2: Biometric Face Verification
  // Sends multiple frames for liveness + identity check.
  // POST /api/auth/face-login → { success, token, user, confidence }
  // ─────────────────────────────────────────────────────────────────────────
  static async verifyFace(
    frames: string[],          // base64 JPEG frames (strip data: prefix)
    token: string,             // JWT from stage 1
    email?: string             // optional target email
  ): Promise<{ success: boolean; confidence?: number; error?: string }> {
    try {
      // Use the primary frame for face-login (backend expects single image)
      const primaryFrame = frames[0];
      if (!primaryFrame) {
        return { success: false, error: 'No frame captured for verification.' };
      }

      // Strip data URI prefix if present
      const imageData = primaryFrame.replace(/^data:image\/\w+;base64,/, '');
      const cleanedFrames = frames.map(f => f.replace(/^data:image\/\w+;base64,/, ''));

      const currentAuth = await ExtensionStorage.getAuth();
      const targetEmail = email || currentAuth.user?.email || '';

      const baseUrls = [API_BASE_URL, 'http://127.0.0.1:5000/api'];
      let lastErr = 'Face verification unreachable.';

      for (const baseUrl of baseUrls) {
        try {
          const res = await fetch(`${baseUrl}/auth/face-login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              email: targetEmail,
              tempLoginToken: token,
              image: imageData,
              frames: cleanedFrames,
            }),
          });

          const data = await res.json().catch(() => ({}));

          if (res.ok && data.success) {
            // Update stored token if face-login issues a new one
            const finalToken = data.token || token;
            await ExtensionStorage.setAuth({
              ...currentAuth,
              token: finalToken,
              isAuthenticated: true,
            });
            return { success: true, confidence: data.confidence ?? data.score ?? 1.0 };
          }

          return {
            success: false,
            confidence: data.confidence ?? 0,
            error: data.message || 'Face verification failed.',
          };
        } catch (err: any) {
          lastErr = err.message || lastErr;
        }
      }

      return { success: false, error: lastErr };
    } catch (err: any) {
      // Network error in face verification — degrade gracefully
      return { success: false, error: err.message || 'Face verification unreachable.' };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Logout
  // ─────────────────────────────────────────────────────────────────────────
  static async logout(): Promise<void> {
    await ExtensionStorage.clearAuth();
  }

  static async getCurrentAuth(): Promise<UserAuth> {
    return ExtensionStorage.getAuth();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Check if a face verification endpoint exists on the server
  // ─────────────────────────────────────────────────────────────────────────
  static async isFaceLoginAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/face-login`, { method: 'HEAD' });
      return res.status !== 404;
    } catch {
      return false;
    }
  }
}
