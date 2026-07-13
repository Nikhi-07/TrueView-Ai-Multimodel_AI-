/**
 * Format a date string to a readable format.
 * Placeholder – replace with date-fns or similar.
 */
export function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format time from seconds to HH:MM:SS
 */
export function formatDuration(totalSeconds) {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Truncate text to a max length
 */
export function truncate(str, maxLength = 50) {
  if (!str) return '';
  return str.length > maxLength ? str.slice(0, maxLength) + '...' : str;
}

/**
 * Generate a random ID (placeholder)
 */
export function generateId() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

/**
 * Classname merge utility
 */
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}
