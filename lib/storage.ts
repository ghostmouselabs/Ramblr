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

export interface SavedAudio {
  id: string;
  blob: Blob;
  mimeType: string;
  timestamp: number;
  duration: number;
  source: "recording" | "upload";
  fileName: string;
}

// ── Constants ─────────────────────────────────────────────────

const DB_NAME = "ramblr-db";
const DB_VERSION = 2;
const RECORDINGS_STORE = "recordings";
const AUDIO_STORE = "audio-files";

// ── IndexedDB wrapper ─────────────────────────────────────────

/**
 * Open (or create) the IndexedDB database.
 * Returns null if IndexedDB is unavailable (e.g. private browsing in some browsers).
 *
 * Schema migrations are incremental — each version bump adds its own
 * upgrade step so existing data is never lost.
 */
function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const oldVersion = event.oldVersion;

        // v0 → v1: crash-recovery store
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains(RECORDINGS_STORE)) {
            db.createObjectStore(RECORDINGS_STORE, { keyPath: "id" });
          }
        }

        // v1 → v2: persisted audio files store
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(AUDIO_STORE)) {
            db.createObjectStore(AUDIO_STORE, { keyPath: "id" });
          }
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
 * Run a transaction against a named object store.
 * Returns null if the database is unavailable.
 */
async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openDB();
  if (!db) return null;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
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

// ── Crash Recovery (recordings store) ─────────────────────────

export async function saveRecording(
  recording: SavedRecording,
): Promise<void> {
  try {
    await withStore(RECORDINGS_STORE, "readwrite", (store) =>
      store.put(recording),
    );
    logger.log(
      `Saved recording ${recording.id} (${recording.chunks.length} chunks)`,
    );
  } catch (err) {
    logger.warn("Failed to save recording to IndexedDB:", err);
  }
}

export async function getRecording(
  id: string,
): Promise<SavedRecording | null> {
  try {
    return (
      (await withStore(RECORDINGS_STORE, "readonly", (store) =>
        store.get(id),
      )) ?? null
    );
  } catch (err) {
    logger.warn("Failed to read recording from IndexedDB:", err);
    return null;
  }
}

export async function getAllRecordings(): Promise<SavedRecording[]> {
  try {
    return (
      (await withStore(RECORDINGS_STORE, "readonly", (store) =>
        store.getAll(),
      )) ?? []
    );
  } catch (err) {
    logger.warn("Failed to read recordings from IndexedDB:", err);
    return [];
  }
}

export async function deleteRecording(id: string): Promise<void> {
  try {
    await withStore(RECORDINGS_STORE, "readwrite", (store) =>
      store.delete(id),
    );
    logger.log(`Deleted recording ${id}`);
  } catch (err) {
    logger.warn("Failed to delete recording from IndexedDB:", err);
  }
}

// ── Persisted Audio Files (audio-files store) ─────────────────

export async function saveAudio(audio: SavedAudio): Promise<void> {
  try {
    await withStore(AUDIO_STORE, "readwrite", (store) => store.put(audio));
    logger.log(`Saved audio ${audio.id} (${audio.fileName})`);
  } catch (err) {
    logger.warn("Failed to save audio to IndexedDB:", err);
  }
}

export async function getAudio(id: string): Promise<SavedAudio | null> {
  try {
    return (
      (await withStore(AUDIO_STORE, "readonly", (store) => store.get(id))) ??
      null
    );
  } catch (err) {
    logger.warn("Failed to read audio from IndexedDB:", err);
    return null;
  }
}

export async function getAllAudio(): Promise<SavedAudio[]> {
  try {
    return (
      (await withStore(AUDIO_STORE, "readonly", (store) =>
        store.getAll(),
      )) ?? []
    );
  } catch (err) {
    logger.warn("Failed to read audio files from IndexedDB:", err);
    return [];
  }
}

export async function deleteAudio(id: string): Promise<void> {
  try {
    await withStore(AUDIO_STORE, "readwrite", (store) => store.delete(id));
    logger.log(`Deleted audio ${id}`);
  } catch (err) {
    logger.warn("Failed to delete audio from IndexedDB:", err);
  }
}

export async function deleteAllAudio(): Promise<void> {
  try {
    await withStore(AUDIO_STORE, "readwrite", (store) => store.clear());
    logger.log("Cleared all audio files");
  } catch (err) {
    logger.warn("Failed to clear audio files from IndexedDB:", err);
  }
}

// ── Utilities ─────────────────────────────────────────────────

export async function isStorageAvailable(): Promise<boolean> {
  const db = await openDB();
  if (!db) return false;
  db.close();
  return true;
}

export function generateRecordingId(): string {
  return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateAudioId(): string {
  return `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
