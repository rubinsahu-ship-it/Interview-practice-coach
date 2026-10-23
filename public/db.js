// public/db.js — IndexedDB Storage & Audio Format Utilities for Interview Practice Coach

const DB_NAME = "InterviewCoachDB";
const DB_VERSION = 1;
const STORE_NAME = "recordings";

let dbPromise = null;

/**
 * Open (or create) the IndexedDB database.
 * Preserves all recordings across page refreshes and browser restarts.
 */
export function openRecordingsDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this browser."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("sessionId", "sessionId", { unique: false });
        store.createIndex("recordingDate", "recordingDate", { unique: false });
        store.createIndex("role", "role", { unique: false });
        store.createIndex("answerType", "answerType", { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.error("IndexedDB open error:", event.target.error);
      reject(event.target.error);
    };
  });

  return dbPromise;
}

/**
 * Helper to ensure a Blob can be safely stored in IndexedDB.
 * Modern browsers support Blobs in IndexedDB directly.
 */
async function prepareRecordForStorage(record) {
  // Return shallow copy
  return { ...record };
}

/**
 * Reconstitutes Blob if needed when reading from IndexedDB.
 */
function normalizeRecordFromStorage(record) {
  if (!record) return null;
  if (record.audioBlob instanceof Blob) {
    return record;
  }
  if (record.audioArrayBuffer && record.mimeType) {
    record.audioBlob = new Blob([record.audioArrayBuffer], { type: record.mimeType });
  }
  return record;
}

/**
 * Save an audio recording record into IndexedDB.
 * Fields: id, sessionId, questionId, role, questionText, answerType, audioBlob, mimeType, fileExtension, recordingDate
 */
export async function saveRecordingToDB(record) {
  const db = await openRecordingsDB();
  const prepared = await prepareRecordForStorage(record);

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(prepared);

      req.onsuccess = () => resolve(record);
      req.onerror = async () => {
        // Fallback for Safari/WebKit edge case where direct Blob storage might throw DataCloneError
        if (req.error && req.error.name === "DataCloneError" && record.audioBlob) {
          try {
            const buffer = await record.audioBlob.arrayBuffer();
            const fallbackRecord = {
              ...record,
              audioBlob: null,
              audioArrayBuffer: buffer,
            };
            const retryTx = db.transaction(STORE_NAME, "readwrite");
            const retryStore = retryTx.objectStore(STORE_NAME);
            const retryReq = retryStore.put(fallbackRecord);
            retryReq.onsuccess = () => resolve(record);
            retryReq.onerror = () => reject(retryReq.error);
          } catch (e) {
            reject(e);
          }
        } else {
          reject(req.error);
        }
      };
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Retrieve all recordings sorted newest first.
 */
export async function getAllRecordingsFromDB() {
  const db = await openRecordingsDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const rawResults = req.result || [];
        const normalized = rawResults.map(normalizeRecordFromStorage);
        // Sort newest first
        normalized.sort((a, b) => new Date(b.recordingDate) - new Date(a.recordingDate));
        resolve(normalized);
      };

      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Get recordings matching a specific sessionId.
 */
export async function getRecordingsBySession(sessionId) {
  const all = await getAllRecordingsFromDB();
  return all.filter((r) => r.sessionId === sessionId);
}

/**
 * Get the latest recording for a given question and answer type.
 */
export async function getLatestRecordingForQuestion(sessionId, questionId, answerType) {
  const all = await getAllRecordingsFromDB();
  return all.find(
    (r) =>
      r.sessionId === sessionId &&
      Number(r.questionId) === Number(questionId) &&
      r.answerType === answerType
  ) || null;
}

/**
 * Delete a single recording by its ID.
 */
export async function deleteRecordingFromDB(id) {
  const db = await openRecordingsDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Clear all recordings from the database.
 */
export async function clearAllRecordingsFromDB() {
  const db = await openRecordingsDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();

      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

// ==========================================================================
// Supported Recording Format Detection & MIME-to-Extension Resolution
// ==========================================================================

export const CANDIDATE_MIME_TYPES = [
  { mime: "audio/webm;codecs=opus", ext: "webm", label: "WebM (Opus)" },
  { mime: "audio/webm", ext: "webm", label: "WebM" },
  { mime: "audio/mp4;codecs=mp4a.40.2", ext: "m4a", label: "M4A (AAC)" },
  { mime: "audio/mp4", ext: "m4a", label: "MP4 Audio" },
  { mime: "audio/aac", ext: "aac", label: "AAC" },
  { mime: "audio/ogg;codecs=opus", ext: "ogg", label: "OGG (Opus)" },
  { mime: "audio/ogg", ext: "ogg", label: "OGG" },
  { mime: "audio/wav", ext: "wav", label: "WAV" },
];

/**
 * Detect the best audio MIME format supported by the current browser's MediaRecorder.
 * Chrome/Firefox/Edge typically support WebM/Opus. Safari iOS/macOS typically supports MP4/AAC.
 */
export function getSupportedAudioFormat() {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") {
    return { mime: "", ext: "webm", label: "Audio" };
  }

  for (const candidate of CANDIDATE_MIME_TYPES) {
    if (
      typeof MediaRecorder.isTypeSupported === "function" &&
      MediaRecorder.isTypeSupported(candidate.mime)
    ) {
      return candidate;
    }
  }

  return { mime: "", ext: "webm", label: "Default Audio" };
}

/**
 * Determine the correct file extension for a given MIME type string.
 * Never blindly assumes WebM — handles m4a, mp4, aac, ogg, wav, mp3, etc.
 */
export function determineExtension(mimeType) {
  if (!mimeType) return "webm";
  const lower = String(mimeType).toLowerCase();

  if (lower.includes("webm")) return "webm";
  if (lower.includes("mp4") || lower.includes("m4a") || lower.includes("aac")) return "m4a";
  if (lower.includes("ogg")) return "ogg";
  if (lower.includes("wav") || lower.includes("wave") || lower.includes("x-wav")) return "wav";
  if (lower.includes("mp3") || lower.includes("mpeg")) return "mp3";

  // Subtype extraction fallback
  const match = lower.match(/audio\/([a-z0-9_-]+)/);
  if (match && match[1] && match[1].length <= 5) {
    return match[1];
  }

  return "webm";
}

/**
 * Clean a string for safe use in downloaded filenames.
 */
function sanitizeFilenamePart(str) {
  return String(str || "")
    .trim()
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 30);
}

/**
 * Format a download filename using the role, question index, answer type, and correct extension.
 */
export function generateRecordingFilename(recording) {
  const rolePart = sanitizeFilenamePart(recording.role || "Interview");
  const qNum = recording.questionId ? `Q${recording.questionId}` : "Q";
  const typePart = recording.answerType === "followup" ? "followup" : "main";
  const ext = recording.fileExtension || determineExtension(recording.mimeType);

  let dateStr = "recording";
  try {
    const d = recording.recordingDate ? new Date(recording.recordingDate) : new Date();
    dateStr = d.toISOString().split("T")[0];
  } catch {}

  return `${rolePart}_${qNum}_${typePart}_${dateStr}.${ext}`;
}

/**
 * Download a recorded audio file with the correct detected file extension.
 */
export function triggerAudioDownload(recording) {
  if (!recording || !recording.audioBlob) {
    throw new Error("No audio data available for download.");
  }

  const filename = generateRecordingFilename(recording);
  const blobUrl = URL.createObjectURL(recording.audioBlob);
  const anchor = document.createElement("a");

  anchor.style.display = "none";
  anchor.href = blobUrl;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();

  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(blobUrl);
  }, 250);
}
