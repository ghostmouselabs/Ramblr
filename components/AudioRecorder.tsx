"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { Mic, Monitor, MonitorSpeaker, Pause, Square, Play } from "lucide-react";
import { GlassCard, Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import {
  ProgressIndicator,
  type FileProgress,
} from "@/components/ProgressIndicator";
import {
  AudioRecorderEngine,
  getAvailableSources,
  type AudioSource,
  type RecorderState,
} from "@/lib/recorder";
import { chunkAudio } from "@/lib/chunker";
import { transcribeChunk, transcribeChunks } from "@/lib/transcribe";
import { useIsClient } from "@/lib/hooks";
import {
  STORAGE_KEYS,
  MAX_CHUNK_SIZE_BYTES,
  AUTOSAVE_INTERVAL_MS,
  type ModelId,
} from "@/lib/constants";
import {
  saveRecording,
  deleteRecording,
  generateRecordingId,
} from "@/lib/storage";
import { ERRORS, getUserMessage } from "@/lib/errors";
import type { TranscriptionResult } from "@/lib/transcribe";

// ── Types ─────────────────────────────────────────────────────

interface AudioRecorderProps {
  model: ModelId;
  onTranscriptionComplete: (results: TranscriptionResult[]) => void;
}

type Phase = "idle" | "recording" | "transcribing";

// ── Source selector data ──────────────────────────────────────

const SOURCE_OPTIONS: {
  value: AudioSource;
  label: string;
  icon: typeof Mic;
  description: string;
}[] = [
  {
    value: "mic",
    label: "Microphone",
    icon: Mic,
    description: "Record your voice",
  },
  {
    value: "system",
    label: "System Audio",
    icon: Monitor,
    description: "Record audio playing on your computer",
  },
  {
    value: "both",
    label: "Both",
    icon: MonitorSpeaker,
    description: "Voice + computer audio together",
  },
];

// ── Component ─────────────────────────────────────────────────

export function AudioRecorder({
  model,
  onTranscriptionComplete,
}: AudioRecorderProps) {
  const { toast } = useToast();

  // State
  const [phase, setPhase] = useState<Phase>("idle");
  const [source, setSource] = useState<AudioSource>("mic");
  const [recorderState, setRecorderState] = useState<RecorderState>("inactive");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [progress, setProgress] = useState<FileProgress[]>([]);

  // Compute available sources from browser capabilities (stable after hydration)
  const isClient = useIsClient();
  const availableSources = useMemo(
    () =>
      isClient
        ? getAvailableSources()
        : { mic: true, system: false, both: false },
    [isClient],
  );

  // Refs
  const engineRef = useRef<AudioRecorderEngine | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  const recordingIdRef = useRef<string | null>(null);
  const autosaveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Timer ─────────────────────────────────────────────────

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
  }, []);

  const pauseTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetTimer = useCallback(() => {
    pauseTimer();
    setElapsedSec(0);
  }, [pauseTimer]);

  // ── Waveform visualizer ───────────────────────────────────

  const drawWaveform = useCallback(() => {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      // Get accent color from CSS custom property
      const style = getComputedStyle(canvas);
      const isRecording = engineRef.current?.state === "recording";
      ctx.strokeStyle = isRecording
        ? style.getPropertyValue("--color-primary-500").trim() || "#5b5fc7"
        : style.getPropertyValue("--color-text-tertiary").trim() || "#999";
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }

      ctx.lineTo(width, height / 2);
      ctx.stroke();
    };

    draw();
  }, []);

  const stopWaveform = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    // Clear the canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    analyserRef.current = null;
  }, []);

  // ── Auto-save to IndexedDB ────────────────────────────────

  // Sync latest values into refs so the autosave interval reads current data
  const sourceRef = useRef(source);
  const elapsedSecRef = useRef(elapsedSec);

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  useEffect(() => {
    elapsedSecRef.current = elapsedSec;
  }, [elapsedSec]);

  const persistToIndexedDB = useCallback(() => {
    const engine = engineRef.current;
    const recId = recordingIdRef.current;
    if (!engine || !recId || engine.state === "inactive") return;

    const chunks = engine.getChunks();
    if (chunks.length === 0) return;

    saveRecording({
      id: recId,
      chunks,
      mimeType: engine.mimeType || "audio/webm",
      source: sourceRef.current,
      timestamp: Date.now(),
      duration: elapsedSecRef.current,
    });
  }, []);

  const startAutosave = useCallback(() => {
    autosaveRef.current = setInterval(persistToIndexedDB, AUTOSAVE_INTERVAL_MS);
  }, [persistToIndexedDB]);

  const stopAutosave = useCallback(() => {
    if (autosaveRef.current) {
      clearInterval(autosaveRef.current);
      autosaveRef.current = null;
    }
  }, []);

  const clearRecoveryData = useCallback(async () => {
    const recId = recordingIdRef.current;
    if (recId) {
      await deleteRecording(recId);
      recordingIdRef.current = null;
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      pauseTimer();
      stopAutosave();
      stopWaveform();
      // Persist one final time before unmount so data isn't lost
      persistToIndexedDB();
      void engineRef.current?.stop();
    };
  }, [pauseTimer, stopAutosave, stopWaveform, persistToIndexedDB]);

  // ── Recording controls ────────────────────────────────────

  const handleStart = useCallback(async () => {
    const recId = generateRecordingId();
    recordingIdRef.current = recId;

    const engine = new AudioRecorderEngine({
      onChunk: () => {},
      onAnalyser: (analyser) => {
        analyserRef.current = analyser;
        drawWaveform();
      },
      onStateChange: setRecorderState,
      onError: (msg) => toast(msg, "error"),
    });

    engineRef.current = engine;

    try {
      await engine.start(source);
      setPhase("recording");
      setElapsedSec(0);
      startTimer();
      startAutosave();
    } catch (err) {
      recordingIdRef.current = null;
      const message = getUserMessage(err);
      if (message) toast(message, "error");
    }
  }, [source, drawWaveform, startTimer, startAutosave, toast]);

  const handlePause = useCallback(() => {
    engineRef.current?.pause();
    pauseTimer();
  }, [pauseTimer]);

  const handleResume = useCallback(() => {
    engineRef.current?.resume();
    startTimer();
  }, [startTimer]);

  const handleStop = useCallback(async () => {
    stopAutosave();
    const blob = (await engineRef.current?.stop()) ?? null;
    resetTimer();
    stopWaveform();

    if (!blob || blob.size === 0) {
      await clearRecoveryData();
      setPhase("idle");
      return;
    }

    // ── Transcription ─────────────────────────────────────
    const apiKey = localStorage.getItem(STORAGE_KEYS.apiKey);
    if (!apiKey) {
      toast(ERRORS.apiKeyMissing, "error");
      setPhase("idle");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("transcribing");

    const fileName = `recording.${blob.type.includes("mp4") ? "mp4" : "webm"}`;

    setProgress([
      { fileName, status: "transcribing", currentChunk: 0, totalChunks: 1 },
    ]);

    try {
      let text: string;

      if (blob.size <= MAX_CHUNK_SIZE_BYTES) {
        text = await transcribeChunk({
          blob,
          fileName,
          apiKey,
          model,
          signal: controller.signal,
        });
      } else {
        const chunks = await chunkAudio(blob, fileName, model);
        setProgress([
          {
            fileName,
            status: "transcribing",
            currentChunk: 0,
            totalChunks: chunks.length,
          },
        ]);

        text = await transcribeChunks(
          chunks,
          apiKey,
          model,
          (completed, total) => {
            setProgress([
              {
                fileName,
                status: "transcribing",
                currentChunk: completed,
                totalChunks: total,
              },
            ]);
          },
          controller.signal,
        );
      }

      // Transcription succeeded — clear recovery data
      await clearRecoveryData();
      onTranscriptionComplete([{ fileName, text: text.trim() }]);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        toast(getUserMessage(err), "error");
      }
    }

    abortRef.current = null;
    setPhase("idle");
    setProgress([]);
  }, [model, onTranscriptionComplete, resetTimer, stopAutosave, stopWaveform, clearRecoveryData, toast]);

  const handleCancelTranscription = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ── Format timer ──────────────────────────────────────────

  const formatTime = (sec: number): string => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  // ── Render: Transcribing ──────────────────────────────────

  if (phase === "transcribing") {
    return (
      <div className="space-y-4">
        <ProgressIndicator files={progress} />
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancelTranscription}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // ── Render: Idle / Recording ──────────────────────────────

  const isRecording = phase === "recording";
  const isPaused = recorderState === "paused";

  return (
    <GlassCard className="space-y-6">
      {/* Source selector */}
      {!isRecording && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-text-secondary">
            Audio source
          </p>
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2" role="radiogroup" aria-label="Audio source">
            {SOURCE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const available = availableSources[opt.value];
              const selected = source === opt.value;

              return (
                <button
                  key={opt.value}
                  onClick={() => available && setSource(opt.value)}
                  disabled={!available}
                  aria-pressed={selected}
                  className={`flex flex-col items-center gap-1 sm:gap-1.5 p-2.5 sm:p-3 rounded-xl border text-center transition-all duration-200 ${
                    !available
                      ? "opacity-40 cursor-not-allowed border-surface-border bg-surface/30"
                      : selected
                        ? "border-primary-500 bg-primary-500/8 dark:bg-primary-500/12"
                        : "border-surface-border bg-surface/50 hover:bg-surface hover:border-surface-border"
                  }`}
                >
                  <Icon
                    size={18}
                    className={
                      selected ? "text-primary-500" : "text-text-tertiary"
                    }
                  />
                  <span
                    className={`text-xs font-medium ${
                      selected
                        ? "text-primary-600 dark:text-primary-400"
                        : "text-text-primary"
                    }`}
                  >
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
          {!availableSources.system && source !== "mic" && (
            <p className="text-xs text-text-tertiary">
              System audio is only available in Chrome or Edge on desktop.
            </p>
          )}
          {source === "system" || source === "both" ? (
            <p className="text-xs text-text-tertiary">
              Your browser will ask you to choose what to share. Select a tab
              for specific audio, or your entire screen for all system audio.
            </p>
          ) : null}
        </div>
      )}

      {/* Waveform visualizer */}
      {isRecording && (
        <div className="flex justify-center">
          <canvas
            ref={canvasRef}
            width={400}
            height={60}
            className="w-full max-w-md h-[60px] rounded-lg"
          />
        </div>
      )}

      {/* Record button + controls */}
      <div className="flex flex-col items-center gap-4">
        {/* Timer */}
        {isRecording && (
          <div className="text-2xl font-semibold tabular-nums text-text-primary tracking-wide">
            {formatTime(elapsedSec)}
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center gap-4">
          {/* Pause / Resume */}
          {isRecording && (
            <button
              onClick={isPaused ? handleResume : handlePause}
              className="w-12 h-12 rounded-full bg-surface border border-surface-border flex items-center justify-center text-text-primary hover:bg-surface-hover transition-all"
              aria-label={isPaused ? "Resume recording" : "Pause recording"}
            >
              {isPaused ? <Play size={20} /> : <Pause size={20} />}
            </button>
          )}

          {/* Main record / stop button */}
          <button
            onClick={isRecording ? handleStop : handleStart}
            className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 ${
              isRecording && !isPaused
                ? "bg-record animate-record-pulse"
                : isRecording && isPaused
                  ? "bg-record"
                  : "bg-record hover:bg-record-hover hover:scale-105 active:scale-95"
            }`}
            aria-label={isRecording ? "Stop recording" : "Start recording"}
          >
            {isRecording ? (
              <Square size={20} className="text-white" fill="white" />
            ) : (
              <Mic size={24} className="text-white" />
            )}
          </button>

          {/* Spacer to balance layout when pause button shows */}
          {isRecording && <div className="w-12" />}
        </div>

        {/* Status text */}
        <p className="text-xs text-text-tertiary">
          {isRecording && !isPaused
            ? "Recording... Don\u2019t close this tab."
            : isRecording && isPaused
              ? "Paused"
              : "Tap to start recording"}
        </p>
      </div>
    </GlassCard>
  );
}
