import { FETCH_TIMEOUT_MS, type ModelId } from "./constants";
import { ERRORS, HTTP_ERRORS } from "./errors";

// ── Types ─────────────────────────────────────────────────────
export interface TranscriptionResult {
  fileName: string;
  text: string;
}

export interface TranscribeChunkOptions {
  blob: Blob;
  fileName: string;
  apiKey: string;
  model: ModelId;
  signal?: AbortSignal;
}

export type ProgressCallback = (completed: number, total: number) => void;

// ── Single chunk transcription ────────────────────────────────
export async function transcribeChunk({
  blob,
  fileName,
  apiKey,
  model,
  signal,
}: TranscribeChunkOptions): Promise<string> {
  const formData = new FormData();
  formData.append("file", blob, fileName);
  formData.append("api_key", apiKey);
  formData.append("model", model);

  // Combine caller's abort signal with a per-request timeout.
  // AbortSignal.timeout() produces a TimeoutError DOMException,
  // distinguishable from the caller's AbortError.
  const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  let response: Response;
  try {
    response = await fetch("/api/transcribe", {
      method: "POST",
      body: formData,
      signal: combinedSignal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err; // Caller-initiated cancellation
    }
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(ERRORS.timeout);
    }
    throw new Error(ERRORS.network);
  }

  if (!response.ok) {
    throw new Error(HTTP_ERRORS[response.status] ?? ERRORS.unknown);
  }

  const data: { text: string } = await response.json();
  return data.text;
}

// ── Multi-chunk orchestrator ──────────────────────────────────
export async function transcribeChunks(
  chunks: { blob: Blob; name: string }[],
  apiKey: string,
  model: ModelId,
  onProgress: ProgressCallback,
  signal?: AbortSignal,
): Promise<string> {
  const results: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    signal?.throwIfAborted();

    const text = await transcribeChunk({
      blob: chunks[i].blob,
      fileName: chunks[i].name,
      apiKey,
      model,
      signal,
    });

    results.push(text.trim());
    onProgress(i + 1, chunks.length);
  }

  return results.join(" ");
}
