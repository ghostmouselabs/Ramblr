"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Copy,
  Check,
  Download,
  ChevronDown,
  ChevronUp,
  Trash2,
  RotateCcw,
  FileAudio,
  HardDrive,
  CheckSquare,
  Square,
  AlertCircle,
  Loader2,
  Search,
  X,
  ArrowUpDown,
  Play,
} from "lucide-react";
import { GlassCard, Button, TabGroup, Modal } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useIsClient } from "@/lib/hooks";
import { MODELS, STORAGE_KEYS } from "@/lib/constants";
import {
  getTranscriptions,
  deleteTranscription,
  clearTranscriptions,
  type TranscriptionEntry,
} from "@/lib/transcription-store";
import { getAudio, deleteAudio, deleteAllAudio, getAllAudio } from "@/lib/storage";
import { getExtensionForMime } from "@/lib/audio-utils";
import {
  formatTimestamp,
  formatDuration,
  formatFileSize,
  countWords,
} from "@/lib/format";
import type { TranscriptionResult } from "@/lib/transcribe";

// ── Types ─────────────────────────────────────────────────────

type OutputTab = "latest" | "history";
type SortOption = "newest" | "oldest" | "longest" | "largest" | "most-words";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "longest", label: "Longest duration" },
  { value: "largest", label: "Largest file" },
  { value: "most-words", label: "Most words" },
];

interface TranscriptionOutputProps {
  results: TranscriptionResult[];
  onReset: () => void;
  onRetranscribe: (blob: Blob, fileName: string, audioId: string) => void;
  /** Increment to force HistoryTab to re-read from stores. */
  refreshKey?: number;
}

// ── Main component ────────────────────────────────────────────

export function TranscriptionOutput({
  results,
  onReset,
  onRetranscribe,
  refreshKey = 0,
}: TranscriptionOutputProps) {
  const isClient = useIsClient();
  const [activeTab, setActiveTab] = useState<OutputTab>("latest");

  if (!isClient) return null;

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <TabGroup
          tabs={[
            { value: "latest" as const, label: "Latest" },
            { value: "history" as const, label: "History" },
          ]}
          active={activeTab}
          onChange={setActiveTab}
        />
      </div>

      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {activeTab === "latest" ? (
          <LatestTab results={results} onReset={onReset} />
        ) : (
          <HistoryTab onRetranscribe={onRetranscribe} refreshKey={refreshKey} />
        )}
      </div>
    </div>
  );
}

// ── Latest tab ────────────────────────────────────────────────

function LatestTab({
  results,
  onReset,
}: {
  results: TranscriptionResult[];
  onReset: () => void;
}) {
  if (results.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-text-tertiary">
          Transcriptions will appear here after recording or uploading audio.
        </p>
      </div>
    );
  }

  const latest = results[results.length - 1];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">
          Latest transcription
        </h2>
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw size={14} />
          Clear
        </Button>
      </div>
      <LatestResult result={latest} />
    </div>
  );
}

function LatestResult({ result }: { result: TranscriptionResult }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    toast("Copied to clipboard.", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([result.text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${stripExtension(result.fileName)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const words = countWords(result.text);

  return (
    <GlassCard className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="primary" size="sm" onClick={handleCopy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied!" : "Copy"}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDownload}>
            <Download size={14} />
            Download .txt
          </Button>
        </div>
        {words > 0 && (
          <span className="text-xs text-text-tertiary">
            {words.toLocaleString()} word{words !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto">
        {result.text || (
          <span className="text-text-tertiary italic">
            No speech detected in this audio.
          </span>
        )}
      </div>
    </GlassCard>
  );
}

// ── History tab ───────────────────────────────────────────────

function HistoryTab({
  onRetranscribe,
  refreshKey = 0,
}: {
  onRetranscribe: (blob: Blob, fileName: string, audioId: string) => void;
  refreshKey?: number;
}) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<TranscriptionEntry[]>([]);
  const [audioSizes, setAudioSizes] = useState<Record<string, number>>({});
  const [lastRefreshKey, setLastRefreshKey] = useState(-1);

  // Search & sort
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [sortSynced, setSortSynced] = useState(false);

  // Bulk selection
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Confirmation modals
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // State-adjustment: sync transcriptions from localStorage on mount
  // AND whenever refreshKey changes (new transcription added/completed).
  if (lastRefreshKey !== refreshKey) {
    setLastRefreshKey(refreshKey);
    setEntries(getTranscriptions());
  }

  // State-adjustment: restore persisted sort preference once
  if (!sortSynced) {
    setSortSynced(true);
    const saved = localStorage.getItem(STORAGE_KEYS.historySort);
    if (saved && SORT_OPTIONS.some((o) => o.value === saved)) {
      setSortBy(saved as SortOption);
    }
  }

  // Async: fetch audio blob sizes from IndexedDB (on mount + refreshKey change)
  useEffect(() => {
    getAllAudio().then((audioFiles) => {
      const sizes: Record<string, number> = {};
      for (const a of audioFiles) {
        sizes[a.id] = a.blob.size;
      }
      setAudioSizes(sizes);
    });
  }, [refreshKey]);

  // ── Search + sort pipeline ──────────────────────────────────
  // entries → filter by search → sort → render

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.text.toLowerCase().includes(q) ||
        (e.fileName?.toLowerCase().includes(q) ?? false),
    );
  }, [entries, searchQuery]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    switch (sortBy) {
      case "oldest":
        return list.reverse();
      case "longest":
        return list.sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0));
      case "largest":
        return list.sort((a, b) => {
          const sizeA = a.fileSize ?? (a.audioId ? audioSizes[a.audioId] : 0) ?? 0;
          const sizeB = b.fileSize ?? (b.audioId ? audioSizes[b.audioId] : 0) ?? 0;
          return sizeB - sizeA;
        });
      case "most-words":
        return list.sort((a, b) => countWords(b.text) - countWords(a.text));
      default: // "newest" — already in newest-first order from store
        return list;
    }
  }, [filtered, sortBy, audioSizes]);

  const handleSortChange = useCallback((value: SortOption) => {
    setSortBy(value);
    localStorage.setItem(STORAGE_KEYS.historySort, value);
  }, []);

  const refresh = useCallback(() => {
    setEntries(getTranscriptions());
    getAllAudio().then((audioFiles) => {
      const sizes: Record<string, number> = {};
      for (const a of audioFiles) {
        sizes[a.id] = a.blob.size;
      }
      setAudioSizes(sizes);
    });
  }, []);

  // ── Storage summary ─────────────────────────────────────────

  const totalAudioBytes = Object.values(audioSizes).reduce((a, b) => a + b, 0);
  const totalTextBytes = entries.reduce(
    (sum, e) => sum + new Blob([e.text]).size,
    0,
  );
  const totalBytes = totalAudioBytes + totalTextBytes;
  const audioCount = Object.keys(audioSizes).length;

  // ── Selection helpers ───────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(sorted.map((e) => e.id)));
  const selectNone = () => setSelected(new Set());

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  // ── Confirm wrapper ─────────────────────────────────────────

  const confirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmAction({ title, message, onConfirm });
  };

  // ── Deletion actions ────────────────────────────────────────

  const handleDeleteEntry = useCallback(
    (entry: TranscriptionEntry) => {
      confirm(
        "Delete transcription",
        "This will permanently delete the transcription and its associated audio. This can\u2019t be undone.",
        async () => {
          if (entry.audioId) await deleteAudio(entry.audioId);
          deleteTranscription(entry.id);
          refresh();
          toast("Transcription deleted.", "info");
        },
      );
    },
    [refresh, toast],
  );

  const handleDeleteAudioOnly = useCallback(
    (entry: TranscriptionEntry) => {
      confirm(
        "Delete audio",
        "This will delete the audio file to free space but keep the transcription text. This can\u2019t be undone.",
        async () => {
          if (entry.audioId) await deleteAudio(entry.audioId);
          refresh();
          toast("Audio deleted.", "info");
        },
      );
    },
    [refresh, toast],
  );

  const handleBulkDelete = useCallback(() => {
    if (selected.size === 0) return;
    confirm(
      `Delete ${selected.size} item${selected.size !== 1 ? "s" : ""}`,
      `This will permanently delete ${selected.size} transcription${selected.size !== 1 ? "s" : ""} and their audio. This can\u2019t be undone.`,
      async () => {
        const entriesToDelete = entries.filter((e) => selected.has(e.id));
        for (const e of entriesToDelete) {
          if (e.audioId) await deleteAudio(e.audioId);
          deleteTranscription(e.id);
        }
        exitSelectMode();
        refresh();
        toast(`Deleted ${entriesToDelete.length} item${entriesToDelete.length !== 1 ? "s" : ""}.`, "info");
      },
    );
  }, [selected, entries, refresh, toast]);

  const handleClearAllTranscriptions = useCallback(() => {
    confirm(
      "Clear all transcriptions",
      "This will remove all transcription text but keep audio files. This can\u2019t be undone.",
      () => {
        clearTranscriptions();
        refresh();
        toast("All transcriptions cleared.", "info");
      },
    );
  }, [refresh, toast]);

  const handleClearAllAudio = useCallback(() => {
    confirm(
      "Clear all audio",
      "This will delete all saved audio files but keep transcription text. This can\u2019t be undone.",
      async () => {
        await deleteAllAudio();
        refresh();
        toast("All audio cleared.", "info");
      },
    );
  }, [refresh, toast]);

  const handleClearEverything = useCallback(() => {
    confirm(
      "Clear everything",
      "This will permanently delete all transcriptions and all audio files. This can\u2019t be undone.",
      async () => {
        await deleteAllAudio();
        clearTranscriptions();
        exitSelectMode();
        refresh();
        toast("Everything cleared.", "info");
      },
    );
  }, [refresh, toast]);

  // ── Re-transcribe / download audio ──────────────────────────

  const handleDownloadAudio = useCallback(
    async (entry: TranscriptionEntry) => {
      if (!entry.audioId) return;
      const audio = await getAudio(entry.audioId);
      if (!audio) {
        toast("Audio file not found.", "error");
        return;
      }
      const ext = getExtensionForMime(audio.mimeType);
      const url = URL.createObjectURL(audio.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = audio.fileName || `audio.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [toast],
  );

  const handleRetranscribe = useCallback(
    async (entry: TranscriptionEntry) => {
      if (!entry.audioId) return;
      const audio = await getAudio(entry.audioId);
      if (!audio) {
        toast("Audio file not found.", "error");
        return;
      }
      onRetranscribe(audio.blob, audio.fileName, entry.audioId);
    },
    [onRetranscribe, toast],
  );

  // ── Render ──────────────────────────────────────────────────

  if (entries.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-text-tertiary">
          No transcription history yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header: count, storage, select toggle, management */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          <HardDrive size={12} />
          <span>
            {formatFileSize(totalBytes)} ({audioCount} audio, {entries.length} transcription{entries.length !== 1 ? "s" : ""})
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {selectMode ? (
            <>
              <Button variant="ghost" size="sm" onClick={selected.size === sorted.length ? selectNone : selectAll}>
                {selected.size === sorted.length ? "Deselect all" : "Select all"}
              </Button>
              {selected.size > 0 && (
                <Button variant="danger" size="sm" onClick={handleBulkDelete}>
                  <Trash2 size={14} />
                  Delete ({selected.size})
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={exitSelectMode}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setSelectMode(true)}>
                <CheckSquare size={14} />
                Select
              </Button>
              <ManagementMenu
                onClearTranscriptions={handleClearAllTranscriptions}
                onClearAudio={handleClearAllAudio}
                onClearEverything={handleClearEverything}
              />
            </>
          )}
        </div>
      </div>

      {/* Search + sort controls */}
      <div className="flex items-center gap-2">
        {/* Search input */}
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transcriptions..."
            className="w-full pl-8 pr-8 py-2 rounded-xl bg-surface border border-surface-border text-sm text-text-primary placeholder:text-text-tertiary transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-text-tertiary hover:text-text-primary transition-colors"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Sort dropdown */}
        <div className="relative shrink-0">
          <ArrowUpDown
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
          />
          <select
            value={sortBy}
            onChange={(e) => handleSortChange(e.target.value as SortOption)}
            className="appearance-none pl-8 pr-7 py-2 rounded-xl bg-surface border border-surface-border text-sm text-text-primary transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500 cursor-pointer"
            aria-label="Sort order"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
          />
        </div>
      </div>

      {/* Entry list */}
      {sorted.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-text-tertiary">
            No results for &ldquo;{searchQuery}&rdquo;
          </p>
        </div>
      ) : (
        sorted.map((entry) => (
          <HistoryEntry
            key={entry.id}
            entry={entry}
            audioSize={entry.audioId ? audioSizes[entry.audioId] : undefined}
            selectMode={selectMode}
            isSelected={selected.has(entry.id)}
            onToggleSelect={() => toggleSelect(entry.id)}
            onDelete={() => handleDeleteEntry(entry)}
            onDeleteAudioOnly={() => handleDeleteAudioOnly(entry)}
            onDownloadAudio={() => handleDownloadAudio(entry)}
            onRetranscribe={() => handleRetranscribe(entry)}
          />
        ))
      )}

      {/* Confirmation modal */}
      <Modal
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        title={confirmAction?.title}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            {confirmAction?.message}
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmAction(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                confirmAction?.onConfirm();
                setConfirmAction(null);
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Management dropdown ───────────────────────────────────────

function ManagementMenu({
  onClearTranscriptions,
  onClearAudio,
  onClearEverything,
}: {
  onClearTranscriptions: () => void;
  onClearAudio: () => void;
  onClearEverything: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>
        <Trash2 size={14} />
        Manage
      </Button>
      {open && (
        <>
          {/* Backdrop to close on outside click */}
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 z-40 glass rounded-xl border border-surface-border shadow-lg py-1 min-w-[200px]">
            <MenuButton
              onClick={() => {
                setOpen(false);
                onClearTranscriptions();
              }}
            >
              Clear all transcriptions
            </MenuButton>
            <MenuButton
              onClick={() => {
                setOpen(false);
                onClearAudio();
              }}
            >
              Clear all audio
            </MenuButton>
            <div className="my-1 border-t border-surface-border" />
            <MenuButton
              onClick={() => {
                setOpen(false);
                onClearEverything();
              }}
              danger
            >
              Clear everything
            </MenuButton>
          </div>
        </>
      )}
    </div>
  );
}

function MenuButton({
  children,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
        danger
          ? "text-error hover:bg-error/10"
          : "text-text-primary hover:bg-surface"
      }`}
    >
      {children}
    </button>
  );
}

// ── History entry ─────────────────────────────────────────────

function HistoryEntry({
  entry,
  audioSize,
  selectMode,
  isSelected,
  onToggleSelect,
  onDelete,
  onDeleteAudioOnly,
  onDownloadAudio,
  onRetranscribe,
}: {
  entry: TranscriptionEntry;
  audioSize: number | undefined;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
  onDeleteAudioOnly: () => void;
  onDownloadAudio: () => void;
  onRetranscribe: () => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Audio playback — blob URL lifecycle managed via revokeRef
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const revokeRef = useRef<(() => void) | null>(null);

  // State-adjustment: clear audio URL when entry is collapsed
  if (!expanded && audioUrl) {
    setAudioUrl(null);
  }

  // Revoke the previous blob URL whenever audioUrl changes or on unmount.
  // This is the single place blob URLs get revoked — no duplication.
  useEffect(() => {
    // If audioUrl just became null, revoke the old one
    if (!audioUrl && revokeRef.current) {
      revokeRef.current();
      revokeRef.current = null;
    }
    return () => {
      if (revokeRef.current) {
        revokeRef.current();
        revokeRef.current = null;
      }
    };
  }, [audioUrl]);

  const handleTogglePlay = useCallback(async () => {
    // Toggle off
    if (audioUrl) {
      setAudioUrl(null);
      return;
    }

    if (!entry.audioId) return;
    setAudioLoading(true);

    const audio = await getAudio(entry.audioId);
    if (!audio) {
      setAudioLoading(false);
      toast("Audio no longer available.", "error");
      return;
    }

    const url = URL.createObjectURL(audio.blob);
    revokeRef.current = () => URL.revokeObjectURL(url);
    setAudioUrl(url);
    setAudioLoading(false);
  }, [audioUrl, entry.audioId, toast]);

  const hasAudio = audioSize !== undefined;
  const isPending = entry.status === "pending";
  const isFailed = entry.status === "failed";
  const textBytes = new Blob([entry.text]).size;
  const words = countWords(entry.text);

  const modelLabel =
    entry.model in MODELS
      ? MODELS[entry.model as keyof typeof MODELS].label
      : entry.model;

  const handleCopy = async () => {
    if (!entry.text) return;
    await navigator.clipboard.writeText(entry.text);
    setCopied(true);
    toast("Copied to clipboard.", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadText = () => {
    if (!entry.text) return;
    const blob = new Blob([entry.text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const baseName = entry.fileName
      ? stripExtension(entry.fileName)
      : `transcription-${entry.id}`;
    a.download = `${baseName}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <GlassCard
      className={`space-y-0 ${
        isSelected ? "border-primary-500 bg-primary-500/5" : ""
      } ${isPending ? "opacity-70" : ""}`}
    >
      {/* Header row */}
      <div className="flex items-start gap-2">
        {/* Checkbox in select mode */}
        {selectMode && (
          <button
            onClick={onToggleSelect}
            className="mt-0.5 p-0.5 shrink-0 text-text-tertiary hover:text-text-primary transition-colors"
            aria-label={isSelected ? "Deselect" : "Select"}
          >
            {isSelected ? (
              <CheckSquare size={18} className="text-primary-500" />
            ) : (
              <Square size={18} />
            )}
          </button>
        )}

        <div className="flex-1 min-w-0 space-y-1">
          {/* Title + status badge */}
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-text-primary truncate">
              {entry.fileName || "Recording"}
            </p>
            {isPending && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                <Loader2 size={10} className="animate-spin" />
                Pending
              </span>
            )}
            {isFailed && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-error/10 text-error shrink-0">
                <AlertCircle size={10} />
                Failed
              </span>
            )}
          </div>

          {/* Metadata row */}
          <div className="flex items-center gap-1.5 text-xs text-text-tertiary flex-wrap">
            <span>{formatTimestamp(entry.timestamp)}</span>
            <span>&middot;</span>
            <span>{modelLabel}</span>
            {entry.duration != null && entry.duration > 0 && (
              <>
                <span>&middot;</span>
                <span>{formatDuration(entry.duration)}</span>
              </>
            )}
            {words > 0 && (
              <>
                <span>&middot;</span>
                <span>{words.toLocaleString()} word{words !== 1 ? "s" : ""}</span>
              </>
            )}
          </div>

          {/* Storage sizes */}
          <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary flex-wrap">
            {hasAudio ? (
              <span>Audio: {formatFileSize(entry.fileSize ?? audioSize)}</span>
            ) : entry.audioId ? (
              <span className="italic">Audio deleted</span>
            ) : null}
            {entry.text && (
              <>
                {(hasAudio || entry.audioId) && <span>&middot;</span>}
                <span>Text: {formatFileSize(textBytes)}</span>
              </>
            )}
          </div>
        </div>

        {/* Expand toggle */}
        {!selectMode && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface transition-colors shrink-0"
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
      </div>

      {/* Expanded content */}
      {expanded && !selectMode && (
        <div className="pt-3 mt-3 border-t border-surface-border space-y-3">
          {/* Action buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {entry.text && (
              <>
                <Button variant="secondary" size="sm" onClick={handleCopy}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copied!" : "Copy"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDownloadText}
                >
                  <Download size={14} />
                  .txt
                </Button>
              </>
            )}
            {hasAudio && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleTogglePlay}
                  isLoading={audioLoading}
                >
                  <Play size={14} />
                  {audioUrl ? "Hide player" : "Play"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onDownloadAudio}
                >
                  <FileAudio size={14} />
                  Audio
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onRetranscribe}
                >
                  <RotateCcw size={14} />
                  Re-transcribe
                </Button>
              </>
            )}
            {(isPending || isFailed) && hasAudio && (
              <Button variant="primary" size="sm" onClick={onRetranscribe}>
                <RotateCcw size={14} />
                Retry
              </Button>
            )}
            {/* Spacer pushes destructive actions to the right */}
            <div className="flex-1" />
            {hasAudio && entry.text && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDeleteAudioOnly}
              >
                <FileAudio size={14} />
                Delete audio
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 size={14} />
            </Button>
          </div>

          {/* Audio player */}
          {audioUrl && (
            <audio
              controls
              src={audioUrl}
              className="w-full h-10 rounded-lg"
            >
              Your browser does not support audio playback.
            </audio>
          )}

          {/* Text preview */}
          {entry.text ? (
            <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap break-words max-h-[40vh] overflow-y-auto">
              {entry.text}
            </div>
          ) : isPending ? (
            <p className="text-sm text-text-tertiary italic">
              Transcription in progress...
            </p>
          ) : isFailed ? (
            <p className="text-sm text-text-tertiary italic">
              Transcription failed. {hasAudio ? "You can retry using the button above." : "The audio file is no longer available."}
            </p>
          ) : (
            <p className="text-sm text-text-tertiary italic">
              No speech detected in this audio.
            </p>
          )}
        </div>
      )}
    </GlassCard>
  );
}

// ── Helpers ───────────────────────────────────────────────────

function stripExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}
