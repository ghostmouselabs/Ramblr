"use client";

import { Loader2 } from "lucide-react";
import { GlassCard } from "@/components/ui";

export interface FileProgress {
  fileName: string;
  status: "queued" | "transcribing" | "done" | "error";
  currentChunk?: number;
  totalChunks?: number;
  errorMessage?: string;
}

interface ProgressIndicatorProps {
  files: FileProgress[];
}

export function ProgressIndicator({ files }: ProgressIndicatorProps) {
  const completed = files.filter((f) => f.status === "done").length;
  const total = files.length;
  const overallPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Find the currently active file
  const active = files.find((f) => f.status === "transcribing");

  return (
    <GlassCard className="space-y-4">
      {/* Overall progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-primary font-medium">
            Transcribing{total > 1 ? ` (${completed}/${total} files)` : ""}...
          </span>
          {total > 1 && (
            <span className="text-text-tertiary">{overallPercent}%</span>
          )}
        </div>
        <div className="h-2 rounded-full bg-surface overflow-hidden">
          <div
            className="h-full rounded-full bg-primary-500 transition-all duration-500 ease-smooth"
            style={{
              width: `${total === 1 && active ? (active.totalChunks && active.totalChunks > 1 ? ((active.currentChunk ?? 0) / active.totalChunks) * 100 : 100) : overallPercent}%`,
            }}
          >
            {/* Indeterminate shimmer for single-chunk files */}
            {total === 1 &&
              active &&
              (!active.totalChunks || active.totalChunks <= 1) && (
                <div className="w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
              )}
          </div>
        </div>
      </div>

      {/* Per-file status */}
      {total > 1 && (
        <ul className="space-y-1.5">
          {files.map((file) => (
            <li
              key={file.fileName}
              className="flex items-center gap-2 text-sm"
            >
              {file.status === "transcribing" && (
                <Loader2
                  size={14}
                  className="text-primary-500 animate-spin shrink-0"
                />
              )}
              {file.status === "done" && (
                <div className="w-3.5 h-3.5 rounded-full bg-success flex items-center justify-center shrink-0">
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 8 8"
                    fill="none"
                    className="text-white"
                  >
                    <path
                      d="M1.5 4L3.25 5.75L6.5 2.25"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
              {file.status === "error" && (
                <div className="w-3.5 h-3.5 rounded-full bg-error shrink-0" />
              )}
              {file.status === "queued" && (
                <div className="w-3.5 h-3.5 rounded-full bg-surface-border shrink-0" />
              )}
              <span
                className={`truncate ${
                  file.status === "transcribing"
                    ? "text-text-primary"
                    : file.status === "done"
                      ? "text-text-secondary"
                      : file.status === "error"
                        ? "text-error"
                        : "text-text-tertiary"
                }`}
              >
                {file.fileName}
              </span>
              {file.status === "transcribing" &&
                file.totalChunks &&
                file.totalChunks > 1 && (
                  <span className="text-text-tertiary text-xs shrink-0">
                    chunk {file.currentChunk}/{file.totalChunks}
                  </span>
                )}
              {file.status === "error" && file.errorMessage && (
                <span className="text-error text-xs truncate shrink-0" role="alert">
                  {file.errorMessage}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Active file detail for single-file */}
      {total === 1 && active && (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 size={14} className="text-primary-500 animate-spin" />
          <span className="truncate">
            Transcribing {active.fileName}
            {active.totalChunks && active.totalChunks > 1
              ? ` (part ${active.currentChunk} of ${active.totalChunks})`
              : ""}
            ...
          </span>
        </div>
      )}
    </GlassCard>
  );
}
