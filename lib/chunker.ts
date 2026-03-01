import {
  MAX_CHUNK_SIZE_BYTES,
  MAX_CHUNK_DURATION_SEC,
  MODELS,
  type ModelId,
} from "./constants";
import { getAudioDuration } from "./audio-utils";

export interface AudioChunk {
  blob: Blob;
  name: string;
}

/**
 * Split audio into chunks that fit within API limits.
 *
 * For gpt-4o models: split at 3.5MB size OR 20-min duration, whichever first.
 * For whisper-1: split at 3.5MB size only (no duration cap).
 *
 * Small files that fit both limits are returned as-is (no ffmpeg needed).
 * Large or long files are split using ffmpeg.wasm (loaded on demand).
 */
export async function chunkAudio(
  blob: Blob,
  fileName: string,
  model: ModelId,
): Promise<AudioChunk[]> {
  const modelConfig = MODELS[model];
  const hasDurationLimit = modelConfig.maxDurationMin != null;

  // ── Fast path: file under size limit ─────────────────────
  if (blob.size <= MAX_CHUNK_SIZE_BYTES) {
    if (!hasDurationLimit) {
      // whisper-1: no duration cap, file fits in size → done
      return [{ blob, name: fileName }];
    }

    // gpt-4o models: check duration too
    const duration = await getAudioDuration(blob);

    if (duration <= MAX_CHUNK_DURATION_SEC) {
      return [{ blob, name: fileName }];
    }

    // Under size but over duration → need time-based splitting
  }

  // ── Slow path: need ffmpeg to split ──────────────────────
  const { splitWithFFmpeg } = await import("./chunker-ffmpeg");
  return splitWithFFmpeg(blob, fileName, model);
}
