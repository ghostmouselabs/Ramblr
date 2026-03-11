import { MAX_CHUNK_SIZE_BYTES, MAX_CHUNK_DURATION_SEC } from "./constants";
import { getAudioDuration } from "./audio-utils";

export interface AudioChunk {
  blob: Blob;
  name: string;
}

/**
 * Split audio into chunks that fit within API limits.
 *
 * All models share the same size limit (3.5MB) and duration limit (20 min).
 * Small files that fit both limits are returned as-is (no ffmpeg needed).
 * Large or long files are split using ffmpeg.wasm (loaded on demand).
 */
export async function chunkAudio(
  blob: Blob,
  fileName: string,
): Promise<AudioChunk[]> {
  // ── Fast path: file under size limit AND under duration ───
  if (blob.size <= MAX_CHUNK_SIZE_BYTES) {
    const duration = await getAudioDuration(blob);
    if (duration <= MAX_CHUNK_DURATION_SEC) {
      return [{ blob, name: fileName }];
    }
    // Under size but over duration → need time-based splitting
  }

  // ── Slow path: need ffmpeg to split ──────────────────────
  const { splitWithFFmpeg } = await import("./chunker-ffmpeg");
  return splitWithFFmpeg(blob, fileName);
}
