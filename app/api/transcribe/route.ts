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
  // Privacy: only log a fixed message plus an HTTP status or error code.
  // Never log the API key, audio, file names, transcripts, or upstream
  // response bodies (OpenAI error messages can echo part of the key).
  const logErr = (msg: string, extra?: { status?: number; code?: string }) => {
    console.error(JSON.stringify({ tag: "transcribe", reqId, msg, ...extra }));
  };
  const errName = (err: unknown) =>
    err instanceof Error ? err.name : typeof err;

  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (err) {
      logErr("formData parse failed", { code: errName(err) });
      return NextResponse.json(
        { error: "Invalid request format.", reqId },
        { status: 400 },
      );
    }

    const file = formData.get("file") as File | null;
    const apiKey = formData.get("api_key") as string | null;
    const model = formData.get("model") as string | null;

    if (!apiKey?.trim()) {
      logErr("validation failed: api key missing/empty");
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
      logErr("validation failed: file size is 0");
      return NextResponse.json(
        { error: "Audio file is required.", reqId, field: "file", detail: "file size is 0 bytes" },
        { status: 400 },
      );
    }

    if (!model || !VALID_MODELS.has(model)) {
      logErr("validation failed: invalid model");
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
      logErr("file.arrayBuffer() threw", { code: errName(err) });
      return NextResponse.json(
        { error: "Could not read audio file.", reqId },
        { status: 400 },
      );
    }

    const openaiForm = new FormData();
    openaiForm.append("file", buffered, file.name);
    openaiForm.append("model", model);
    openaiForm.append("response_format", "text");

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
      logErr("openai fetch threw", { code: errName(err) });
      return NextResponse.json(
        { error: "Failed to reach the transcription service.", reqId },
        { status: 502 },
      );
    }

    if (!response.ok) {
      // Extract only OpenAI's machine-readable error code from the body.
      let code: string | undefined;
      try {
        const body = await response.json();
        if (typeof body?.error?.code === "string") code = body.error.code;
      } catch {
        // ignore
      }
      logErr("openai non-ok", { status: response.status, code });
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
      logErr("reading openai response body threw", { code: errName(err) });
      return NextResponse.json(
        { error: "Lost connection to transcription service.", reqId },
        { status: 502 },
      );
    }

    return NextResponse.json({ text, reqId });
  } catch (err) {
    logErr("unhandled error", { code: errName(err) });
    return NextResponse.json(
      { error: "Internal server error.", reqId },
      { status: 500 },
    );
  }
}
