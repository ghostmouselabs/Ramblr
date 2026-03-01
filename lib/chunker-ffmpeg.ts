import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";
import type { AudioChunk } from "./chunker";
import {
  FFMPEG_CORE_BASE_URL,
  MAX_CHUNK_SIZE_BYTES,
  MAX_CHUNK_DURATION_SEC,
  MODELS,
  type ModelId,
} from "./constants";
import { getExtensionForMime, getAudioDuration } from "./audio-utils";
import { ERRORS, splitFailed, processFailed } from "./errors";
import { logger } from "./logger";

// ── Singleton ffmpeg instance ─────────────────────────────────

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;

/**
 * Get the lazily-initialized ffmpeg instance. Loads WASM core from
 * CDN via blob URLs to avoid Turbopack bundling issues.
 */
async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;

  // Prevent multiple concurrent loads
  if (loadPromise) {
    await loadPromise;
    return ffmpegInstance!;
  }

  ffmpegInstance = new FFmpeg();

  ffmpegInstance.on("log", ({ message }) => {
    logger.log("[ffmpeg]", message);
  });

  loadPromise = (async () => {
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`, "text/javascript"),
      toBlobURL(
        `${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`,
        "application/wasm",
      ),
    ]);

    await ffmpegInstance!.load({ coreURL, wasmURL });
  })();

  try {
    await loadPromise;
  } catch {
    // Reset so a subsequent call can retry
    ffmpegInstance = null;
    loadPromise = null;
    throw new Error(ERRORS.ffmpegLoad);
  }

  return ffmpegInstance;
}

// ── Splitting logic ───────────────────────────────────────────

/**
 * Calculate the optimal chunk duration given file constraints.
 *
 * The chunk duration is the minimum of:
 *  - Time that fits in MAX_CHUNK_SIZE_BYTES (estimated from average bitrate)
 *  - MAX_CHUNK_DURATION_SEC (for models with a duration cap)
 *
 * A 90% safety margin is applied to the size-based estimate to
 * account for container overhead and variable bitrate.
 */
function calculateChunkDuration(
  fileSizeBytes: number,
  totalDurationSec: number,
  model: ModelId,
): number {
  const avgBytesPerSec = fileSizeBytes / totalDurationSec;

  // How many seconds fit in one chunk by size (with 10% headroom)
  const maxSecFromSize = Math.floor(
    (MAX_CHUNK_SIZE_BYTES / avgBytesPerSec) * 0.9,
  );

  // Duration cap from the model
  const modelConfig = MODELS[model];
  const maxSecFromModel =
    modelConfig.maxDurationMin != null
      ? MAX_CHUNK_DURATION_SEC
      : Infinity;

  return Math.max(30, Math.min(maxSecFromSize, maxSecFromModel));
}

/**
 * Split an audio file into chunks using ffmpeg.wasm.
 *
 * Uses `-c copy` (stream copy, no re-encoding) for speed. If a chunk
 * still exceeds the size limit after copy-mode splitting (can happen
 * with variable bitrate audio), it re-encodes that chunk at a fixed
 * bitrate as a fallback.
 */
export async function splitWithFFmpeg(
  blob: Blob,
  fileName: string,
  model: ModelId,
): Promise<AudioChunk[]> {
  const ff = await getFFmpeg();

  const ext = getExtensionForMime(blob.type || "");
  const inputName = `input.${ext}`;

  // Write source file to ffmpeg's virtual filesystem
  await ff.writeFile(inputName, await fetchFile(blob));

  // Determine duration
  const duration = await getAudioDuration(blob);

  if (!Number.isFinite(duration) || duration <= 0) {
    // Can't determine duration — fall back to a conservative fixed
    // segment length (60s) which should fit in 3.5MB for most codecs
    logger.warn("Could not determine audio duration, using 60s segments");
  }

  const effectiveDuration =
    Number.isFinite(duration) && duration > 0 ? duration : blob.size / 16000; // rough fallback: ~128kbps

  const chunkDuration = calculateChunkDuration(
    blob.size,
    effectiveDuration,
    model,
  );
  const numChunks = Math.ceil(effectiveDuration / chunkDuration);

  logger.log(
    `Splitting ${fileName}: ${effectiveDuration.toFixed(0)}s total, ` +
      `${chunkDuration}s per chunk, ${numChunks} chunks`,
  );

  const chunks: AudioChunk[] = [];
  const baseName = stripExtension(fileName);

  for (let i = 0; i < numChunks; i++) {
    const startSec = i * chunkDuration;
    const outputName = `chunk_${i}.${ext}`;

    // Stream-copy split (fast, no re-encoding)
    const exitCode = await ff.exec([
      "-ss",
      String(startSec),
      "-t",
      String(chunkDuration),
      "-i",
      inputName,
      "-c",
      "copy",
      outputName,
    ]);

    if (exitCode !== 0) {
      await cleanupFile(ff, outputName);
      throw new Error(splitFailed(i + 1));
    }

    const data = await ff.readFile(outputName);
    let chunkBlob = new Blob([toArrayBuffer(data)], { type: blob.type });

    // If copy-mode chunk is still too large (VBR edge case), re-encode
    if (chunkBlob.size > MAX_CHUNK_SIZE_BYTES) {
      logger.warn(
        `Chunk ${i} is ${(chunkBlob.size / 1024 / 1024).toFixed(1)}MB after copy, re-encoding`,
      );

      const reEncodedName = `chunk_${i}_re.mp3`;
      const reExitCode = await ff.exec([
        "-ss",
        String(startSec),
        "-t",
        String(chunkDuration),
        "-i",
        inputName,
        "-b:a",
        "64k",
        "-ac",
        "1",
        reEncodedName,
      ]);

      if (reExitCode !== 0) {
        await cleanupFile(ff, outputName);
        await cleanupFile(ff, reEncodedName);
        throw new Error(processFailed(i + 1));
      }

      const reData = await ff.readFile(reEncodedName);
      chunkBlob = new Blob([toArrayBuffer(reData)], { type: "audio/mp3" });
      await cleanupFile(ff, reEncodedName);
    }

    chunks.push({
      blob: chunkBlob,
      name: `${baseName}_part${i + 1}.${chunkBlob.type.includes("mp3") ? "mp3" : ext}`,
    });

    await cleanupFile(ff, outputName);
  }

  // Cleanup input file
  await cleanupFile(ff, inputName);

  return chunks;
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Convert ffmpeg's FileData (Uint8Array backed by ArrayBufferLike, which may
 * include SharedArrayBuffer) to a plain ArrayBuffer that Blob accepts.
 */
function toArrayBuffer(data: Uint8Array | string): ArrayBuffer {
  if (typeof data === "string") {
    return new TextEncoder().encode(data).buffer as ArrayBuffer;
  }
  const buf = new ArrayBuffer(data.byteLength);
  new Uint8Array(buf).set(data);
  return buf;
}

async function cleanupFile(ff: FFmpeg, path: string): Promise<void> {
  try {
    await ff.deleteFile(path);
  } catch {
    // File may not exist if an earlier step failed — ignore
  }
}

function stripExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}
