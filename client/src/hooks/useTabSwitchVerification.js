import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

const isDev = Boolean(
  (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') ||
  (typeof import.meta !== 'undefined' && import.meta.env?.DEV)
);

/**
 * Authoritative Tab Switch Verification Hook
 * 
 * Rules:
 * 1. Uses document.visibilitychange / document.visibilityState as the PRIMARY signal.
 * 2. NEVER uses window.blur() or focus events to detect tab switching.
 * 3. Never counts initial page load, camera/mic permissions, or internal UI interactions.
 * 4. Requires a real VISIBLE -> HIDDEN -> VISIBLE transition with hiddenDuration >= minHiddenDurationMs (default 500ms).
 * 5. Uses unique episode ID and debouncing so a single episode increments exactly once.
 * 6. Enforces strict 3-warning policy: 1/3 Warning, 2/3 Warning, 3/3 Final Warning, 4/3 Terminate.
 */
export default function useTabSwitchVerification({
  sessionId,
  roomId,
  studentId,
  enabled = true,
  maxAllowed = 3,
  minHiddenDurationMs = 500,
  gracePeriodMs = 2500,
  onTerminated,
}) {
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [tabSwitchStatus, setTabSwitchStatus] = useState('NORMAL'); // 'NORMAL' | 'WARNING' | 'FINAL_WARNING' | 'TERMINATED'
  const [lastEventTime, setLastEventTime] = useState(null);
  const [isTerminated, setIsTerminated] = useState(false);
  const [terminationReason, setTerminationReason] = useState(null);
  const [currentWarning, setCurrentWarning] = useState(null);
  const [isMonitoringInitialized, setIsMonitoringInitialized] = useState(false);

  // Mutable refs to prevent stale closures and avoid unnecessary listener re-registrations
  const countRef = useRef(0);
  const isTerminatedRef = useRef(false);
  const isMonitoringInitializedRef = useRef(false);
  const lastTriggerTimeRef = useRef(0);
  const enabledRef = useRef(enabled);
  const onTerminatedRef = useRef(onTerminated);

  // Visibility state machine refs
  const hasActiveEpisodeRef = useRef(false);
  const hiddenAtRef = useRef(null);
  const episodeIdRef = useRef(null);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    onTerminatedRef.current = onTerminated;
  }, [onTerminated]);

  // Development-only diagnostic logging
  const logTabDebug = useCallback((fields) => {
    if (!isDev) return;
    const prefix = '[TAB DEBUG]';
    console.groupCollapsed(
      `${prefix} ${fields.event || 'Visibility Event'} — Tab Switches: ${countRef.current} / ${maxAllowed}`
    );
    if (fields.visibilityState !== undefined) console.log(`${prefix} visibilityState:`, fields.visibilityState);
    if (fields.hiddenAt !== undefined) console.log(`${prefix} hiddenAt:`, fields.hiddenAt);
    if (fields.hiddenDuration !== undefined) console.log(`${prefix} hiddenDuration:`, `${Math.round(fields.hiddenDuration)} ms`);
    if (fields.initialized !== undefined) console.log(`${prefix} initialized:`, fields.initialized);
    if (fields.episodeId !== undefined) console.log(`${prefix} episodeId:`, fields.episodeId);
    if (fields.confirmedTabSwitch !== undefined) console.log(`${prefix} confirmedTabSwitch:`, fields.confirmedTabSwitch);
    if (fields.tabSwitchCount !== undefined) console.log(`${prefix} tabSwitchCount:`, fields.tabSwitchCount);
    if (fields.terminationTriggered !== undefined) console.log(`${prefix} terminationTriggered:`, fields.terminationTriggered);
    if (fields.reason !== undefined) console.log(`${prefix} note:`, fields.reason);
    console.groupEnd();
  }, [maxAllowed]);

  // 1. Recover existing tab switch count and state on mount / reconnection
  useEffect(() => {
    if (!sessionId) return;

    let isMounted = true;
    const fetchCurrentSession = async () => {
      try {
        const res = await api.get(`/ai-engine/sessions/${sessionId}`);
        if (res.data?.success && res.data.session && isMounted) {
          const s = res.data.session;
          const count = Number(s.tabSwitchCount || 0);
          const status = s.tabSwitchStatus || (count >= 4 ? 'TERMINATED' : count === 3 ? 'FINAL_WARNING' : count > 0 ? 'WARNING' : 'NORMAL');
          const terminated = Boolean(s.status === 'TERMINATED' || count >= 4);

          setTabSwitchCount(count);
          countRef.current = count;
          setTabSwitchStatus(status);
          setIsTerminated(terminated);
          isTerminatedRef.current = terminated;

          if (s.terminationReason) {
            setTerminationReason(s.terminationReason);
          }

          if (s.tabSwitchEvents && s.tabSwitchEvents.length > 0) {
            const lastEvt = s.tabSwitchEvents[s.tabSwitchEvents.length - 1];
            setLastEventTime(new Date(lastEvt.timestamp));
          }

          if (terminated && onTerminatedRef.current) {
            onTerminatedRef.current(s.terminationReason || 'Maximum tab-switch limit exceeded');
          }
        }
      } catch (_) {}
    };

    fetchCurrentSession();
    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  // 2. Controlled initialization guard: protects page load, camera/mic permissions, and media startup
  useEffect(() => {
    if (!enabled || !sessionId) {
      isMonitoringInitializedRef.current = false;
      setIsMonitoringInitialized(false);
      return;
    }

    // Record initial document visibility state without incrementing counter
    const initialVisibility = typeof document !== 'undefined' ? document.visibilityState : 'visible';
    logTabDebug({
      event: 'Monitoring Startup (Grace Period Active)',
      visibilityState: initialVisibility,
      initialized: false,
      reason: 'Grace period running to allow camera/mic permission acquisition and media startup',
    });

    // Enforce grace period to protect permission dialogs and media startup
    const timer = setTimeout(() => {
      isMonitoringInitializedRef.current = true;
      setIsMonitoringInitialized(true);
      logTabDebug({
        event: 'Monitoring Initialized (Ready for Tab Switch Detection)',
        visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'visible',
        initialized: true,
      });
    }, gracePeriodMs);

    return () => {
      clearTimeout(timer);
      isMonitoringInitializedRef.current = false;
      setIsMonitoringInitialized(false);
    };
  }, [enabled, sessionId, gracePeriodMs, logTabDebug]);

  // 3. Authoritative server communication when a validated tab switch is confirmed
  const recordValidatedTabSwitch = useCallback(async (epId, durationMs) => {
    if (!enabledRef.current || isTerminatedRef.current || !sessionId) return;

    try {
      const res = await api.post(`/ai-engine/sessions/${sessionId}/tab-switch`, {
        roomId: roomId || undefined,
        studentId: studentId || undefined,
        episodeId: epId,
        hiddenDuration: Math.round(durationMs),
        timestamp: new Date().toISOString(),
      });

      if (res.data?.success) {
        const newCount = res.data.count;
        const newStatus = res.data.tabSwitchStatus;
        const terminated = Boolean(res.data.terminated);

        countRef.current = newCount;
        setTabSwitchCount(newCount);
        setTabSwitchStatus(newStatus);
        setLastEventTime(new Date());

        logTabDebug({
          event: 'Server Recorded Tab Switch',
          tabSwitchCount: newCount,
          visibilityState: document.visibilityState,
          episodeId: epId,
          confirmedTabSwitch: true,
          terminationTriggered: terminated,
        });

        let warningTitle = 'Tab switch detected';
        let warningText = '';

        if (newCount === 1) {
          warningText = 'Please return to the examination window. (Warning 1 of 3)';
          setCurrentWarning({ title: 'Tab switch detected', text: warningText, count: 1, level: 'warning' });
          toast.error(warningText, { duration: 5000, id: 'tab-switch-toast' });
        } else if (newCount === 2) {
          warningText = 'Tab switch detected. (Warning 2 of 3)';
          setCurrentWarning({ title: 'Tab switch detected', text: warningText, count: 2, level: 'warning' });
          toast.error(warningText, { duration: 5000, id: 'tab-switch-toast' });
        } else if (newCount === 3) {
          warningTitle = 'Final warning';
          warningText = 'Warning 3 of 3: One more tab switch will terminate your session.';
          setCurrentWarning({ title: warningTitle, text: warningText, count: 3, level: 'danger' });
          toast.error(warningText, { duration: 6000, id: 'tab-switch-toast' });
        } else if (newCount >= 4 || terminated) {
          warningTitle = 'Session terminated';
          warningText = 'Maximum tab-switch limit exceeded.';
          setCurrentWarning({ title: warningTitle, text: warningText, count: 4, level: 'critical' });
          setIsTerminated(true);
          isTerminatedRef.current = true;
          setTerminationReason('Maximum tab-switch limit exceeded');
          toast.error('Session terminated: Maximum tab-switch limit exceeded.', { duration: 8000, id: 'tab-switch-toast' });

          if (onTerminatedRef.current) {
            onTerminatedRef.current('Maximum tab-switch limit exceeded');
          }
        }
      }
    } catch (err) {
      console.warn('[useTabSwitchVerification] Error recording tab switch:', err);
    }
  }, [sessionId, roomId, studentId, logTabDebug]);

  // 4. Document Visibility State Machine (Strictly document.visibilitychange only, NO window.blur)
  useEffect(() => {
    if (!enabled || !sessionId) return;

    const onVisibilityChange = () => {
      const currentState = document.visibilityState;

      // Ignore all signals if monitoring is not yet fully initialized (protects permission requests)
      if (!isMonitoringInitializedRef.current) {
        logTabDebug({
          event: 'Pre-Init Visibility Event Ignored',
          visibilityState: currentState,
          initialized: false,
          reason: 'Monitoring not yet initialized, permission dialog or load in progress',
        });
        return;
      }

      // Ignore if session is already terminated
      if (isTerminatedRef.current) return;

      if (currentState === 'hidden') {
        // Debounce multiple consecutive hidden events: only the first VISIBLE -> HIDDEN transition initiates the episode
        if (hasActiveEpisodeRef.current) {
          logTabDebug({
            event: 'Consecutive Hidden Event Ignored (Already in Episode)',
            visibilityState: 'hidden',
            episodeId: episodeIdRef.current,
            confirmedTabSwitch: false,
          });
          return;
        }

        // Start unique visibility loss episode
        hasActiveEpisodeRef.current = true;
        hiddenAtRef.current = performance.now();
        const epId = `ep_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        episodeIdRef.current = epId;

        logTabDebug({
          event: 'Document Hidden (Episode Started)',
          visibilityState: 'hidden',
          hiddenAt: Math.round(hiddenAtRef.current),
          episodeId: epId,
          confirmedTabSwitch: false,
        });
      } else if (currentState === 'visible') {
        // Document returned to visible: validate the transition
        if (!hasActiveEpisodeRef.current || hiddenAtRef.current === null) {
          logTabDebug({
            event: 'Visible Event without Hidden Episode (Ignored)',
            visibilityState: 'visible',
            confirmedTabSwitch: false,
          });
          return;
        }

        const hiddenDuration = performance.now() - hiddenAtRef.current;
        const epId = episodeIdRef.current;

        // Reset episode tracker immediately so duplicate visible events cannot re-trigger
        hasActiveEpisodeRef.current = false;
        hiddenAtRef.current = null;
        episodeIdRef.current = null;

        // Validation Rule: Require minimum hidden duration (default >= 500ms)
        if (hiddenDuration < minHiddenDurationMs) {
          logTabDebug({
            event: 'Transient Visibility Blip Ignored (< 500ms threshold)',
            visibilityState: 'visible',
            hiddenDuration,
            episodeId: epId,
            confirmedTabSwitch: false,
            reason: `Duration ${Math.round(hiddenDuration)}ms is below required ${minHiddenDurationMs}ms threshold`,
          });
          return;
        }

        // Validation Rule: Debounce cooldown between confirmed tab switches (2000ms)
        const now = Date.now();
        if (now - lastTriggerTimeRef.current < 2000) {
          logTabDebug({
            event: 'Cooldown Debounce Active (Ignored)',
            visibilityState: 'visible',
            hiddenDuration,
            episodeId: epId,
            confirmedTabSwitch: false,
            reason: 'Triggered within 2000ms cooldown window',
          });
          return;
        }
        lastTriggerTimeRef.current = now;

        // VALIDATED TAB SWITCH CONFIRMED
        logTabDebug({
          event: 'CONFIRMED TAB SWITCH (HIDDEN -> VISIBLE Validated)',
          visibilityState: 'visible',
          hiddenDuration,
          episodeId: epId,
          confirmedTabSwitch: true,
          tabSwitchCount: countRef.current + 1,
        });

        recordValidatedTabSwitch(epId, hiddenDuration);
      }
    };

    // Strictly register visibilitychange listener ONLY — NEVER window.blur or focus
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      hasActiveEpisodeRef.current = false;
      hiddenAtRef.current = null;
      episodeIdRef.current = null;
    };
  }, [enabled, sessionId, minHiddenDurationMs, logTabDebug, recordValidatedTabSwitch]);

  // 5. Authoritatively reset tab switch state back to 0/3 (recovers from corrupted false states)
  const resetTabSwitches = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await api.post(`/ai-engine/sessions/${sessionId}/reset-tab-switches`, {
        roomId: roomId || undefined,
      });
      if (res.data?.success) {
        countRef.current = 0;
        setTabSwitchCount(0);
        setTabSwitchStatus('NORMAL');
        setIsTerminated(false);
        isTerminatedRef.current = false;
        setTerminationReason(null);
        setCurrentWarning(null);
        toast.success('Tab switch count reset to 0 / 3', { id: 'tab-switch-reset-toast' });
        logTabDebug({
          event: 'Tab Switches Authoritatively Reset to 0 / 3',
          tabSwitchCount: 0,
          confirmedTabSwitch: false,
        });
      }
    } catch (err) {
      console.warn('[useTabSwitchVerification] Reset error:', err);
    }
  }, [sessionId, roomId, logTabDebug]);

  const clearWarning = useCallback(() => {
    setCurrentWarning(null);
  }, []);

  return {
    tabSwitchCount,
    maxAllowed,
    tabSwitchStatus,
    lastEventTime,
    isTerminated,
    terminationReason,
    currentWarning,
    isMonitoringInitialized,
    clearWarning,
    resetTabSwitches,
    triggerTabSwitch: () => recordValidatedTabSwitch(`ep_manual_${Date.now()}`, 1000),
  };
}
