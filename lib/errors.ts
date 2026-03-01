/**
 * Centralized user-facing error messages.
 *
 * All error copy lives here so it's easy to find, update, and keep
 * consistent across the app. Modules throw errors with these messages;
 * components display them via toast or inline.
 */

// ── Static messages ──────────────────────────────────────────

export const ERRORS = {
  // Network & connectivity
  network:
    "Couldn\u2019t connect to the server. Please check your internet connection and try again.",

  // API / Auth
  apiKeyMissing: "API key not found. Please set it in settings.",
  apiKeyInvalid:
    "Your API key doesn\u2019t seem to be working. Please check it in settings and try again.",
  rateLimited:
    "You\u2019re sending too many requests. Please wait a moment and try again.",

  // Server
  badRequest: "The request was invalid. Please try again.",
  payloadTooLarge: "This audio chunk is too large to process. Please try again.",
  serverError: "Something went wrong on the server. Please try again.",
  serviceDown:
    "Couldn\u2019t connect to the transcription service. Check your internet connection and try again.",
  serviceUnavailable:
    "The transcription service is temporarily unavailable. Please try again in a moment.",

  // Media / Recording
  micDenied:
    "Microphone access was denied. Please allow access in your browser settings and try again.",
  micNotFound:
    "No microphone found. Please connect a microphone and try again.",
  recordingFailed: "Recording failed unexpectedly. Please try again.",
  noSystemAudio:
    "No audio was shared. Make sure to check \u201CShare audio\u201D when picking what to share.",

  // Processing
  ffmpegLoad:
    "Couldn\u2019t load the audio processing engine. Please check your internet connection and try again.",

  // Browser
  unsupportedBrowser:
    "Your browser doesn\u2019t support audio recording. Please use a modern browser like Chrome, Edge, Firefox, or Safari.",

  // Generic
  unknown: "Something went wrong. Please try again.",
  startFailed: "Could not start recording. Please try again.",
} as const;

// ── Dynamic messages (with interpolation) ────────────────────

export function splitFailed(segment: number): string {
  return `Failed to split audio at segment ${segment}. Please try a different file format.`;
}

export function processFailed(segment: number): string {
  return `Failed to process audio segment ${segment}. Please try again.`;
}

// ── HTTP status code → error message ─────────────────────────

export const HTTP_ERRORS: Record<number, string> = {
  400: ERRORS.badRequest,
  401: ERRORS.apiKeyInvalid,
  413: ERRORS.payloadTooLarge,
  429: ERRORS.rateLimited,
  500: ERRORS.serverError,
  502: ERRORS.serviceDown,
  503: ERRORS.serviceUnavailable,
};

// ── Utility ──────────────────────────────────────────────────

/**
 * Extract a user-friendly message from any error value.
 *
 * - DOMException → mapped by name
 * - Error with message → pass through (modules already use ERRORS strings)
 * - Anything else → generic fallback
 */
export function getUserMessage(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
        return ERRORS.micDenied;
      case "NotFoundError":
        return ERRORS.micNotFound;
      case "AbortError":
        return ""; // User cancelled — not an error
    }
  }

  if (error instanceof Error) {
    return error.message || ERRORS.unknown;
  }

  return ERRORS.unknown;
}
