export function formatUtc(value?: string, includeYear = false) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', ...(includeYear ? { year: 'numeric' as const } : {}),
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false,
  }).format(date);
}

export function relativeTime(value: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export function coordinate(value: number, positive: string, negative: string) {
  return `${Math.abs(value).toFixed(3)}° ${value >= 0 ? positive : negative}`;
}
