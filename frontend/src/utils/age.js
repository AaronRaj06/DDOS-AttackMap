// "4 min ago". Under 45 seconds, and any small clock skew into the future, is "just now".
export function formatAge(iso, now = Date.now()) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 'unknown';
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.max(1, Math.floor(seconds / 60));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(seconds / 3600);
  return hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`;
}
