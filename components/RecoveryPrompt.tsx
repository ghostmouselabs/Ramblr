"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertCircle, RotateCcw, Trash2 } from "lucide-react";
import { GlassCard, Button } from "@/components/ui";
import {
  getAllRecordings,
  deleteRecording,
  type SavedRecording,
} from "@/lib/storage";

// ── Types ─────────────────────────────────────────────────────

interface RecoveryPromptProps {
  onRecover: (blob: Blob, mimeType: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isToday) return `Today at ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${time}`;
  }

  return `${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} at ${time}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ── Component ─────────────────────────────────────────────────

export function RecoveryPrompt({ onRecover }: RecoveryPromptProps) {
  const [recordings, setRecordings] = useState<SavedRecording[]>([]);
  const [recovering, setRecovering] = useState(false);

  // Check for orphaned recordings on mount
  useEffect(() => {
    let cancelled = false;

    getAllRecordings().then((recs) => {
      if (!cancelled && recs.length > 0) {
        setRecordings(recs);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRecover = useCallback(
    async (recording: SavedRecording) => {
      setRecovering(true);

      const blob = new Blob(recording.chunks, { type: recording.mimeType });
      onRecover(blob, recording.mimeType);

      // Clean up after recovery
      await deleteRecording(recording.id);
      setRecordings((prev) => prev.filter((r) => r.id !== recording.id));
      setRecovering(false);
    },
    [onRecover],
  );

  const handleDiscard = useCallback(async (recording: SavedRecording) => {
    await deleteRecording(recording.id);
    setRecordings((prev) => prev.filter((r) => r.id !== recording.id));
  }, []);

  const handleDiscardAll = useCallback(async () => {
    await Promise.all(recordings.map((r) => deleteRecording(r.id)));
    setRecordings([]);
  }, [recordings]);

  if (recordings.length === 0) return null;

  return (
    <GlassCard className="border-amber-500/30 dark:border-amber-400/20" role="alert">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">
          <AlertCircle
            size={20}
            className="text-amber-600 dark:text-amber-400"
          />
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          <div>
            <p className="text-sm font-medium text-text-primary">
              {recordings.length === 1
                ? "We found a recording from your last session"
                : `We found ${recordings.length} recordings from previous sessions`}
            </p>
            <p className="text-xs text-text-tertiary mt-0.5">
              {recordings.length === 1
                ? "Would you like to recover and transcribe it?"
                : "Would you like to recover and transcribe them?"}
            </p>
          </div>

          {/* Recording list */}
          <div className="space-y-2">
            {recordings.map((rec) => (
              <div
                key={rec.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-surface/50 border border-surface-border"
              >
                <div className="min-w-0">
                  <p className="text-sm text-text-primary truncate">
                    {formatTimestamp(rec.timestamp)}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {formatDuration(rec.duration)} &middot;{" "}
                    {rec.source === "mic"
                      ? "Microphone"
                      : rec.source === "system"
                        ? "System Audio"
                        : "Mic + System"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleRecover(rec)}
                    disabled={recovering}
                    isLoading={recovering}
                  >
                    <RotateCcw size={14} />
                    Recover
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDiscard(rec)}
                    disabled={recovering}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Discard all — only when multiple */}
          {recordings.length > 1 && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDiscardAll}
                disabled={recovering}
              >
                Discard all
              </Button>
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
