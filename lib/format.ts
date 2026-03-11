/**
 * Format bytes into a human-readable string (e.g., "2.4 MB").
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  const value = bytes / k ** i;
  return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

/**
 * Format a timestamp into a human-friendly relative string.
 * "Today at 2:30 PM", "Yesterday at 9:15 AM", "Mar 5 at 4:00 PM"
 */
export function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();

  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (date.toDateString() === now.toDateString()) return `Today at ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${time}`;
  }

  return `${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} at ${time}`;
}

/**
 * Format a duration in seconds into a compact string.
 * "45s", "3m 12s", "1h 5m"
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return s > 0 ? `${h}h ${m}m ${s}s` : `${h}h ${m}m`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/**
 * Count words in a text string.
 */
export function countWords(text: string): number {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}
