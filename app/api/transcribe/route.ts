import { NextRequest, NextResponse } from "next/server";
import { OPENAI_TRANSCRIPTION_URL } from "@/lib/constants";

const VALID_MODELS = new Set([
  "gpt-4o-transcribe",
  "gpt-4o-mini-transcribe",
]);

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const reqId =
    request.headers.get("x-request-id") || crypto.randomUUID().slice(0, 8);
  const t0 = Date.now();
  const log = (msg: string, extra?: Record<string, unknown>) => {
    console.log(
      JSON.stringify({ tag: "transcribe", reqId, dt: Date.now() - t0, msg, ...extra }),
    );
  };
  const logErr = (msg: string, extra?: Record<string, unknown>) => {
    console.error(
      JSON.stringify({ tag: "transcribe", reqId, dt: Date.now() - t0, msg, ...extra }),
    );
  };

  try {
    log("request received", {
      contentLength: request.headers.get("content-length"),
      contentType: request.headers.get("content-type"),
      userAgent: request.headers.get("user-agent"),
    });

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (err) {
      logErr("formData parse failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: "Invalid request format.", reqId },
        { status: 400 },
      );
    }

    const file = formData.get("file") as File | null;
    const apiKey = formData.get("api_key") as string | null;
    const model = formData.get("model") as string | null;

    log("formData parsed", {
      hasFile: !!file,
      fileSize: file?.size ?? null,
      fileName: file?.name ?? null,
      fileType: file?.type ?? null,
      hasApiKey: !!apiKey,
      apiKeyLen: apiKey?.length ?? 0,
      apiKeyPrefix: apiKey ? `${apiKey.slice(0, 4)}...` : null,
      model,
    });

    if (!apiKey?.trim()) {
      logErr("validation failed: api key missing/empty", {
        hasApiKey: !!apiKey,
        apiKeyLen: apiKey?.length ?? 0,
      });
      return NextResponse.json(
        { error: "API key is required.", reqId, field: "api_key" },
        { status: 400 },
      );
    }

    if (!file) {
      logErr("validation failed: no file field in form");
      return NextResponse.json(
        { error: "Audio file is required.", reqId, field: "file", detail: "no file field" },
        { status: 400 },
      );
    }

    if (file.size === 0) {
      logErr("validation failed: file size is 0", {
        fileName: file.name,
        fileType: file.type,
      });
      return NextResponse.json(
        { error: "Audio file is required.", reqId, field: "file", detail: "file size is 0 bytes" },
        { status: 400 },
      );
    }

    if (!model || !VALID_MODELS.has(model)) {
      logErr("validation failed: invalid model", { received: model });
      return NextResponse.json(
        {
          error: "Invalid transcription model.",
          reqId,
          field: "model",
          detail: `received "${model}"`,
        },
        { status: 400 },
      );
    }

    // Buffer the upload once so the forwarded multipart body has a
    // known length and doesn't depend on re-streaming the parsed File.
    let buffered: Blob;
    try {
      buffered = new Blob([await file.arrayBuffer()], { type: file.type });
    } catch (err) {
      logErr("file.arrayBuffer() threw", {
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: "Could not read audio file.", reqId },
        { status: 400 },
      );
    }
    log("file buffered", { bufferedSize: buffered.size });

    const openaiForm = new FormData();
    openaiForm.append("file", buffered, file.name);
    openaiForm.append("model", model);
    openaiForm.append("response_format", "text");

    log("calling openai");
    let response: Response;
    try {
      response = await fetch(OPENAI_TRANSCRIPTION_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: openaiForm,
      });
    } catch (err) {
      logErr("openai fetch threw", {
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: "Failed to reach the transcription service.", reqId },
        { status: 502 },
      );
    }

    log("openai responded", { status: response.status });

    if (!response.ok) {
      let upstreamBody = "";
      try {
        upstreamBody = await response.text();
      } catch {
        // ignore
      }
      logErr("openai non-ok", {
        status: response.status,
        bodyPreview: upstreamBody.slice(0, 500),
      });
      return NextResponse.json(
        {
          error: "Transcription request failed.",
          reqId,
          upstreamStatus: response.status,
        },
        { status: response.status },
      );
    }

    let text: string;
    try {
      text = await response.text();
    } catch (err) {
      logErr("reading openai response body threw", {
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: "Lost connection to transcription service.", reqId },
        { status: 502 },
      );
    }

    log("transcription complete", { textLen: text.length });
    return NextResponse.json({ text, reqId });
  } catch (err) {
    logErr("unhandled error", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json(
      { error: "Internal server error.", reqId },
      { status: 500 },
    );
  }
}
