import { NextRequest, NextResponse } from "next/server";
import { OPENAI_TRANSCRIPTION_URL } from "@/lib/constants";

const VALID_MODELS = new Set([
  "gpt-4o-transcribe",
  "gpt-4o-mini-transcribe",
]);

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid request format." },
        { status: 400 },
      );
    }

    const file = formData.get("file") as File | null;
    const apiKey = formData.get("api_key") as string | null;
    const model = formData.get("model") as string | null;

    // ── Validation ──────────────────────────────────────────────
    if (!apiKey?.trim()) {
      return NextResponse.json(
        { error: "API key is required." },
        { status: 400 },
      );
    }

    if (!file || file.size === 0) {
      return NextResponse.json(
        { error: "Audio file is required." },
        { status: 400 },
      );
    }

    if (!model || !VALID_MODELS.has(model)) {
      return NextResponse.json(
        { error: "Invalid transcription model." },
        { status: 400 },
      );
    }

    // Buffer the upload once so the forwarded multipart body has a
    // known length and doesn't depend on re-streaming the parsed File.
    const buffered = new Blob([await file.arrayBuffer()], { type: file.type });

    // ── Forward to OpenAI ───────────────────────────────────────
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
    } catch {
      return NextResponse.json(
        { error: "Failed to reach the transcription service." },
        { status: 502 },
      );
    }

    // ── Handle OpenAI response ──────────────────────────────────
    if (!response.ok) {
      // Pass through the HTTP status so the client can map it to a
      // user-friendly message. Don't expose the raw OpenAI error body.
      return NextResponse.json(
        { error: "Transcription request failed." },
        { status: response.status },
      );
    }

    const text = await response.text();

    return NextResponse.json({ text });
  } catch (err) {
    console.error("[/api/transcribe] unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
