import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";
import type { AudioChunk } from "./chunker";
import {
  FFMPEG_CORE_BASE_URL,
  MAX_CHUNK_SIZE_BYTES,
  MAX_CHUNK_DURATION_SEC,
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
 *  - MAX_CHUNK_DURATION_SEC (API duration limit)
 *
 * A 90% safety margin is applied to the size-based estimate to
 * account for container overhead and variable bitrate.
 */
function calculateChunkDuration(
  fileSizeBytes: number,
  totalDurationSec: number,
): number {
  const avgBytesPerSec = fileSizeBytes / totalDurationSec;

  // How many seconds fit in one chunk by size (with 10% headroom)
  const maxSecFromSize = Math.floor(
    (MAX_CHUNK_SIZE_BYTES / avgBytesPerSec) * 0.9,
  );

  return Math.max(30, Math.min(maxSecFromSize, MAX_CHUNK_DURATION_SEC));
}

/**
 * Split an audio file into chunks using ffmpeg's segment muxer.
 *
 * One ffmpeg invocation runs `-f segment` with `-c copy`, producing a
 * sequence of self-contained output files. ffmpeg only writes a
 * segment file when it has audio data to put in it, so there are no
 * header-only/phantom outputs — the previous "extract by seeking from
 * start N times" approach could produce empty trailing chunks when
 * duration estimation overshot the real end of audio.
 *
 * If any segment still exceeds the size limit after stream-copy
 * (variable-bitrate edge case), that single segment is re-encoded at
 * a fixed bitrate. The re-encode is a precise targeted fallback —
 * not a heuristic guess — fired only for segments that demonstrably
 * exceed the limit.
 */
export async function splitWithFFmpeg(
  blob: Blob,
  fileName: string,
): Promise<AudioChunk[]> {
  const ff = await getFFmpeg();

  const ext = getExtensionForMime(blob.type || "");
  const inputName = `input.${ext}`;
  const baseName = stripExtension(fileName);
  const segmentPrefix = "seg_";

  await ff.writeFile(inputName, await fetchFile(blob));

  try {
    // Compute a target segment duration. This is a hint to the segment
    // muxer for *where to cut*; the muxer itself only emits files for
    // ranges that contain audio, so an inaccurate estimate can only
    // affect segment size, never produce empty outputs.
    const probedDuration = await getAudioDuration(blob);
    const effectiveDuration =
      Number.isFinite(probedDuration) && probedDuration > 0
        ? probedDuration
        : blob.size / 16000; // ~128 kbps fallback for the hint only
    const chunkDuration = calculateChunkDuration(blob.size, effectiveDuration);

    console.log("[chunker] splitting", {
      fileName,
      inputBytes: blob.size,
      probedDurationSec: probedDuration,
      effectiveDurationSec: effectiveDuration,
      targetSegmentSec: chunkDuration,
    });

    // Single-pass split via ffmpeg's segment muxer.
    //   -f segment            → segment muxer
    //   -segment_time N       → cut every N seconds
    //   -reset_timestamps 1   → each segment's timeline restarts at 0
    //   -c copy               → no re-encoding; cuts at packet boundaries
    //   -map 0:a              → audio streams only (drop any video)
    // Opus packets are independently decodable, so stream-copy cuts
    // are clean for webm/opus. For AAC/mp4 ffmpeg snaps to the nearest
    // keyframe, which is acceptable for transcription.
    const segmentTemplate = `${segmentPrefix}%03d.${ext}`;
    const exitCode = await ff.exec([
      "-i",
      inputName,
      "-f",
      "segment",
      "-segment_time",
      String(chunkDuration),
      "-reset_timestamps",
      "1",
      "-c",
      "copy",
      "-map",
      "0:a",
      segmentTemplate,
    ]);

    if (exitCode !== 0) {
      console.error("[chunker] ffmpeg segment muxer failed", { exitCode });
      throw new Error(splitFailed(1));
    }

    // Enumerate the segments ffmpeg actually produced. listDir gives
    // us the truth from the virtual FS rather than guessing a count
    // from duration.
    const dirEntries = await ff.listDir("/");
    const segmentNames = dirEntries
      .filter(
        (e) =>
          !e.isDir &&
          e.name.startsWith(segmentPrefix) &&
          e.name.endsWith(`.${ext}`),
      )
      .map((e) => e.name)
      .sort();

    console.log("[chunker] ffmpeg produced", {
      segmentCount: segmentNames.length,
      segmentNames,
    });

    if (segmentNames.length === 0) {
      throw new Error(splitFailed(1));
    }

    // Materialize each segment into an AudioChunk, re-encoding the
    // rare oversize case.
    const chunks: AudioChunk[] = [];
    for (let i = 0; i < segmentNames.length; i++) {
      const segName = segmentNames[i];
      const data = await ff.readFile(segName);
      let chunkBlob = new Blob([toArrayBuffer(data)], { type: blob.type });
      let outExt = ext;

      if (chunkBlob.size > MAX_CHUNK_SIZE_BYTES) {
        console.warn("[chunker] segment over size limit, re-encoding", {
          index: i,
          segName,
          bytes: chunkBlob.size,
          limit: MAX_CHUNK_SIZE_BYTES,
        });

        const reInputName = `over_${i}.${ext}`;
        const reOutputName = `over_${i}.mp3`;
        await ff.writeFile(reInputName, data);
        try {
          const reExit = await ff.exec([
            "-i",
            reInputName,
            "-b:a",
            "64k",
            "-ac",
            "1",
            reOutputName,
          ]);
          if (reExit !== 0) {
            console.error("[chunker] re-encode failed", { index: i, reExit });
            throw new Error(processFailed(i + 1));
          }
          const reData = await ff.readFile(reOutputName);
          chunkBlob = new Blob([toArrayBuffer(reData)], { type: "audio/mp3" });
          outExt = "mp3";
        } finally {
          await cleanupFile(ff, reInputName);
          await cleanupFile(ff, reOutputName);
        }
      }

      chunks.push({
        blob: chunkBlob,
        name: `${baseName}_part${i + 1}.${outExt}`,
      });

      await cleanupFile(ff, segName);
    }

    console.log("[chunker] complete", {
      finalChunkCount: chunks.length,
      sizes: chunks.map((c) => c.blob.size),
    });

    return chunks;
  } finally {
    await cleanupFile(ff, inputName);
  }
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
