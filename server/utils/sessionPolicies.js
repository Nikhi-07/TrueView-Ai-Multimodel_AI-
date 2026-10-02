// utils/sessionPolicies.js
// TrueView AI – Server-Authoritative Session Policies & Alert Severity Engine
// Mirrors client/src/utils/sessionPolicies.js so the backend never trusts
// severity values sent by the frontend.

const MONITORING_PROFILES = {
  MODERATE: {
    id: 'MODERATE',
    name: 'Moderate Monitoring',
    strictness: 'MODERATE',
    warningLimit: 8,
    criticalLimit: 4,
    suspensionLimit: 2,
    rules: {
      eyesClosed: { thresholdSec: 2.5, severity: 'MEDIUM', cooldownSec: 8 },
      gazeDeviation: { thresholdSec: 3.0, severity: 'MEDIUM', cooldownSec: 8 },
      facePresence: { gracePeriodSec: 2.0, severityOnAbsence: 'HIGH', cooldownSec: 8 },
      headPose: { thresholdSec: 3.0, severity: 'MEDIUM', cooldownSec: 8 },
      voiceActivity: { thresholdSec: 2.0, severity: 'MEDIUM', cooldownSec: 8 },
      phoneDetection: { thresholdSec: 0.8, severity: 'HIGH' },
      multipleFaces: { thresholdSec: 0.8, severity: 'CRITICAL' },
      livenessCheck: { severityOnFail: 'CRITICAL' },
      identityVerification: { severityOnMismatch: 'CRITICAL' },
    }
  },
  STRICT: {
    id: 'STRICT',
    name: 'Strict Monitoring',
    strictness: 'STRICT',
    warningLimit: 5,
    criticalLimit: 3,
    suspensionLimit: 1,
    rules: {
      eyesClosed: { thresholdSec: 1.0, severity: 'MEDIUM', cooldownSec: 5 },
      gazeDeviation: { thresholdSec: 1.5, severity: 'HIGH', cooldownSec: 5 },
      facePresence: { gracePeriodSec: 1.0, severityOnAbsence: 'HIGH', cooldownSec: 5 },
      headPose: { thresholdSec: 1.5, severity: 'MEDIUM', cooldownSec: 5 },
      voiceActivity: { thresholdSec: 0.8, severity: 'HIGH', cooldownSec: 5 },
      phoneDetection: { thresholdSec: 0.35, severity: 'CRITICAL' },
      multipleFaces: { thresholdSec: 0.35, severity: 'CRITICAL' },
      livenessCheck: { severityOnFail: 'CRITICAL' },
      identityVerification: { severityOnMismatch: 'CRITICAL' },
    }
  },
  RELAXED: {
    id: 'RELAXED',
    name: 'Relaxed Monitoring',
    strictness: 'RELAXED',
    warningLimit: 12,
    criticalLimit: 6,
    suspensionLimit: 3,
    rules: {
      eyesClosed: { thresholdSec: 4.0, severity: 'LOW', cooldownSec: 10 },
      gazeDeviation: { thresholdSec: 5.0, severity: 'LOW', cooldownSec: 10 },
      facePresence: { gracePeriodSec: 3.5, severityOnAbsence: 'MEDIUM', cooldownSec: 10 },
      headPose: { thresholdSec: 5.0, severity: 'LOW', cooldownSec: 10 },
      voiceActivity: { thresholdSec: 3.0, severity: 'LOW', cooldownSec: 10 },
      phoneDetection: { thresholdSec: 1.5, severity: 'HIGH' },
      multipleFaces: { thresholdSec: 1.2, severity: 'HIGH' },
      livenessCheck: { severityOnFail: 'CRITICAL' },
      identityVerification: { severityOnMismatch: 'CRITICAL' },
    }
  }
};

const SESSION_POLICIES = {
  EXAM: {
    id: 'EXAM',
    name: 'Examination Mode',
    strictness: 'MODERATE', // Default examination profile is MODERATE
    profile: 'MODERATE',
    warningLimit: 8,
    criticalLimit: 4,
    suspensionLimit: 2,
    allowMediaToggle: false,
    cameraRequired: true,
    microphoneRequired: true,
    rules: {
      facePresence: { required: true, gracePeriodSec: 2.0, severityOnAbsence: 'HIGH' },
      identityVerification: { required: true, severityOnMismatch: 'CRITICAL' },
      livenessCheck: { required: true, severityOnFail: 'CRITICAL' },
      multipleFaces: { allowed: false, severity: 'CRITICAL' },
      gazeDeviation: { allowed: false, thresholdSec: 3.0, severity: 'MEDIUM' },
      eyesClosed: { thresholdSec: 2.5, severity: 'MEDIUM' },
      phoneDetection: { allowed: false, severity: 'HIGH' },
      unauthorizedObjects: { allowed: false, severity: 'HIGH' },
      voiceActivity: { allowed: false, thresholdSec: 2.0, severity: 'MEDIUM' },
      unknownSpeaker: { allowed: false, severity: 'HIGH' },
      cameraInterruption: { action: 'SUSPEND_IMMEDIATELY', severity: 'CRITICAL' },
      microphoneInterruption: { action: 'SUSPEND_IMMEDIATELY', severity: 'CRITICAL' },
    },
  },
  MODERATE: {
    id: 'MODERATE',
    name: 'Examination (Moderate)',
    strictness: 'MODERATE',
    profile: 'MODERATE',
    warningLimit: 8,
    criticalLimit: 4,
    suspensionLimit: 2,
    allowMediaToggle: false,
    cameraRequired: true,
    microphoneRequired: true,
    rules: {
      facePresence: { required: true, gracePeriodSec: 2.0, severityOnAbsence: 'HIGH' },
      identityVerification: { required: true, severityOnMismatch: 'CRITICAL' },
      livenessCheck: { required: true, severityOnFail: 'CRITICAL' },
      multipleFaces: { allowed: false, severity: 'CRITICAL' },
      gazeDeviation: { allowed: false, thresholdSec: 3.0, severity: 'MEDIUM' },
      eyesClosed: { thresholdSec: 2.5, severity: 'MEDIUM' },
      phoneDetection: { allowed: false, severity: 'HIGH' },
      unauthorizedObjects: { allowed: false, severity: 'HIGH' },
      voiceActivity: { allowed: false, thresholdSec: 2.0, severity: 'MEDIUM' },
      unknownSpeaker: { allowed: false, severity: 'HIGH' },
      cameraInterruption: { action: 'SUSPEND_IMMEDIATELY', severity: 'CRITICAL' },
      microphoneInterruption: { action: 'SUSPEND_IMMEDIATELY', severity: 'CRITICAL' },
    },
  },
  STRICT: {
    id: 'STRICT',
    name: 'Examination (Strict)',
    strictness: 'STRICT',
    profile: 'STRICT',
    warningLimit: 5,
    criticalLimit: 3,
    suspensionLimit: 1,
    allowMediaToggle: false,
    cameraRequired: true,
    microphoneRequired: true,
    rules: {
      facePresence: { required: true, gracePeriodSec: 1.0, severityOnAbsence: 'HIGH' },
      identityVerification: { required: true, severityOnMismatch: 'CRITICAL' },
      livenessCheck: { required: true, severityOnFail: 'CRITICAL' },
      multipleFaces: { allowed: false, severity: 'CRITICAL' },
      gazeDeviation: { allowed: false, thresholdSec: 1.5, severity: 'MEDIUM' },
      eyesClosed: { thresholdSec: 1.0, severity: 'MEDIUM' },
      phoneDetection: { allowed: false, severity: 'HIGH' },
      unauthorizedObjects: { allowed: false, severity: 'HIGH' },
      voiceActivity: { allowed: false, thresholdSec: 0.8, severity: 'HIGH' },
      unknownSpeaker: { allowed: false, severity: 'HIGH' },
      cameraInterruption: { action: 'SUSPEND_IMMEDIATELY', severity: 'CRITICAL' },
      microphoneInterruption: { action: 'SUSPEND_IMMEDIATELY', severity: 'CRITICAL' },
    },
  },
  RELAXED: {
    id: 'RELAXED',
    name: 'Examination (Relaxed)',
    strictness: 'RELAXED',
    profile: 'RELAXED',
    warningLimit: 12,
    criticalLimit: 6,
    suspensionLimit: 3,
    allowMediaToggle: false,
    cameraRequired: true,
    microphoneRequired: true,
    rules: {
      facePresence: { required: true, gracePeriodSec: 3.5, severityOnAbsence: 'MEDIUM' },
      identityVerification: { required: true, severityOnMismatch: 'CRITICAL' },
      livenessCheck: { required: true, severityOnFail: 'CRITICAL' },
      multipleFaces: { allowed: false, severity: 'HIGH' },
      gazeDeviation: { allowed: true, thresholdSec: 5.0, severity: 'LOW' },
      eyesClosed: { thresholdSec: 4.0, severity: 'LOW' },
      phoneDetection: { allowed: false, severity: 'HIGH' },
      unauthorizedObjects: { allowed: false, severity: 'MEDIUM' },
      voiceActivity: { allowed: true, thresholdSec: 3.0, severity: 'LOW' },
      unknownSpeaker: { allowed: false, severity: 'MEDIUM' },
      cameraInterruption: { action: 'WARN_PARTICIPANT', severity: 'HIGH' },
      microphoneInterruption: { action: 'WARN_PARTICIPANT', severity: 'HIGH' },
    },
  },
  INTERVIEW: {
    id: 'INTERVIEW',
    name: 'Interview Mode',
    strictness: 'MODERATE',
    warningLimit: 8,
    criticalLimit: 5,
    suspensionLimit: 3,
    allowMediaToggle: false,
    cameraRequired: true,
    microphoneRequired: true,
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
    },
  },
  CLASS: {
    id: 'CLASS',
    name: 'Online Class Mode',
    strictness: 'PERMISSIVE',
    warningLimit: 15,
    criticalLimit: 10,
    suspensionLimit: 5,
    allowMediaToggle: true,
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
    },
  },
  ONLINE_CLASS: {
    id: 'ONLINE_CLASS',
    name: 'Online Class Mode',
    strictness: 'PERMISSIVE',
    warningLimit: 15,
    criticalLimit: 10,
    suspensionLimit: 5,
    allowMediaToggle: true,
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
    },
  },
  MEETING: {
    id: 'MEETING',
    name: 'Meeting Mode',
    strictness: 'MINIMAL',
    warningLimit: 20,
    criticalLimit: 15,
    suspensionLimit: 10,
    allowMediaToggle: true,
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
    },
  },
  WORKPLACE: {
    id: 'WORKPLACE',
    name: 'Workplace Mode',
    strictness: 'MONITORED',
    warningLimit: 10,
    criticalLimit: 5,
    suspensionLimit: 3,
    allowMediaToggle: true,
    rules: {
      facePresence: { required: true, severityOnAbsence: 'MEDIUM' },
      identityVerification: { required: true, severityOnMismatch: 'HIGH' },
      livenessCheck: { required: true, severityOnFail: 'HIGH' },
      multipleFaces: { allowed: true, severity: 'LOW' },
      gazeDeviation: { allowed: true, thresholdSec: 15.0, severity: 'INFO' },
      phoneDetection: { allowed: false, severity: 'HIGH' },
      unauthorizedObjects: { allowed: false, severity: 'MEDIUM' },
      voiceActivity: { allowed: true, severity: 'INFO' },
      unknownSpeaker: { allowed: false, severity: 'MEDIUM' },
      cameraInterruption: { action: 'WARN_PARTICIPANT', severity: 'HIGH' },
      microphoneInterruption: { action: 'WARN_PARTICIPANT', severity: 'HIGH' },
    },
  },
};

const POLICY_THRESHOLDS = Object.fromEntries(
  Object.entries(SESSION_POLICIES).map(([mode, p]) => [
    mode,
    { warningLimit: p.warningLimit, criticalLimit: p.criticalLimit, suspensionLimit: p.suspensionLimit },
  ])
);

function getPolicy(sessionType) {
  return SESSION_POLICIES[sessionType] || SESSION_POLICIES.EXAM;
}

/**
 * Compute the authoritative severity for an AI event in a given session mode.
 */
function evaluateEventSeverity(eventType, sessionType = 'EXAM') {
  const rules = getPolicy(sessionType).rules;

  switch (eventType) {
    case 'CAMERA_INTERRUPTED':
      return rules.cameraInterruption.severity;

    case 'MICROPHONE_INTERRUPTED':
      return rules.microphoneInterruption.severity;

    case 'MULTIPLE_FACES_DETECTED':
    case 'MULTIPLE_PERSONS':
    case 'MULTIPLE_PEOPLE_DETECTED':
      return rules.multipleFaces.severity;

    case 'PHONE_DETECTED':
    case 'MOBILE_PHONE_DETECTED':
      return rules.phoneDetection.severity;

    case 'UNAUTHORIZED_OBJECT':
      return rules.unauthorizedObjects.severity;

    // Identity mismatch uses the identity rule, NOT the speaker rule.
    case 'IDENTITY_MISMATCH':
    case 'POSSIBLE_USER_REPLACEMENT':
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
    case 'EYES_CLOSED':
      return rules.gazeDeviation.severity;

    case 'HEAD_TURNED':
    case 'HEAD_MOVEMENT':
      return sessionType === 'EXAM' ? 'MEDIUM' : 'LOW';

    case 'PARTICIPANT_JOINED':
    case 'PARTICIPANT_LEFT':
    case 'SESSION_STARTED':
      return 'INFO';

    case 'USER_ABSENT':
    case 'NO_FACE_DETECTED':
      return rules.facePresence.severityOnAbsence;

    case 'VOICE_DETECTED':
    case 'SPEECH_DETECTED':
    case 'SPEAKING_DETECTED':
    case 'REGISTERED_SPEAKER':
      return rules.voiceActivity.severity;

    case 'HIGH_BACKGROUND_NOISE':
      return sessionType === 'EXAM' ? 'LOW' : 'INFO';

    case 'AI_ENGINE_OFFLINE':
      return sessionType === 'EXAM' ? 'CRITICAL' : 'MEDIUM';

    default:
      return 'LOW';
  }
}

/**
 * Fuse multi-modal signals into a trust score (0-100).
 */
function calculateTrustScore(alerts = [], sessionType = 'EXAM') {
  let score = 100;
  alerts.forEach((alert) => {
    const severity = alert.severity || evaluateEventSeverity(alert.eventType || alert.type, sessionType);
    if (severity === 'CRITICAL') score -= 30;
    else if (severity === 'HIGH') score -= 15;
    else if (severity === 'MEDIUM') score -= 8;
    else if (severity === 'LOW') score -= 3;
  });
  return Math.max(0, Math.min(100, Math.round(score)));
}

module.exports = { SESSION_POLICIES, POLICY_THRESHOLDS, evaluateEventSeverity, calculateTrustScore, getPolicy };
