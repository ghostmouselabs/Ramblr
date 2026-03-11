"use client";

import { useState, useCallback, useRef } from "react";
import { Settings, AudioLines } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ApiKeySetup } from "@/components/ApiKeySetup";
import { SettingsModal } from "@/components/SettingsModal";
import { ModelSelector, useModelSelection } from "@/components/ModelSelector";
import { AudioRecorder } from "@/components/AudioRecorder";
import { AudioUploader } from "@/components/AudioUploader";
import { TranscriptionOutput } from "@/components/TranscriptionOutput";
import { RecoveryPrompt } from "@/components/RecoveryPrompt";
import { BrowserCheck } from "@/components/BrowserCheck";
import {
  ProgressIndicator,
  type FileProgress,
} from "@/components/ProgressIndicator";
import { TabGroup, ToastProvider } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useIsClient } from "@/lib/hooks";
import { STORAGE_KEYS, MAX_CHUNK_SIZE_BYTES } from "@/lib/constants";
import { chunkAudio } from "@/lib/chunker";
import { transcribeChunk, transcribeChunks } from "@/lib/transcribe";
import { getUserMessage } from "@/lib/errors";
import {
  saveTranscription,
  updateTranscription,
  generateTranscriptionId,
} from "@/lib/transcription-store";
import type { TranscriptionResult } from "@/lib/transcribe";

type ActiveTab = "record" | "upload";

// Inner component that can use useToast (inside ToastProvider)
function HomeInner() {
  const isClient = useIsClient();
  const { toast } = useToast();
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("record");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useModelSelection();
  const [results, setResults] = useState<TranscriptionResult[]>([]);

  // Recovery / re-transcription progress state
  const [recoveryProgress, setRecoveryProgress] = useState<FileProgress[] | null>(null);
  const recoveryAbortRef = useRef<AbortController | null>(null);

  // Incremented to tell HistoryTab to re-read from stores
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const bumpHistory = useCallback(() => setHistoryRefreshKey((k) => k + 1), []);

  // Auto-scroll refs
  const outputRef = useRef<HTMLDivElement>(null);
  const recoveryProgressRef = useRef<HTMLDivElement>(null);

  // State-adjustment: sync from localStorage once after hydration.
  if (isClient && hasApiKey === null) {
    setHasApiKey(!!localStorage.getItem(STORAGE_KEYS.apiKey));
  }

  const handleApiKeySaved = useCallback(() => {
    setHasApiKey(true);
  }, []);

  const handleApiKeyCleared = useCallback(() => {
    setHasApiKey(false);
  }, []);

  const handleTranscriptionComplete = useCallback(
    (newResults: TranscriptionResult[]) => {
      setResults((prev) => [...prev, ...newResults]);
      bumpHistory();
      // Auto-scroll to output — use double rAF to ensure React has rendered the updated history
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          outputRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      });
    },
    [bumpHistory],
  );

  const handleReset = useCallback(() => {
    setResults([]);
  }, []);

  // ── Shared transcription runner ─────────────────────────────
  // Used by both crash recovery and re-transcription from history.
  // Shows a ProgressIndicator while working.

  const runTranscription = useCallback(
    async (
      blob: Blob,
      fileName: string,
      options?: { audioId?: string; source?: "recording" | "upload" },
    ) => {
      const apiKey = localStorage.getItem(STORAGE_KEYS.apiKey);
      if (!apiKey) return;

      const controller = new AbortController();
      recoveryAbortRef.current = controller;

      setRecoveryProgress([
        { fileName, status: "transcribing", currentChunk: 0, totalChunks: 1 },
      ]);

      // Scroll to progress indicator so user sees it
      requestAnimationFrame(() => {
        recoveryProgressRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });

      // Create pending transcription entry
      const txId = generateTranscriptionId();
      saveTranscription({
        id: txId,
        text: "",
        timestamp: Date.now(),
        model: selectedModel,
        source: options?.source ?? "recording",
        status: "pending",
        audioId: options?.audioId,
        fileName,
        fileSize: blob.size,
      });
      bumpHistory(); // Show pending entry in history immediately

      try {
        let text: string;

        if (blob.size <= MAX_CHUNK_SIZE_BYTES) {
          text = await transcribeChunk({
            blob,
            fileName,
            apiKey,
            model: selectedModel,
            signal: controller.signal,
          });
        } else {
          const chunks = await chunkAudio(blob, fileName);
          setRecoveryProgress([
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
            selectedModel,
            (completed, total) => {
              setRecoveryProgress([
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

        updateTranscription(txId, { status: "complete", text: text.trim() });
        setResults((prev) => [...prev, { fileName, text: text.trim() }]);
        bumpHistory();

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            outputRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          });
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          updateTranscription(txId, { status: "failed", text: "" });
        } else {
          updateTranscription(txId, { status: "failed" });
          toast(getUserMessage(err), "error");
        }
        bumpHistory();
      }

      recoveryAbortRef.current = null;
      setRecoveryProgress(null);
    },
    [selectedModel, toast, bumpHistory],
  );

  const handleRecoverRecording = useCallback(
    (blob: Blob, mimeType: string) => {
      const ext = mimeType.includes("mp4") ? "mp4" : "webm";
      const fileName = `recovered-recording.${ext}`;
      void runTranscription(blob, fileName, { source: "recording" });
    },
    [runTranscription],
  );

  const handleRetranscribe = useCallback(
    (blob: Blob, fileName: string, audioId: string) => {
      void runTranscription(blob, fileName, { audioId, source: "recording" });
    },
    [runTranscription],
  );

  const handleCancelRecovery = useCallback(() => {
    recoveryAbortRef.current?.abort();
  }, []);

  // Prevent flash of wrong content during hydration
  if (!isClient) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Header */}
      <header className="glass sticky top-0 z-40 border-b border-surface-border">
        <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
              <AudioLines size={18} className="text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-text-primary">
              Ramblr
            </span>
          </div>
          <div className="flex items-center gap-1">
            {hasApiKey && (
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface transition-colors"
                aria-label="Settings"
              >
                <Settings size={20} />
              </button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-3 sm:px-6 py-6 sm:py-8">
        {!hasApiKey ? (
          <ApiKeySetup onComplete={handleApiKeySaved} />
        ) : (
          <div className="space-y-6">
            {/* Browser compatibility check */}
            <BrowserCheck />

            {/* Crash recovery prompt */}
            <RecoveryPrompt onRecover={handleRecoverRecording} />

            {/* Recovery / re-transcription progress */}
            {recoveryProgress && (
              <div ref={recoveryProgressRef} className="space-y-4">
                <ProgressIndicator files={recoveryProgress} />
                <div className="flex justify-center">
                  <button
                    onClick={handleCancelRecovery}
                    className="text-xs text-text-tertiary hover:text-text-primary transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Model selector */}
            <ModelSelector
              value={selectedModel}
              onChange={setSelectedModel}
            />

            {/* Tabs */}
            <div className="flex justify-center">
              <TabGroup
                tabs={[
                  { value: "record" as const, label: "Record" },
                  { value: "upload" as const, label: "Upload" },
                ]}
                active={activeTab}
                onChange={setActiveTab}
              />
            </div>

            {/* Tab content */}
            <div
              role="tabpanel"
              id={`tabpanel-${activeTab}`}
              aria-labelledby={`tab-${activeTab}`}
            >
              {activeTab === "record" ? (
                <AudioRecorder
                  model={selectedModel}
                  onTranscriptionComplete={handleTranscriptionComplete}
                />
              ) : (
                <AudioUploader
                  model={selectedModel}
                  onTranscriptionComplete={handleTranscriptionComplete}
                />
              )}
            </div>

            {/* Transcription output */}
            <div ref={outputRef}>
              <TranscriptionOutput
                results={results}
                onReset={handleReset}
                onRetranscribe={handleRetranscribe}
                refreshKey={historyRefreshKey}
              />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 text-center">
        <p className="text-xs text-text-tertiary">
          If you&apos;re recording a call, make sure all participants are
          aware and consent to being recorded.
        </p>
      </footer>

      {/* Settings modal */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onApiKeyCleared={handleApiKeyCleared}
      />
    </div>
  );
}

export default function Home() {
  return (
    <ToastProvider>
      <HomeInner />
    </ToastProvider>
  );
}
