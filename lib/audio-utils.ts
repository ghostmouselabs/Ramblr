/**
 * Get the file extension for a given MIME type.
 */
export function getExtensionForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("x-m4a"))
    return "mp4";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("wav")) return "wav";
  if (m.includes("flac")) return "flac";
  if (m.includes("mp3") || m.includes("mpeg")) return "mp3";
  return "webm";
}

/**
 * Get audio duration in seconds using an HTMLAudioElement.
 *
 * This is lightweight — the browser reads container metadata without
 * decoding the full file, so it works for large files without blowing
 * up memory.
 *
 * Falls back to Infinity if duration can't be determined (which will
 * cause the chunker to split conservatively by size alone).
 */
export function getAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();

    const cleanup = () => {
      audio.removeAttribute("src");
      audio.load(); // Release the media resource
      URL.revokeObjectURL(url);
    };

    audio.addEventListener(
      "loadedmetadata",
      () => {
        const duration = audio.duration;
        cleanup();
        // Infinity means duration is unknown (e.g., streaming format)
        resolve(Number.isFinite(duration) ? duration : Infinity);
      },
      { once: true },
    );

    audio.addEventListener(
      "error",
      () => {
        cleanup();
        // Can't determine duration — return Infinity so the chunker
        // falls back to size-only splitting
        resolve(Infinity);
      },
      { once: true },
    );

    audio.preload = "metadata";
    audio.src = url;
  });
}
