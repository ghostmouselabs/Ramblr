import { MEDIARECORDER_TIMESLICE_MS } from "./constants";
import { ERRORS } from "./errors";

// ── Types ─────────────────────────────────────────────────────

export type AudioSource = "mic" | "system" | "both";

export type RecorderState = "inactive" | "recording" | "paused";

export interface RecorderCallbacks {
  onChunk: (chunk: Blob) => void;
  onAnalyser: (analyser: AnalyserNode) => void;
  onStateChange: (state: RecorderState) => void;
  onError: (message: string) => void;
}

// ── Browser capability detection ──────────────────────────────

/**
 * Determine which audio sources are available in the current browser.
 * System audio capture (getDisplayMedia with audio) only works in
 * Chromium-based desktop browsers.
 */
export function getAvailableSources(): Record<AudioSource, boolean> {
  const hasMic = typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;

  const hasDisplayMedia = typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getDisplayMedia;

  // System audio only works reliably in Chromium (Chrome, Edge, Brave, Opera)
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isChromium = /Chrome\//.test(ua) || /Edg\//.test(ua);
  const isMobile = /Android|iPhone|iPad|iPod/.test(ua);

  const systemAudioSupported = hasDisplayMedia && isChromium && !isMobile;

  return {
    mic: hasMic,
    system: systemAudioSupported,
    both: hasMic && systemAudioSupported,
  };
}

// ── MIME type detection ───────────────────────────────────────

/**
 * Detect the best supported MediaRecorder MIME type.
 * Priority: webm/opus > webm > mp4 > ogg/opus > default
 */
function getSupportedMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return ""; // Let browser choose
}

// ── Stream acquisition ────────────────────────────────────────

async function getMicStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
}

async function getSystemStream(): Promise<MediaStream> {
  const displayStream = await navigator.mediaDevices.getDisplayMedia({
    video: true, // Required by spec, we discard it
    audio: true,
  });

  // Discard the video track immediately
  for (const track of displayStream.getVideoTracks()) {
    track.stop();
  }

  const audioTracks = displayStream.getAudioTracks();
  if (audioTracks.length === 0) {
    throw new Error(ERRORS.noSystemAudio);
  }

  return new MediaStream(audioTracks);
}

async function getMergedStream(): Promise<{
  stream: MediaStream;
  cleanupCtx: AudioContext;
}> {
  const [micStream, displayStream] = await Promise.all([
    getMicStream(),
    navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    }).then((ds) => {
      // Discard video
      for (const track of ds.getVideoTracks()) track.stop();
      return ds;
    }),
  ]);

  // Mix both audio sources using Web Audio API
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();

  const micSource = ctx.createMediaStreamSource(micStream);
  micSource.connect(dest);

  const systemTracks = displayStream.getAudioTracks();
  if (systemTracks.length > 0) {
    const sysSource = ctx.createMediaStreamSource(
      new MediaStream(systemTracks),
    );
    sysSource.connect(dest);
  }

  // When the merged stream ends, clean up the source streams
  dest.stream.addEventListener("inactive", () => {
    micStream.getTracks().forEach((t) => t.stop());
    displayStream.getTracks().forEach((t) => t.stop());
  });

  return { stream: dest.stream, cleanupCtx: ctx };
}

// ── Recorder engine ───────────────────────────────────────────

export class AudioRecorderEngine {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private mergeContext: AudioContext | null = null; // Only for "both" mode
  private analyser: AnalyserNode | null = null;
  private chunks: Blob[] = [];
  private callbacks: RecorderCallbacks;
  private _state: RecorderState = "inactive";
  private _mimeType: string = "";

  constructor(callbacks: RecorderCallbacks) {
    this.callbacks = callbacks;
  }

  get state(): RecorderState {
    return this._state;
  }

  get mimeType(): string {
    return this._mimeType;
  }

  get chunkCount(): number {
    return this.chunks.length;
  }

  /**
   * Get all accumulated chunks (for crash recovery persistence).
   */
  getChunks(): Blob[] {
    return [...this.chunks];
  }

  async start(source: AudioSource): Promise<void> {
    if (this._state !== "inactive") return;

    try {
      // Acquire the audio stream
      if (source === "both") {
        const { stream, cleanupCtx } = await getMergedStream();
        this.stream = stream;
        this.mergeContext = cleanupCtx;
      } else if (source === "system") {
        this.stream = await getSystemStream();
      } else {
        this.stream = await getMicStream();
      }

      // Set up analyser for waveform visualization
      this.audioContext = new AudioContext();
      const audioSource = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.7;
      audioSource.connect(this.analyser);
      this.callbacks.onAnalyser(this.analyser);

      // Create MediaRecorder
      this._mimeType = getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: this._mimeType || undefined,
      });
      // Store actual mimeType (browser may adjust it)
      this._mimeType = this.mediaRecorder.mimeType;

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.chunks.push(e.data);
          this.callbacks.onChunk(e.data);
        }
      };

      this.mediaRecorder.onerror = () => {
        this.callbacks.onError(ERRORS.recordingFailed);
        this.cleanup();
      };

      // Handle stream ending externally (e.g., user stops tab share).
      // These are fire-and-forget — we just need to stop cleanly.
      const autoStop = () => {
        if (this._state !== "inactive") {
          void this.stop();
        }
      };

      this.stream.addEventListener("inactive", autoStop);
      for (const track of this.stream.getTracks()) {
        track.addEventListener("ended", autoStop);
      }

      this.mediaRecorder.start(MEDIARECORDER_TIMESLICE_MS);
      this.setState("recording");
    } catch (err) {
      this.cleanup();

      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          throw new Error(ERRORS.micDenied);
        }
        if (err.name === "NotFoundError") {
          throw new Error(ERRORS.micNotFound);
        }
        if (err.name === "AbortError") {
          // User cancelled the share dialog — not an error
          throw new Error("");
        }
      }

      throw err instanceof Error
        ? err
        : new Error(ERRORS.startFailed);
    }
  }

  pause(): void {
    if (this._state !== "recording" || !this.mediaRecorder) return;
    this.mediaRecorder.pause();
    this.setState("paused");
  }

  resume(): void {
    if (this._state !== "paused" || !this.mediaRecorder) return;
    this.mediaRecorder.resume();
    this.setState("recording");
  }

  /**
   * Stop recording and return the assembled audio blob.
   *
   * Returns a Promise because MediaRecorder.stop() delivers its final
   * buffered data via an async `dataavailable` event. We wait for the
   * subsequent `stop` event (which fires after the final data delivery)
   * before assembling the blob. This guarantees we capture all audio,
   * including short recordings that haven't hit a timeslice yet.
   */
  stop(): Promise<Blob | null> {
    if (this._state === "inactive") return Promise.resolve(null);

    const recorder = this.mediaRecorder;

    // Recorder already stopped (e.g. stream ended) — assemble what we have
    if (!recorder || recorder.state === "inactive") {
      const blob = this.assembleBlob();
      this.cleanup();
      return Promise.resolve(blob);
    }

    return new Promise((resolve) => {
      // The `stop` event fires after the final `dataavailable`,
      // so by this point this.chunks has everything.
      recorder.addEventListener(
        "stop",
        () => {
          const blob = this.assembleBlob();
          this.cleanup();
          resolve(blob);
        },
        { once: true },
      );

      recorder.stop();
    });
  }

  private assembleBlob(): Blob | null {
    if (this.chunks.length === 0) return null;
    return new Blob(this.chunks, { type: this._mimeType || "audio/webm" });
  }

  private setState(state: RecorderState): void {
    this._state = state;
    this.callbacks.onStateChange(state);
  }

  private cleanup(): void {
    // Stop all tracks
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }

    // Close audio contexts
    if (this.audioContext?.state !== "closed") {
      this.audioContext?.close().catch(() => {});
    }
    this.audioContext = null;

    if (this.mergeContext?.state !== "closed") {
      this.mergeContext?.close().catch(() => {});
    }
    this.mergeContext = null;

    this.analyser = null;
    this.mediaRecorder = null;
    this.chunks = [];
    this.setState("inactive");
  }
}
