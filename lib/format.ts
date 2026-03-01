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
