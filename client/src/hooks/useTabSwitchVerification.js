import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

/**
 * Reusable Tab Switch Verification Hook
 * Detects when a candidate leaves the examination/interview browser tab or window.
 * Strictly enforces a max allowed limit of 3 warnings, terminating on the 4th violation.
 */
export default function useTabSwitchVerification({
  sessionId,
  roomId,
  studentId,
  enabled = true,
  maxAllowed = 3,
  onTerminated,
}) {
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [tabSwitchStatus, setTabSwitchStatus] = useState('NORMAL'); // 'NORMAL' | 'WARNING' | 'FINAL_WARNING' | 'TERMINATED'
  const [lastEventTime, setLastEventTime] = useState(null);
  const [isTerminated, setIsTerminated] = useState(false);
  const [terminationReason, setTerminationReason] = useState(null);
  const [currentWarning, setCurrentWarning] = useState(null);

  const lastTriggerTimeRef = useRef(0);
  const isTerminatedRef = useRef(false);
  const countRef = useRef(0);

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

          if (terminated && onTerminated) {
            onTerminated(s.terminationReason || 'Maximum tab-switch limit exceeded');
          }
        }
      } catch (_) {}
    };

    fetchCurrentSession();
    return () => {
      isMounted = false;
    };
  }, [sessionId, onTerminated]);

  // 2. Authoritative tab switch trigger handler with 2000ms debouncing / cooldown
  const handleTabSwitch = useCallback(async () => {
    if (!enabled || isTerminatedRef.current || !sessionId) return;

    const now = Date.now();
    // Enforce cooldown to prevent double firing (e.g. visibilitychange + blur within 2s)
    if (now - lastTriggerTimeRef.current < 2000) return;
    lastTriggerTimeRef.current = now;

    try {
      const res = await api.post(`/ai-engine/sessions/${sessionId}/tab-switch`, {
        roomId: roomId || undefined,
        studentId: studentId || undefined,
        timestamp: new Date().toISOString(),
      });

      if (res.data?.success) {
        const newCount = res.data.count;
        const newStatus = res.data.tabSwitchStatus;
        const terminated = res.data.terminated;

        countRef.current = newCount;
        setTabSwitchCount(newCount);
        setTabSwitchStatus(newStatus);
        setLastEventTime(new Date());

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

          if (onTerminated) {
            onTerminated('Maximum tab-switch limit exceeded');
          }
        }
      }
    } catch (err) {
      console.warn('[useTabSwitchVerification] Error recording tab switch:', err);
    }
  }, [enabled, sessionId, roomId, studentId, onTerminated]);

  // 3. Register browser visibilitychange and blur listeners
  useEffect(() => {
    if (!enabled || !sessionId) return;

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleTabSwitch();
      }
    };

    const onWindowBlur = () => {
      // Delay slightly and check if document lost focus (not an in-app click or modal focus)
      setTimeout(() => {
        if (!document.hasFocus() || document.visibilityState === 'hidden') {
          handleTabSwitch();
        }
      }, 100);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [enabled, sessionId, handleTabSwitch]);

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
    clearWarning,
    triggerTabSwitch: handleTabSwitch,
  };
}
