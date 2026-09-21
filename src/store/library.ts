import { create } from "zustand";
import { safeText } from "@/lib/gmax/text";
import type {
  Gender,
  HistoryEntry,
  Playlist,
  Track,
  UserProfile,
} from "@/lib/gmax/types";
import { normalizeTrack } from "@/lib/gmax/normalize";

const KEYS = {
  liked: "gmax.liked",
  playlists: "gmax.playlists",
  recents: "gmax.recents",
  history: "gmax.history",
  profile: "gmax.profile",
} as const;

const DEFAULT_PROFILE: UserProfile = {
  name: "",
  gender: "unspecified",
  completed: false,
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

function cleanTrack(raw: unknown): Track | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Track;
  return normalizeTrack({
    id: t.id,
    title: t.title,
    artistName: t.artist?.name,
    artistId: t.artist?.id,
    albumImageUrl: t.albumImageUrl,
    duration: t.duration,
    provider: t.provider,
    sourceId: t.sourceId,
    album: t.album,
    videoId: t.videoId,
    previewUrl: t.previewUrl,
    streamUrl: t.streamUrl,
    explicit: t.explicit,
    isVideo: t.isVideo,
  });
}

type LibraryState = {
  hydrated: boolean;
  profile: UserProfile;
  liked: Track[];
  playlists: Playlist[];
  recents: Track[];
  history: HistoryEntry[];
  hydrate: () => void;
  saveProfile: (patch: Partial<UserProfile>) => void;
  isLiked: (id: string) => boolean;
  toggleLike: (track: Track) => void;
  recordPlay: (track: Track) => void;
  clearHistory: () => void;
  createPlaylist: (name: string, tracks?: Track[]) => Playlist;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, name: string) => void;
  addToPlaylist: (playlistId: string, track: Track) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;
  touchPlaylist: (id: string) => void;
};

export const useLibrary = create<LibraryState>((set, get) => ({
  hydrated: false,
  profile: DEFAULT_PROFILE,
  liked: [],
  playlists: [],
  recents: [],
  history: [],

  hydrate: () => {
    if (get().hydrated) return;
    const liked = read<Track[]>(KEYS.liked, []).map(cleanTrack).filter(Boolean) as Track[];
    const playlists = read<Playlist[]>(KEYS.playlists, []).map((p) => ({
      ...p,
      name: safeText(p.name, "Playlist"),
      description: safeText(p.description),
      creator: safeText(p.creator, "You"),
      coverImageUrl: safeText(p.coverImageUrl),
      tracks: (p.tracks ?? []).map(cleanTrack).filter(Boolean) as Track[],
    }));
    const recents = read<Track[]>(KEYS.recents, []).map(cleanTrack).filter(Boolean) as Track[];
    const history = read<HistoryEntry[]>(KEYS.history, [])
      .map((e) => {
        const track = cleanTrack(e.track);
        if (!track) return null;
        return { ...e, track };
      })
      .filter(Boolean) as HistoryEntry[];
    const stored = read<Partial<UserProfile>>(KEYS.profile, {});
    const profile: UserProfile = {
      name: safeText(stored.name),
      gender: (["male", "female", "unspecified"].includes(stored.gender as string)
        ? stored.gender
        : "unspecified") as Gender,
      completed: Boolean(stored.completed),
    };
    set({ hydrated: true, liked, playlists, recents, history, profile });
  },

  saveProfile: (patch) => {
    const profile: UserProfile = {
      ...get().profile,
      ...patch,
      name: safeText(patch.name ?? get().profile.name),
    };
    write(KEYS.profile, profile);
    set({ profile });
  },

  isLiked: (id) => get().liked.some((t) => t.id === id),

  toggleLike: (track) => {
    const liked = get().liked;
    const next = liked.some((t) => t.id === track.id)
      ? liked.filter((t) => t.id !== track.id)
      : [track, ...liked];
    write(KEYS.liked, next);
    set({ liked: next });
  },

  recordPlay: (track) => {
    const recentsNow = get().recents;
    const last = recentsNow[0];
    const same =
      last &&
      (last.id === track.id ||
        (last.sourceId && track.sourceId && last.sourceId === track.sourceId) ||
        last.title.toLowerCase() === track.title.toLowerCase());
    if (same) {
      const history = [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          track,
          playedAt: Date.now(),
        },
        ...get().history,
      ].slice(0, 300);
      write(KEYS.history, history);
      set({ history });
      return;
    }
    const recents = [
      track,
      ...recentsNow.filter(
        (t) => t.id !== track.id && t.sourceId !== track.sourceId,
      ),
    ].slice(0, 50);
    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      track,
      playedAt: Date.now(),
    };
    const history = [entry, ...get().history].slice(0, 300);
    write(KEYS.recents, recents);
    write(KEYS.history, history);
    set({ recents, history });
  },

  clearHistory: () => {
    write(KEYS.history, []);
    set({ history: [] });
  },

  createPlaylist: (name, tracks = []) => {
    const clean = safeText(name, "New playlist");
    const playlist: Playlist = {
      id: `pl-${Date.now()}`,
      name: clean,
      description: "",
      creator: safeText(get().profile.name, "You"),
      coverImageUrl: tracks[0]?.albumImageUrl ?? "",
      tracks,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const playlists = [playlist, ...get().playlists];
    write(KEYS.playlists, playlists);
    set({ playlists });
    return playlist;
  },

  deletePlaylist: (id) => {
    const playlists = get().playlists.filter((p) => p.id !== id);
    write(KEYS.playlists, playlists);
    set({ playlists });
  },

  renamePlaylist: (id, name) => {
    const playlists = get().playlists.map((p) =>
      p.id === id ? { ...p, name: safeText(name, p.name), updatedAt: Date.now() } : p,
    );
    write(KEYS.playlists, playlists);
    set({ playlists });
  },

  addToPlaylist: (playlistId, track) => {
    const playlists = get().playlists.map((p) => {
      if (p.id !== playlistId) return p;
      if (p.tracks.some((t) => t.id === track.id)) return p;
      return {
        ...p,
        tracks: [...p.tracks, track],
        coverImageUrl: p.coverImageUrl || track.albumImageUrl,
        updatedAt: Date.now(),
      };
    });
    write(KEYS.playlists, playlists);
    set({ playlists });
  },

  removeFromPlaylist: (playlistId, trackId) => {
    const playlists = get().playlists.map((p) =>
      p.id === playlistId
        ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId), updatedAt: Date.now() }
        : p,
    );
    write(KEYS.playlists, playlists);
    set({ playlists });
  },

  touchPlaylist: (id) => {
    const playlists = get().playlists.map((p) =>
      p.id === id ? { ...p, updatedAt: Date.now() } : p,
    );
    write(KEYS.playlists, playlists);
    set({ playlists });
  },
}));

export function likedPlaylist(): Playlist {
  const liked = useLibrary.getState().liked;
  return {
    id: "liked",
    name: "Liked Songs",
    description: "Songs you liked",
    creator: "You",
    coverImageUrl: liked[0]?.albumImageUrl ?? "",
    tracks: liked,
    createdAt: 0,
    updatedAt: 0,
  };
}
