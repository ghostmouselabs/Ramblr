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
import { TabGroup, ToastProvider } from "@/components/ui";
import { useIsClient } from "@/lib/hooks";
import { STORAGE_KEYS, MAX_CHUNK_SIZE_BYTES } from "@/lib/constants";
import { chunkAudio } from "@/lib/chunker";
import { transcribeChunk, transcribeChunks } from "@/lib/transcribe";
import type { TranscriptionResult } from "@/lib/transcribe";

type ActiveTab = "record" | "upload";

export default function Home() {
  const isClient = useIsClient();
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("record");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useModelSelection();
  const [results, setResults] = useState<TranscriptionResult[]>([]);
  const recoveryAbortRef = useRef<AbortController | null>(null);

  // State-adjustment: sync from localStorage once after hydration.
  // React detects this during render and restarts without committing stale UI.
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
    },
    [],
  );

  const handleReset = useCallback(() => {
    setResults([]);
  }, []);

  const handleRecoverRecording = useCallback(
    async (blob: Blob, mimeType: string) => {
      const apiKey = localStorage.getItem(STORAGE_KEYS.apiKey);
      if (!apiKey) return;

      const controller = new AbortController();
      recoveryAbortRef.current = controller;

      const ext = mimeType.includes("mp4") ? "mp4" : "webm";
      const fileName = `recovered-recording.${ext}`;

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
          const chunks = await chunkAudio(blob, fileName, selectedModel);
          text = await transcribeChunks(
            chunks,
            apiKey,
            selectedModel,
            () => {},
            controller.signal,
          );
        }

        setResults((prev) => [...prev, { fileName, text: text.trim() }]);
      } catch {
        // Silently handle — user will see no result appear
      }

      recoveryAbortRef.current = null;
    },
    [selectedModel],
  );

  // Prevent flash of wrong content during hydration
  if (!isClient) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ToastProvider>
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
              <TranscriptionOutput results={results} onReset={handleReset} />
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
      </div>

      {/* Settings modal */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onApiKeyCleared={handleApiKeyCleared}
      />
    </ToastProvider>
  );
}
