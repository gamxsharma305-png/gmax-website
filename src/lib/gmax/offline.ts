import type { Track } from "./types";
import { normalizeTrack } from "./normalize";
import { resolveSaavnStream } from "./saavn";

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

/** Best URL to fetch for offline storage (same-origin preferred). */
export function offlineSourceUrl(track: Track): string | null {
  if (track.videoId && /^[\w-]{6,20}$/.test(track.videoId)) {
    return `/api/audio?videoId=${encodeURIComponent(track.videoId)}`;
  }
  const s = track.streamUrl?.trim() || "";
  if (s && (s.startsWith("http") || s.startsWith("blob:") || s.startsWith("/"))) {
    return s;
  }
  return null;
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
      .map((r) =>
        normalizeTrack({
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
        }),
      );
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

async function fetchToBlob(
  url: string,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) detail = j.error;
    } catch {
      /* */
    }
    throw new Error(detail);
  }

  const total = Number(res.headers.get("content-length") || 0);
  const reader = res.body?.getReader();
  if (!reader) {
    const blob = await res.blob();
    onProgress?.(100);
    return blob;
  }

  const chunks: BlobPart[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (total > 0) onProgress?.(Math.min(99, Math.round((received / total) * 100)));
    else onProgress?.(Math.min(95, Math.round(received / 40000)));
  }
  const mime = (res.headers.get("content-type") || "audio/mpeg").split(";")[0];
  onProgress?.(100);
  return new Blob(chunks, { type: mime });
}

/**
 * Download track for offline.
 * YouTube: try /api/audio first; on bot-block, fall back to Saavn matching stream.
 */
export async function offlineDownload(
  track: Track,
  streamUrl?: string | null,
  onProgress?: (pct: number) => void,
): Promise<{ ok: true; bytes: number; via?: string } | { ok: false; error: string }> {
  const attempts: string[] = [];

  // 1) Explicit URL or YouTube proxy
  const primary = streamUrl || offlineSourceUrl(track);
  if (primary) {
    try {
      onProgress?.(5);
      const blob = await fetchToBlob(primary, onProgress);
      if (blob.size < 8000) throw new Error("File too small");
      await saveBlob(track, blob);
      return {
        ok: true,
        bytes: blob.size,
        via: primary.includes("/api/audio") ? "youtube" : "stream",
      };
    } catch (e) {
      attempts.push(e instanceof Error ? e.message : "primary failed");
    }
  }

  // 2) Saavn fallback (works when YouTube is bot-blocked)
  try {
    onProgress?.(10);
    const title = track.title || "";
    const artist = track.artist?.name || "";
    const hit = await resolveSaavnStream(title, artist);
    if (hit?.streamUrl) {
      const blob = await fetchToBlob(hit.streamUrl, onProgress);
      if (blob.size < 8000) throw new Error("Saavn file too small");
      await saveBlob(
        {
          ...track,
          duration: hit.duration || track.duration,
        },
        blob,
      );
      return { ok: true, bytes: blob.size, via: "saavn" };
    }
    attempts.push("No Saavn match");
  } catch (e) {
    attempts.push(e instanceof Error ? e.message : "saavn failed");
  }

  return {
    ok: false,
    error:
      attempts.find((a) => /bot|block|extract/i.test(a)) ||
      attempts[0] ||
      "Could not save offline. Try another track.",
  };
}

async function saveBlob(track: Track, blob: Blob) {
  const db = await openDb();
  const entry: OfflineEntry = {
    id: track.id,
    track: { ...track },
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
