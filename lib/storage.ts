import { logger } from "./logger";
import type { AudioSource } from "./recorder";

// ── Types ─────────────────────────────────────────────────────

export interface SavedRecording {
  id: string;
  chunks: Blob[];
  mimeType: string;
  source: AudioSource;
  timestamp: number;
  duration: number;
}

// ── Constants ─────────────────────────────────────────────────

const DB_NAME = "ramblr-db";
const DB_VERSION = 1;
const STORE_NAME = "recordings";

// ── IndexedDB wrapper ─────────────────────────────────────────

/**
 * Open (or create) the IndexedDB database.
 * Returns null if IndexedDB is unavailable (e.g. private browsing in some browsers).
 */
function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);

      request.onerror = () => {
        logger.warn("IndexedDB open failed:", request.error);
        resolve(null);
      };
    } catch {
      // IndexedDB may throw synchronously in some restricted contexts
      resolve(null);
    }
  });
}

/**
 * Run a transaction against the recordings store.
 * Returns null if the database is unavailable.
 */
async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openDB();
  if (!db) return null;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = fn(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

// ── Public API ────────────────────────────────────────────────

/**
 * Save or update a recording in IndexedDB.
 */
export async function saveRecording(
  recording: SavedRecording,
): Promise<void> {
  try {
    await withStore("readwrite", (store) => store.put(recording));
    logger.log(
      `Saved recording ${recording.id} (${recording.chunks.length} chunks)`,
    );
  } catch (err) {
    logger.warn("Failed to save recording to IndexedDB:", err);
  }
}

/**
 * Retrieve a recording by ID.
 */
export async function getRecording(
  id: string,
): Promise<SavedRecording | null> {
  try {
    return (await withStore("readonly", (store) => store.get(id))) ?? null;
  } catch (err) {
    logger.warn("Failed to read recording from IndexedDB:", err);
    return null;
  }
}

/**
 * Get all saved recordings.
 */
export async function getAllRecordings(): Promise<SavedRecording[]> {
  try {
    return (
      (await withStore("readonly", (store) => store.getAll())) ?? []
    );
  } catch (err) {
    logger.warn("Failed to read recordings from IndexedDB:", err);
    return [];
  }
}

/**
 * Delete a recording by ID.
 */
export async function deleteRecording(id: string): Promise<void> {
  try {
    await withStore("readwrite", (store) => store.delete(id));
    logger.log(`Deleted recording ${id}`);
  } catch (err) {
    logger.warn("Failed to delete recording from IndexedDB:", err);
  }
}

/**
 * Check whether IndexedDB is available and functional.
 */
export async function isStorageAvailable(): Promise<boolean> {
  const db = await openDB();
  if (!db) return false;
  db.close();
  return true;
}

/**
 * Generate a unique recording ID.
 */
export function generateRecordingId(): string {
  return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
