import type { Track } from "./types";
import { normalizeTrack } from "./normalize";

const DB_NAME = "gmax-offline";
const DB_VER = 1;
const STORE = "tracks";

export type OfflineEntry = {
  id: string;
  track: Track;
  blob: Blob;
  savedAt: number;
  bytes: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onerror = () => reject(req.error || new Error("IDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function offlineHas(id: string): Promise<boolean> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getKey(id);
      req.onsuccess = () => resolve(req.result != null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return false;
  }
}

export async function offlineGetBlobUrl(id: string): Promise<string | null> {
  try {
    const db = await openDb();
    const entry = await new Promise<OfflineEntry | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as OfflineEntry | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!entry?.blob) return null;
    return URL.createObjectURL(entry.blob);
  } catch {
    return null;
  }
}

export async function offlineList(): Promise<Track[]> {
  try {
    const db = await openDb();
    const rows = await new Promise<OfflineEntry[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as OfflineEntry[]) || []);
      req.onerror = () => reject(req.error);
    });
    return rows
      .sort((a, b) => b.savedAt - a.savedAt)
      .map((r) => normalizeTrack({
        id: r.track.id,
        title: r.track.title,
        artistName: r.track.artist?.name,
        albumImageUrl: r.track.albumImageUrl,
        duration: r.track.duration,
        provider: r.track.provider,
        sourceId: r.track.sourceId,
        album: r.track.album,
        videoId: r.track.videoId,
        streamUrl: r.track.streamUrl,
      }));
  } catch {
    return [];
  }
}

export async function offlineRemove(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await txDone(tx);
}

/**
 * Download a streamable URL into IndexedDB for offline play.
 * CORS must allow the fetch (Saavn CDN etc.). YouTube iframe cannot be saved this way.
 */
export async function offlineDownload(
  track: Track,
  streamUrl: string,
  onProgress?: (pct: number) => void,
): Promise<{ ok: true; bytes: number } | { ok: false; error: string }> {
  if (!streamUrl || streamUrl.includes("/api/audio")) {
    return { ok: false, error: "No downloadable stream for this track." };
  }
  try {
    const res = await fetch(streamUrl, { mode: "cors" });
    if (!res.ok) return { ok: false, error: `Download failed (${res.status})` };

    const total = Number(res.headers.get("content-length") || 0);
    const reader = res.body?.getReader();
    if (!reader) {
      const blob = await res.blob();
      await saveBlob(track, blob);
      onProgress?.(100);
      return { ok: true, bytes: blob.size };
    }

    const chunks: BlobPart[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      if (total > 0) onProgress?.(Math.min(99, Math.round((received / total) * 100)));
    }
    const mime = res.headers.get("content-type") || "audio/mpeg";
    const blob = new Blob(chunks, { type: mime });
    await saveBlob(track, blob);
    onProgress?.(100);
    return { ok: true, bytes: blob.size };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Download failed";
    if (/cors|network|failed/i.test(msg)) {
      return {
        ok: false,
        error: "This source blocks offline save (CORS). Try a Saavn result.",
      };
    }
    return { ok: false, error: msg };
  }
}

async function saveBlob(track: Track, blob: Blob) {
  const db = await openDb();
  const entry: OfflineEntry = {
    id: track.id,
    track: {
      ...track,
      // Prefer offline playback via blob later; keep original meta
    },
    blob,
    savedAt: Date.now(),
    bytes: blob.size,
  };
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(entry);
  await txDone(tx);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
