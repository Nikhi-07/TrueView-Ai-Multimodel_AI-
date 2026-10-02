/**
 * TrueView AI Monitor Extension Shared TypeScript Interfaces
 */

export type SessionState =
  | 'NO_SESSION'
  | 'SESSION_AVAILABLE'
  | 'CONSENT_REQUIRED'
  | 'READY'
  | 'MONITORING'
  | 'PAUSED'
  | 'DEGRADED'
  | 'DISCONNECTED'
  | 'ENDING'
  | 'COMPLETED'
  | 'ERROR';

export type SessionMode = 'EXAM' | 'INTERVIEW' | 'ONLINE_CLASS' | 'MEETING' | 'WORKPLACE' | 'CUSTOM';

export type PlatformType = 'GOOGLE_MEET' | 'TEAMS_WEB' | 'GENERIC' | 'UNKNOWN';

export interface PlatformInfo {
  platform: PlatformType;
  supported: boolean;
  url: string;
  hostname: string;
  confidence: number;
}

export interface UserAuth {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    organization?: string;
    fullName?: string;
  } | null;
  isAuthenticated: boolean;
}

export interface UnifiedAIState {
  session_id: string;
  status: string;
  identity: {
    verified: boolean;
    confidence: number;
    user_id?: string;
    status?: string;
  };
  liveness: {
    status: string;
    confidence: number;
  };
  attention: {
    status: string;
    score: number;
    gaze: string;
    head_pose: string;
    distraction_duration_sec?: number;
  };
  audio: {
    speaking: boolean;
    noise_level: string;
    voice_confidence: number;
  };
  environment: {
    person_count: number;
    phone_detected: boolean;
    objects: Array<{ label: string; confidence: number }>;
  };
  behaviour: {
    current_state: string;
    events: Array<{
      event_id: string;
      type: string;
      severity: string;
      evidence: string;
      confidence: number;
      duration?: number;
    }>;
  };
  risk: {
    score: number;
    current: number;
    peak: number;
    level: 'NORMAL' | 'RISK INDICATOR' | 'SUSPICIOUS EVENT' | 'REVIEW RECOMMENDED' | 'HIGH-RISK EVENT' | 'CRITICAL' | 'HIGH' | 'MEDIUM';
  };
  decision: {
    action: string;
    reasons: string[];
  };
  performance: {
    fps: number;
    latency_ms: number;
  };
  module_health: Record<string, string>;
}

export type ExtensionMessageType =
  | 'GET_SESSION_STATE'
  | 'PLATFORM_DETECTED'
  | 'START_MONITORING'
  | 'STOP_MONITORING'
  | 'AI_STATE_UPDATE'
  | 'EVENT_RECEIVED'
  | 'CONNECTION_CHANGED'
  | 'PERMISSION_CHANGED'
  | 'AUTHENTICATE'
  | 'LOGOUT'
  | 'OPEN_SIDE_PANEL'
  | 'TRIGGER_LIVENESS_CHALLENGE';

export interface ExtensionMessage {
  type: ExtensionMessageType;
  payload?: any;
}
