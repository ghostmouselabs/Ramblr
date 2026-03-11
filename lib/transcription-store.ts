import type { ModelId } from "./constants";
import { STORAGE_KEYS } from "./constants";
import { logger } from "./logger";

// ── Types ─────────────────────────────────────────────────────

export type TranscriptionStatus = "pending" | "complete" | "failed";

export interface TranscriptionEntry {
  id: string;
  text: string;
  timestamp: number;
  model: ModelId;
  source: "recording" | "upload";
  status: TranscriptionStatus;
  duration?: number;
  audioId?: string;
  fileName?: string;
  /** Audio blob size in bytes, stored at creation time for synchronous sorting. */
  fileSize?: number;
}

// ── Public API ────────────────────────────────────────────────

/**
 * Read all transcription entries from localStorage.
 * Returns newest-first (the order they're stored in).
 */
export function getTranscriptions(): TranscriptionEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.transcriptions);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    logger.warn("Failed to read transcriptions from localStorage:", err);
    return [];
  }
}

/**
 * Persist the full transcription array back to localStorage.
 * All mutations funnel through this to keep a single write path.
 */
function persist(entries: TranscriptionEntry[]): void {
  try {
    localStorage.setItem(
      STORAGE_KEYS.transcriptions,
      JSON.stringify(entries),
    );
  } catch (err) {
    logger.warn("Failed to write transcriptions to localStorage:", err);
  }
}

/**
 * Add a new transcription entry (prepended — newest first).
 */
export function saveTranscription(entry: TranscriptionEntry): void {
  const existing = getTranscriptions();
  persist([entry, ...existing]);
  logger.log(`Saved transcription ${entry.id} (${entry.status})`);
}

/**
 * Update fields on an existing entry by ID.
 * Commonly used to move pending → complete/failed.
 */
export function updateTranscription(
  id: string,
  updates: Partial<Omit<TranscriptionEntry, "id">>,
): void {
  const entries = getTranscriptions();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return;

  entries[idx] = { ...entries[idx], ...updates };
  persist(entries);
  logger.log(`Updated transcription ${id}`);
}

/**
 * Delete a single transcription entry by ID.
 */
export function deleteTranscription(id: string): void {
  const entries = getTranscriptions();
  persist(entries.filter((e) => e.id !== id));
  logger.log(`Deleted transcription ${id}`);
}

/**
 * Remove all transcription entries.
 */
export function clearTranscriptions(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.transcriptions);
    logger.log("Cleared all transcriptions");
  } catch (err) {
    logger.warn("Failed to clear transcriptions from localStorage:", err);
  }
}

/**
 * Generate a unique transcription ID.
 */
export function generateTranscriptionId(): string {
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
