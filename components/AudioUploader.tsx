"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, FileAudio } from "lucide-react";
import { GlassCard, Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import {
  ProgressIndicator,
  type FileProgress,
} from "@/components/ProgressIndicator";
import {
  transcribeChunk,
  transcribeChunks,
  type TranscriptionResult,
} from "@/lib/transcribe";
import { formatFileSize } from "@/lib/format";
import {
  ACCEPTED_AUDIO_FORMATS,
  MAX_CHUNK_SIZE_BYTES,
  STORAGE_KEYS,
  type ModelId,
} from "@/lib/constants";
import { ERRORS, getUserMessage } from "@/lib/errors";

interface AudioUploaderProps {
  model: ModelId;
  onTranscriptionComplete: (results: TranscriptionResult[]) => void;
}

interface QueuedFile {
  id: string;
  file: File;
}

export function AudioUploader({
  model,
  onTranscriptionComplete,
}: AudioUploaderProps) {
  const { toast } = useToast();
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [progress, setProgress] = useState<FileProgress[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── File handling ─────────────────────────────────────────

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const newFiles: QueuedFile[] = [];
      for (const file of Array.from(incoming)) {
        // Validate format by extension — the accept attribute handles most,
        // but drag-and-drop doesn't enforce it
        const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
        if (!ACCEPTED_AUDIO_FORMATS.includes(ext)) {
          toast(
            `"${file.name}" isn\u2019t a supported format. Try MP3, WAV, M4A, or other supported formats.`,
            "error",
          );
          continue;
        }
        newFiles.push({ id: crypto.randomUUID(), file });
      }
      if (newFiles.length > 0) {
        setFiles((prev) => [...prev, ...newFiles]);
      }
    },
    [toast],
  );

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // ── Drag and drop ─────────────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only leave if we actually left the drop zone
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  // ── Transcription ─────────────────────────────────────────

  const handleTranscribe = async () => {
    if (files.length === 0) return;

    const apiKey = localStorage.getItem(STORAGE_KEYS.apiKey);
    if (!apiKey) {
      toast(ERRORS.apiKeyMissing, "error");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsTranscribing(true);

    // Initialize progress
    const initialProgress: FileProgress[] = files.map((f) => ({
      fileName: f.file.name,
      status: "queued",
    }));
    setProgress(initialProgress);

    const results: TranscriptionResult[] = [];

    for (let i = 0; i < files.length; i++) {
      if (controller.signal.aborted) break;

      const { file } = files[i];

      // Update status to transcribing
      setProgress((prev) =>
        prev.map((p, idx) =>
          idx === i ? { ...p, status: "transcribing" } : p,
        ),
      );

      try {
        let text: string;

        if (file.size <= MAX_CHUNK_SIZE_BYTES) {
          text = await transcribeChunk({
            blob: file,
            fileName: file.name,
            apiKey,
            model,
            signal: controller.signal,
          });
        } else {
          const { chunkAudio } = await import("@/lib/chunker");
          const chunks = await chunkAudio(file, file.name, model);

          setProgress((prev) =>
            prev.map((p, idx) =>
              idx === i
                ? { ...p, totalChunks: chunks.length, currentChunk: 0 }
                : p,
            ),
          );

          text = await transcribeChunks(
            chunks,
            apiKey,
            model,
            (completed, total) => {
              setProgress((prev) =>
                prev.map((p, idx) =>
                  idx === i
                    ? { ...p, currentChunk: completed, totalChunks: total }
                    : p,
                ),
              );
            },
            controller.signal,
          );
        }

        results.push({ fileName: file.name, text: text.trim() });

        setProgress((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: "done" } : p,
          ),
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") break;

        const message = getUserMessage(err);

        setProgress((prev) =>
          prev.map((p, idx) =>
            idx === i
              ? { ...p, status: "error", errorMessage: message }
              : p,
          ),
        );
        toast(message, "error");
      }
    }

    abortRef.current = null;
    setIsTranscribing(false);

    if (results.length > 0) {
      onTranscriptionComplete(results);
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  // ── Render ────────────────────────────────────────────────

  if (isTranscribing) {
    return (
      <div className="space-y-4">
        <ProgressIndicator files={progress} />
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <GlassCard
        className={`transition-all duration-200 ${
          isDragOver
            ? "border-primary-500 bg-primary-500/5 scale-[1.01]"
            : ""
        }`}
      >
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center justify-center py-10 cursor-pointer border-2 border-dashed border-surface-border rounded-xl hover:border-primary-500/40 transition-colors"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          aria-label="Upload audio files"
        >
          <div className="w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center mb-3">
            <Upload
              size={22}
              className={
                isDragOver ? "text-primary-500" : "text-text-tertiary"
              }
            />
          </div>
          <p className="text-sm font-medium text-text-primary">
            {isDragOver
              ? "Drop your files here"
              : "Drag audio files here or click to browse"}
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            Supports MP3, WAV, M4A, FLAC, OGG, WebM, and more
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_AUDIO_FORMATS}
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = ""; // Reset so same file can be re-added
            }}
            className="hidden"
            aria-hidden="true"
          />
        </div>
      </GlassCard>

      {/* File list */}
      {files.length > 0 && (
        <GlassCard className="space-y-3">
          <ul className="space-y-2">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-3 py-2 px-3 rounded-lg bg-surface/50 group"
              >
                <FileAudio
                  size={18}
                  className="text-primary-500 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">
                    {f.file.name}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {formatFileSize(f.file.size)}
                  </p>
                </div>
                <button
                  onClick={() => removeFile(f.id)}
                  className="p-1.5 rounded-lg text-text-tertiary hover:text-error hover:bg-error/10 transition-colors sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                  aria-label={`Remove ${f.file.name}`}
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-text-tertiary">
              {files.length} file{files.length !== 1 ? "s" : ""} selected
            </span>
            <Button
              variant="primary"
              size="md"
              onClick={handleTranscribe}
            >
              Transcribe{files.length > 1 ? " all" : ""}
            </Button>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
