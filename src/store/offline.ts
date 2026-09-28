import { create } from "zustand";
import type { Track } from "@/lib/gmax/types";
import {
  offlineDownload,
  offlineGetBlobUrl,
  offlineHas,
  offlineList,
  offlineRemove,
  offlineSourceUrl,
} from "@/lib/gmax/offline";

type OfflineState = {
  ids: Set<string>;
  tracks: Track[];
  downloadingId: string | null;
  progress: number;
  error: string | null;
  lastVia: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  isSaved: (id: string) => boolean;
  download: (track: Track, streamUrl?: string | null) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
  getBlobUrl: (id: string) => Promise<string | null>;
};

export const useOffline = create<OfflineState>((set, get) => ({
  ids: new Set(),
  tracks: [],
  downloadingId: null,
  progress: 0,
  error: null,
  lastVia: null,
  hydrated: false,

  hydrate: async () => {
    const tracks = await offlineList();
    set({
      tracks,
      ids: new Set(tracks.map((t) => t.id)),
      hydrated: true,
    });
  },

  isSaved: (id) => get().ids.has(id),

  download: async (track, streamUrl) => {
    set({ downloadingId: track.id, progress: 0, error: null, lastVia: null });
    const url = streamUrl || offlineSourceUrl(track);
    const res = await offlineDownload(track, url, (pct) => {
      set({ progress: pct });
    });
    if (!res.ok) {
      set({ downloadingId: null, progress: 0, error: res.error, lastVia: null });
      return false;
    }
    const tracks = await offlineList();
    set({
      tracks,
      ids: new Set(tracks.map((t) => t.id)),
      downloadingId: null,
      progress: 100,
      error: null,
      lastVia: res.via || null,
    });
    return true;
  },

  remove: async (id) => {
    await offlineRemove(id);
    const tracks = get().tracks.filter((t) => t.id !== id);
    const ids = new Set(get().ids);
    ids.delete(id);
    set({ tracks, ids });
  },

  getBlobUrl: (id) => offlineGetBlobUrl(id),
}));

export async function ensureOfflineHydrated() {
  const s = useOffline.getState();
  if (!s.hydrated) await s.hydrate();
}

export async function peekOfflineBlob(id: string): Promise<string | null> {
  await ensureOfflineHydrated();
  if (!useOffline.getState().ids.has(id)) {
    if (!(await offlineHas(id))) return null;
  }
  return offlineGetBlobUrl(id);
}
