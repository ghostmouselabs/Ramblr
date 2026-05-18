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

// ── Signal helpers ────────────────────────────────────────────

/**
 * Combine multiple AbortSignals into one that aborts when ANY input fires.
 * Uses native AbortSignal.any() where available, with a manual fallback
 * for older browsers (Safari < 17.4, iOS < 17.4).
 */
function combineSignals(...signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any(signals);
  }

  // Manual fallback: create a controller that aborts when any input signal fires
  const controller = new AbortController();

  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort(sig.reason);
      return controller.signal;
    }
    sig.addEventListener("abort", () => controller.abort(sig.reason), {
      once: true,
      signal: controller.signal, // Auto-remove listener if controller aborts first
    });
  }

  return controller.signal;
}

// ── Single chunk transcription ────────────────────────────────
export async function transcribeChunk({
  blob,
  fileName,
  apiKey,
  model,
  signal,
}: TranscribeChunkOptions): Promise<string> {
  const reqId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

  console.log("[transcribe]", reqId, "sending", {
    fileName,
    blobSize: blob.size,
    blobType: blob.type || "(empty)",
    model,
    hasApiKey: !!apiKey,
    apiKeyLen: apiKey?.length ?? 0,
  });

  // Client-side guard: an empty blob can never succeed and the server
  // 400 it returns is misleading.
  if (!blob || blob.size === 0) {
    console.error(
      "[transcribe]",
      reqId,
      "refusing to send empty blob",
      { fileName, blobSize: blob?.size },
    );
    throw new Error(
      "Audio data is empty. The recording may not have saved correctly — please try re-recording.",
    );
  }

  const formData = new FormData();
  formData.append("file", blob, fileName);
  formData.append("api_key", apiKey);
  formData.append("model", model);

  // Combine caller's abort signal with a per-request timeout.
  // AbortSignal.timeout() produces a TimeoutError DOMException,
  // distinguishable from the caller's AbortError.
  const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const combinedSignal = signal
    ? combineSignals(signal, timeoutSignal)
    : timeoutSignal;

  let response: Response;
  try {
    response = await fetch("/api/transcribe", {
      method: "POST",
      body: formData,
      headers: { "X-Request-ID": reqId },
      signal: combinedSignal,
    });
  } catch (err) {
    console.error("[transcribe]", reqId, "fetch threw", err);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err; // Caller-initiated cancellation
    }
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(ERRORS.timeout);
    }
    throw new Error(ERRORS.network);
  }

  console.log("[transcribe]", reqId, "response status", response.status);

  if (!response.ok) {
    // Try to parse the server's structured error body for a precise
    // message. Surfacing this to the toast turns "The request was
    // invalid" into "API key is required. (field: api_key)".
    let serverDetail = "";
    try {
      const body = await response.json();
      console.error("[transcribe]", reqId, "server error body:", body);
      const parts: string[] = [];
      if (typeof body?.error === "string") parts.push(body.error);
      if (typeof body?.field === "string") parts.push(`field: ${body.field}`);
      if (typeof body?.detail === "string") parts.push(body.detail);
      if (typeof body?.upstreamStatus === "number")
        parts.push(`upstream: ${body.upstreamStatus}`);
      serverDetail = parts.join(" — ");
    } catch (parseErr) {
      console.error(
        "[transcribe]",
        reqId,
        "could not parse error response body",
        parseErr,
      );
    }
    const generic = HTTP_ERRORS[response.status] ?? ERRORS.unknown;
    throw new Error(
      serverDetail ? `${generic} (${serverDetail}) [req ${reqId}]` : `${generic} [req ${reqId}]`,
    );
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
