/**
 * TrueView AI – Session-Type Policies & AI Event Fusion Engine
 * 
 * Rules for: EXAM, INTERVIEW, CLASS, MEETING
 */

export const SESSION_POLICIES = {
  EXAM: {
    id: 'EXAM',
    name: 'Examination Mode',
    strictness: 'STRICT',
    description: 'Maximum AI surveillance. High penalty for gaze deviation, phone, speaking, or multiple faces.',
    warningLimit: 5,
    criticalLimit: 3,
    suspensionLimit: 1,
    rules: {
      facePresence: { required: true, severityOnAbsence: 'HIGH' },
      identityVerification: { required: true, severityOnMismatch: 'CRITICAL' },
      livenessCheck: { required: true, severityOnFail: 'CRITICAL' },
      multipleFaces: { allowed: false, severity: 'CRITICAL' },
      gazeDeviation: { allowed: false, thresholdSec: 2.0, severity: 'MEDIUM' },
      phoneDetection: { allowed: false, severity: 'HIGH' },
      unauthorizedObjects: { allowed: false, severity: 'HIGH' },
      voiceActivity: { allowed: false, severity: 'MEDIUM' },
      unknownSpeaker: { allowed: false, severity: 'HIGH' },
      cameraInterruption: { action: 'SUSPEND_IMMEDIATELY', severity: 'CRITICAL' },
      microphoneInterruption: { action: 'SUSPEND_IMMEDIATELY', severity: 'CRITICAL' },
    }
  },
  INTERVIEW: {
    id: 'INTERVIEW',
    name: 'Interview Mode',
    strictness: 'MODERATE',
    description: 'Monitors identity, face, liveness, and voice. Speech is expected and permitted.',
    warningLimit: 8,
    criticalLimit: 5,
    suspensionLimit: 3,
    rules: {
      facePresence: { required: true, severityOnAbsence: 'MEDIUM' },
      identityVerification: { required: true, severityOnMismatch: 'HIGH' },
      livenessCheck: { required: true, severityOnFail: 'HIGH' },
      multipleFaces: { allowed: false, severity: 'MEDIUM' },
      gazeDeviation: { allowed: true, thresholdSec: 6.0, severity: 'LOW' },
      phoneDetection: { allowed: false, severity: 'HIGH' },
      unauthorizedObjects: { allowed: false, severity: 'MEDIUM' },
      voiceActivity: { allowed: true, severity: 'INFO' },
      unknownSpeaker: { allowed: false, severity: 'MEDIUM' },
      cameraInterruption: { action: 'NOTIFY_AND_PAUSE', severity: 'HIGH' },
      microphoneInterruption: { action: 'NOTIFY_AND_PAUSE', severity: 'HIGH' },
    }
  },
  CLASS: {
    id: 'CLASS',
    name: 'Online Class Mode',
    strictness: 'PERMISSIVE',
    description: 'Tracks presence, participation, and technical status. Ignores gaze deviation and note taking.',
    warningLimit: 15,
    criticalLimit: 10,
    suspensionLimit: 5,
    rules: {
      facePresence: { required: true, severityOnAbsence: 'LOW' },
      identityVerification: { required: false, severityOnMismatch: 'INFO' },
      livenessCheck: { required: false, severityOnFail: 'INFO' },
      multipleFaces: { allowed: true, severity: 'INFO' },
      gazeDeviation: { allowed: true, thresholdSec: 15.0, severity: 'INFO' },
      phoneDetection: { allowed: true, severity: 'INFO' },
      unauthorizedObjects: { allowed: true, severity: 'INFO' },
      voiceActivity: { allowed: true, severity: 'INFO' },
      unknownSpeaker: { allowed: true, severity: 'INFO' },
      cameraInterruption: { action: 'WARN_PARTICIPANT', severity: 'MEDIUM' },
      microphoneInterruption: { action: 'WARN_PARTICIPANT', severity: 'MEDIUM' },
    }
  },
  MEETING: {
    id: 'MEETING',
    name: 'Meeting Mode',
    strictness: 'MINIMAL',
    description: 'Focuses on stream health, identity presence, and participant activity.',
    warningLimit: 20,
    criticalLimit: 15,
    suspensionLimit: 10,
    rules: {
      facePresence: { required: true, severityOnAbsence: 'INFO' },
      identityVerification: { required: false, severityOnMismatch: 'INFO' },
      livenessCheck: { required: false, severityOnFail: 'INFO' },
      multipleFaces: { allowed: true, severity: 'INFO' },
      gazeDeviation: { allowed: true, thresholdSec: 30.0, severity: 'INFO' },
      phoneDetection: { allowed: true, severity: 'INFO' },
      unauthorizedObjects: { allowed: true, severity: 'INFO' },
      voiceActivity: { allowed: true, severity: 'INFO' },
      unknownSpeaker: { allowed: true, severity: 'INFO' },
      cameraInterruption: { action: 'NOTIFY_ONLY', severity: 'LOW' },
      microphoneInterruption: { action: 'NOTIFY_ONLY', severity: 'LOW' },
    }
  }
};

/**
 * Evaluate AI event severity contextualized by session mode
 */
export function evaluateEventSeverity(eventType, sessionType = 'EXAM') {
  const policy = SESSION_POLICIES[sessionType] || SESSION_POLICIES.EXAM;
  const rules = policy.rules;

  switch (eventType) {
    case 'CAMERA_INTERRUPTED':
      return rules.cameraInterruption.severity;

    case 'MICROPHONE_INTERRUPTED':
      return rules.microphoneInterruption.severity;

    case 'MULTIPLE_FACES_DETECTED':
    case 'MULTIPLE_PERSONS':
      return rules.multipleFaces.severity;

    case 'PHONE_DETECTED':
      return rules.phoneDetection.severity;

    case 'UNAUTHORIZED_OBJECT':
      return rules.unauthorizedObjects.severity;

    // Identity mismatch uses the identity rule, NOT the speaker rule.
    case 'IDENTITY_MISMATCH':
      return rules.identityVerification.severityOnMismatch;

    // Liveness / anti-spoof failures use the liveness rule (spec: a critical
    // liveness failure must surface as CRITICAL in EXAM, not LOW).
    case 'LIVENESS_FAILED':
    case 'ACTIVE_CHALLENGE_FAILED':
    case 'SPOOF_DETECTED':
      return rules.livenessCheck.severityOnFail;

    case 'UNKNOWN_SPEAKER':
    case 'MULTIPLE_SPEAKERS':
      return sessionType === 'EXAM' ? 'HIGH' : rules.unknownSpeaker.severity;

    case 'GAZE_DEVIATION':
    case 'LOOKING_AWAY':
    // Attention status granularity emitted by the AI engine (all are gaze events)
    case 'OFFSCREEN_GLANCE':
    case 'REPEATED_DISTRACTION':
    case 'PROLONGED_DISTRACTION':
      return rules.gazeDeviation.severity;

    case 'USER_ABSENT':
    case 'NO_FACE_DETECTED':
      return rules.facePresence.severityOnAbsence;

    case 'VOICE_DETECTED':
    case 'SPEECH_DETECTED':
    case 'SPEAKING_DETECTED':
    case 'REGISTERED_SPEAKER':
      return rules.voiceActivity.severity;

    case 'PARTICIPANT_JOINED':
    case 'PARTICIPANT_LEFT':
    case 'SESSION_STARTED':
      return 'INFO';

    default:
      return 'LOW';
  }
}

/**
 * Fuse multi-modal signals to calculate a dynamic trust score (0 - 100)
 */
export function calculateTrustScore(alerts = [], sessionType = 'EXAM') {
  let score = 100;
  
  alerts.forEach(alert => {
    const severity = alert.severity || evaluateEventSeverity(alert.eventType || alert.type, sessionType);
    
    if (severity === 'CRITICAL') {
      score -= 30;
    } else if (severity === 'HIGH') {
      score -= 15;
    } else if (severity === 'MEDIUM') {
      score -= 8;
    } else if (severity === 'LOW') {
      score -= 3;
    }
  });

  return Math.max(0, Math.min(100, Math.round(score)));
}
