export const MODELS = {
  "gpt-4o-transcribe": {
    label: "Best Quality",
    description: "Most accurate transcription",
    price: "~$0.006/min",
    maxDurationMin: 20,
  },
  "gpt-4o-mini-transcribe": {
    label: "Budget-Friendly",
    description: "Great accuracy, half the price",
    price: "~$0.003/min",
    maxDurationMin: 20,
  },
  "whisper-1": {
    label: "Classic \u2014 No Length Limit",
    description: "Reliable, no audio duration cap",
    price: "~$0.006/min",
    maxDurationMin: null,
  },
} as const;

export type ModelId = keyof typeof MODELS;

export const DEFAULT_MODEL: ModelId = "gpt-4o-transcribe";

export const MAX_CHUNK_SIZE_BYTES = 3.5 * 1024 * 1024; // 3.5MB (Vercel 4.5MB limit minus overhead)
export const MAX_CHUNK_DURATION_SEC = 20 * 60; // 20 minutes (buffer under 25-min API limit)

export const AUTOSAVE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
export const MEDIARECORDER_TIMESLICE_MS = 30_000; // 30 seconds

export const FFMPEG_CORE_VERSION = "0.12.6";
export const FFMPEG_CORE_BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;

export const OPENAI_TRANSCRIPTION_URL =
  "https://api.openai.com/v1/audio/transcriptions";

export const STORAGE_KEYS = {
  apiKey: "ramblr-api-key",
  model: "ramblr-model",
  theme: "ramblr-theme",
} as const;

export const ACCEPTED_AUDIO_FORMATS =
  ".flac,.mp3,.mp4,.mpeg,.mpga,.m4a,.ogg,.wav,.webm";

export const ACCEPTED_AUDIO_MIMES = [
  "audio/flac",
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/mpga",
  "audio/x-m4a",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
];
