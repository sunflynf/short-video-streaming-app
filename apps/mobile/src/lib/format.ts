/** 999 → "999", 1234 → "1.2K", 1_250_000 → "1.3M". */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  const [value, unit] = n < 1_000_000 ? [n / 1000, 'K'] : [n / 1_000_000, 'M'];
  return `${value >= 100 ? Math.round(value) : Number(value.toFixed(1))}${unit}`;
}

/** Compact relative time: "now", "5m", "3h", "2d", "4w", then a date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const sec = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (sec < 60) return 'now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86_400) return `${Math.floor(sec / 3600)}h`;
  if (sec < 7 * 86_400) return `${Math.floor(sec / 86_400)}d`;
  if (sec < 30 * 86_400) return `${Math.floor(sec / (7 * 86_400))}w`;
  return new Date(iso).toLocaleDateString();
}
