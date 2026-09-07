/**
 * Enterprise Local & Persistent Recording Store (IndexedDB + Metadata Storage)
 * Persists raw video recording Blobs into IndexedDB (no 5MB quota limit).
 * Keeps live session blob object URLs in memory for instant playback.
 * Stores lightweight JSON metadata in localStorage.
 */

const SESSION_KEY = 'local_call_recordings';
const DB_NAME = 'MicroproRecordingsDB';
const STORE_NAME = 'blobs';

// In-memory session Blob URLs: recording id -> object URL
const sessionBlobUrls = new Map<string, string>();

export interface LocalRecording {
  id: string;
  meeting_id: string;
  status: string;
  recording_type: string;
  duration: number;
  size_bytes: number;
  created_at: string;
  playback_url?: string;
  session_only?: boolean;
  transcript?: {
    full_text: string;
    speaker_segments: Array<{
      start_time: number;
      end_time: number;
      normalized_speaker?: string;
      raw_speaker?: string;
      speaker_name?: string;
      text: string;
      confidence?: number;
    }>;
  };
}

// ─── IndexedDB Helpers ───────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not available'));
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveBlobToIDB(id: string, blob: Blob): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, id);
    return new Promise((res) => {
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
  } catch (e) {
    console.warn('IndexedDB save blob warning:', e);
  }
}

export async function getBlobFromIDB(id: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    return new Promise((res) => {
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => res(null);
    });
  } catch (e) {
    return null;
  }
}

async function deleteBlobFromIDB(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
  } catch (e) {}
}

// ─── Recording Actions ───────────────────────────────────────────────────────

/**
 * Save a completed recording blob.
 * - Triggers an immediate browser download.
 * - Stores blob in IndexedDB for persistent cross-session playback.
 * - Saves lightweight metadata in localStorage.
 * - Automatically queues Speech Intelligence API (http://192.168.1.199:8080) for transcription & speaker diarization.
 */
export async function saveRecording(params: {
  blob: Blob;
  mimeType: string;
  meetingId: string;
  durationSeconds: number;
}): Promise<LocalRecording> {
  const { blob, mimeType, meetingId, durationSeconds } = params;

  const recId = `rec_${Date.now()}`;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `Micropro_Recording_${timestamp}.webm`;

  // 1. Trigger browser download
  triggerDownload(blob, filename);

  // 2. Keep blob URL alive in session memory
  const blobUrl = URL.createObjectURL(blob);
  sessionBlobUrls.set(recId, blobUrl);

  // 3. Store raw Blob in IndexedDB (supports large multi-GB video files)
  await saveBlobToIDB(recId, blob);

  const rec: LocalRecording = {
    id: recId,
    meeting_id: meetingId || 'Meeting Session',
    status: 'READY',
    recording_type: 'AUDIO_VIDEO',
    duration: durationSeconds,
    size_bytes: blob.size,
    created_at: new Date().toISOString(),
    playback_url: blobUrl,
    session_only: false,
  };

  // 4. Save metadata to localStorage (without base64 payload)
  try {
    const existing: LocalRecording[] = JSON.parse(
      localStorage.getItem(SESSION_KEY) || '[]'
    );
    // Strip large strings from metadata entries
    const cleanList = [rec, ...existing].slice(0, 30).map(r => ({
      ...r,
      playback_url: sessionBlobUrls.has(r.id) ? sessionBlobUrls.get(r.id) : undefined
    }));
    localStorage.setItem(SESSION_KEY, JSON.stringify(cleanList));
  } catch (e) {
    console.warn('localStorage metadata save warning:', e);
  }

  // 5. Trigger Speech Intelligence API (http://192.168.1.199:8080) transcription + speaker diarization
  //    Runs in background - does not block the recording save flow.
  (async () => {
    try {
      const { meetingAIService } = await import('./meetingAIService');
      const result = await meetingAIService.transcribeWithDiarization(
        blob,
        filename,
        mimeType,
        (status) => console.info('[SpeechAPI]', status)
      );
      if (result && result.segments && result.segments.length > 0) {
        rec.transcript = {
          full_text: result.full_text,
          speaker_segments: result.segments.map((seg) => ({
            start_time: seg.start_time,
            end_time: seg.end_time,
            normalized_speaker: seg.speaker,
            speaker_name: seg.speaker,
            text: seg.text,
            confidence: seg.confidence,
          })),
        };
        // Persist transcript back into localStorage metadata
        try {
          const stored: LocalRecording[] = JSON.parse(localStorage.getItem(SESSION_KEY) || '[]');
          const updated = stored.map((r) => r.id === recId ? { ...r, transcript: rec.transcript } : r);
          localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
          console.info('[SpeechAPI] Transcript + diarization saved for recording', recId);
        } catch (e) {
          console.warn('[SpeechAPI] Failed to persist transcript metadata:', e);
        }
      }
    } catch (err: any) {
      console.warn('[SpeechAPI] Transcription/diarization notice:', err?.message || err);
    }
  })();

  return rec;
}

/**
 * Get playback URL asynchronously (checks session memory first, falls back to IndexedDB).
 */
export async function getPlaybackUrlAsync(rec: LocalRecording): Promise<string | undefined> {
  if (sessionBlobUrls.has(rec.id)) {
    return sessionBlobUrls.get(rec.id);
  }
  const idbBlob = await getBlobFromIDB(rec.id);
  if (idbBlob) {
    const url = URL.createObjectURL(idbBlob);
    sessionBlobUrls.set(rec.id, url);
    return url;
  }
  return rec.playback_url;
}

/**
 * Synchronous playback URL helper for active session.
 */
export function getPlaybackUrl(rec: LocalRecording): string | undefined {
  return sessionBlobUrls.get(rec.id) || rec.playback_url;
}

/**
 * Load all local recordings from localStorage metadata.
 */
export function getLocalRecordings(): LocalRecording[] {
  try {
    const stored: LocalRecording[] = JSON.parse(
      localStorage.getItem(SESSION_KEY) || '[]'
    );
    return stored.map((r) => ({
      ...r,
      playback_url: sessionBlobUrls.get(r.id) || r.playback_url,
    }));
  } catch {
    return [];
  }
}

/**
 * Delete a recording by ID from IndexedDB, session memory, and localStorage.
 */
export async function deleteLocalRecording(id: string): Promise<void> {
  const blobUrl = sessionBlobUrls.get(id);
  if (blobUrl) {
    try { URL.revokeObjectURL(blobUrl); } catch (e) {}
    sessionBlobUrls.delete(id);
  }

  await deleteBlobFromIDB(id);

  try {
    const existing: LocalRecording[] = JSON.parse(
      localStorage.getItem(SESSION_KEY) || '[]'
    );
    const updated = existing.filter((r) => r.id !== id);
    localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to delete recording from localStorage:', e);
  }
}

// ─── Browser Download Helper ─────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
    }, 500);
  } catch (e) {
    console.error('Download trigger failed:', e);
  }
}
