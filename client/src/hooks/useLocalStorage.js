import { useState, useEffect } from 'react';

/**
 * useLocalStorage – Persist state in localStorage.
 * Placeholder hook for future use.
 */
export function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch {
      // silently fail
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue];
}
