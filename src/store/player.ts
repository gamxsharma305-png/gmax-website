import { create } from "zustand";
import type { RepeatMode, Track } from "@/lib/gmax/types";
import {
  enginePause,
  enginePlay,
  engineResume,
  engineSeek,
  engineSetVolume,
  initEngine,
  setMediaSessionNav,
} from "@/lib/gmax/engine";
import { canPlay } from "@/lib/gmax/normalize";
import { resolveVideoId } from "@/lib/gmax/search";
import { resolveSaavnStream } from "@/lib/gmax/saavn";
import { resolveAudiusStream } from "@/lib/gmax/audius";
import { useLibrary } from "./library";

type PlayerState = {
  current: Track | null;
  queue: Track[];
  index: number;
  isPlaying: boolean;
  isLoading: boolean;
  position: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  error: string | null;
  contextLabel: string;
  order: number[];
  playTrack: (track: Track, opts?: { tracks?: Track[]; label?: string }) => Promise<void>;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  seekBy: (delta: number) => void;
  setVolume: (v: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  jumpTo: (trackId: string) => void;
  removeFromQueue: (trackId: string) => void;
  addToQueue: (tracks: Track | Track[]) => void;
  retry: () => void;
};

let engineBound = false;
let resolveInflight = 0;
let consecutiveErrors = 0;
let advancing = false;

function shuffleOrder(length: number, pin?: number): number[] {
  const rest = Array.from({ length }, (_, i) => i).filter((i) => i !== pin);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = rest[i]!;
    rest[i] = rest[j]!;
    rest[j] = tmp;
  }
  return pin == null ? rest : [pin, ...rest];
}

function isYouTubeTrack(track: Track): boolean {
  return track.provider === "youtube" || Boolean(track.videoId);
}

function bindEngine() {
  if (engineBound || typeof window === "undefined") return;
  engineBound = true;
  initEngine({
    onPlay: () => {
      consecutiveErrors = 0;
      usePlayer.setState({ isPlaying: true, isLoading: false, error: null });
    },
    onPause: () => usePlayer.setState({ isPlaying: false }),
    onEnded: () => {
      consecutiveErrors = 0;
      window.setTimeout(() => {
        usePlayer.getState().next();
      }, 150);
    },
    onTime: (position, duration) => {
      const d = Number.isFinite(duration) && duration > 0 ? duration : usePlayer.getState().duration;
      usePlayer.setState({ position, duration: d });
    },
    onError: (message) => {
      consecutiveErrors += 1;
      usePlayer.setState({ error: message, isLoading: false, isPlaying: false });
      if (consecutiveErrors <= 8 && usePlayer.getState().queue.length > 1) {
        window.setTimeout(() => {
          usePlayer.getState().next();
        }, 400);
      }
    },
    onBuffer: (busy) => usePlayer.setState({ isLoading: busy }),
  });
  setMediaSessionNav(
    () => usePlayer.getState().next(),
    () => usePlayer.getState().previous(),
  );
}

/**
 * YouTube → keep videoId only (iframe in engine). No /api/audio, no Saavn swap.
 * Saavn / Audius / iTunes → their own streams.
 */
async function maybeResolve(track: Track, force = false): Promise<Track> {
  // YouTube: do not resolve proxy — engine plays via iframe
  if (isYouTubeTrack(track)) {
    return {
      ...track,
      // strip broken proxy URLs so engine uses iframe path
      streamUrl: track.streamUrl?.includes("/api/audio") ? undefined : track.streamUrl,
    };
  }

  if (!force && track.streamUrl) {
    return track;
  }

  const title = track.title?.trim() || "";
  const artist = track.artist?.name?.trim() || "";
  const token = ++resolveInflight;

  if (track.provider === "saavn" && title) {
    try {
      const saavn = await resolveSaavnStream(title, artist);
      if (token !== resolveInflight) return track;
      if (saavn?.streamUrl) {
        return {
          ...track,
          streamUrl: saavn.streamUrl,
          duration: saavn.duration || track.duration,
        };
      }
    } catch {
      /* next */
    }
  }

  if (track.provider === "audius" && title) {
    try {
      const audius = await resolveAudiusStream(title, artist);
      if (token !== resolveInflight) return track;
      if (audius?.streamUrl) {
        return {
          ...track,
          streamUrl: audius.streamUrl,
          duration: audius.duration || track.duration,
        };
      }
    } catch {
      /* next */
    }
  }

  if (title && !track.videoId) {
    try {
      const resolved = await resolveVideoId(title, artist);
      if (token !== resolveInflight) return track;
      if (resolved?.streamUrl) {
        return {
          ...track,
          streamUrl: resolved.streamUrl,
          duration: resolved.duration || track.duration,
        };
      }
      // If resolve only found a YT id, attach it for iframe
      if (resolved?.videoId) {
        return { ...track, videoId: resolved.videoId };
      }
    } catch {
      /* fall through */
    }
  }

  return track;
}

async function start(track: Track, forceResolve = false) {
  bindEngine();
  usePlayer.setState({
    current: track,
    isLoading: true,
    error: null,
    position: 0,
    duration: track.duration || 0,
  });

  let resolved = await maybeResolve(track, forceResolve || !track.streamUrl);

  if (!resolved.streamUrl && !resolved.videoId && !resolved.previewUrl) {
    resolved = await maybeResolve(track, true);
  }

  usePlayer.setState({ current: resolved });

  if (!canPlay(resolved) && !resolved.videoId && !resolved.streamUrl && !resolved.previewUrl) {
    usePlayer.setState({
      isLoading: false,
      error: "This track has no playable source.",
    });
    const q = usePlayer.getState().queue;
    if (q.length > 1 && consecutiveErrors < 8) {
      consecutiveErrors += 1;
      window.setTimeout(() => usePlayer.getState().next(), 300);
    }
    return;
  }

  await enginePlay(resolved);
  consecutiveErrors = 0;
  useLibrary.getState().recordPlay(resolved);

  void prefetchNeighbor();
}

async function prefetchNeighbor() {
  const { queue, index, order, shuffle } = usePlayer.getState();
  if (queue.length < 2) return;
  const seq = shuffle ? order : queue.map((_, i) => i);
  const pos = seq.indexOf(index);
  if (pos < 0) return;
  const nextIndex = seq[(pos + 1) % seq.length];
  if (nextIndex == null) return;
  const t = queue[nextIndex];
  if (!t || isYouTubeTrack(t) || t.streamUrl) return;
  try {
    const resolved = await maybeResolve(t, true);
    if (resolved.streamUrl || resolved.videoId) {
      const q = usePlayer.getState().queue.slice();
      const i = q.findIndex((x) => x.id === t.id);
      if (i >= 0) {
        q[i] = resolved;
        usePlayer.setState({ queue: q });
      }
    }
  } catch {
    /* ignore */
  }
}

export const usePlayer = create<PlayerState>((set, get) => ({
  current: null,
  queue: [],
  index: 0,
  isPlaying: false,
  isLoading: false,
  position: 0,
  duration: 0,
  shuffle: false,
  repeat: "all",
  volume: 1,
  error: null,
  contextLabel: "GMAX",
  order: [],

  playTrack: async (track, opts) => {
    const queue = opts?.tracks?.length ? opts.tracks : [track];
    const index = Math.max(0, queue.findIndex((t) => t.id === track.id));
    const order = get().shuffle ? shuffleOrder(queue.length, index) : queue.map((_, i) => i);
    const multi = queue.length > 1;
    consecutiveErrors = 0;
    advancing = false;
    set({
      queue,
      index,
      order,
      contextLabel: opts?.label || "GMAX",
      ...(multi ? { repeat: get().repeat === "off" ? "all" : get().repeat } : {}),
    });
    await start(track, true);
  },

  toggle: () => {
    const { isPlaying, current } = get();
    if (!current) return;
    if (isPlaying) enginePause();
    else void engineResume();
  },

  next: () => {
    if (advancing) return;
    const { queue, index, order, shuffle, repeat, current } = get();
    if (!queue.length) return;
    advancing = true;
    window.setTimeout(() => {
      advancing = false;
    }, 12000);
    const done = () => {
      advancing = false;
    };
    try {
      if (repeat === "one" && current) {
        void start(current, true).finally(done);
        return;
      }
      const seq = shuffle ? order : queue.map((_, i) => i);
      let pos = seq.indexOf(index);
      if (pos < 0) pos = 0;
      const nextPos = pos + 1;
      if (nextPos >= seq.length && repeat === "off") {
        enginePause();
        set({ isPlaying: false });
        done();
        return;
      }
      const nextIndex =
        nextPos >= seq.length ? (seq[0] ?? 0) : (seq[nextPos] ?? index);
      set({ index: nextIndex, error: null, isPlaying: true });
      const t = queue[nextIndex];
      if (t) {
        void start(t, true).finally(done);
      } else {
        enginePause();
        set({ isPlaying: false });
        done();
      }
    } catch {
      done();
    }
  },

  previous: () => {
    const { queue, index, order, shuffle, position } = get();
    if (position > 3) {
      engineSeek(0);
      set({ position: 0 });
      return;
    }
    const seq = shuffle ? order : queue.map((_, i) => i);
    const pos = seq.indexOf(index);
    const prevPos = Math.max(0, pos - 1);
    const prevIndex = seq[prevPos] ?? 0;
    set({ index: prevIndex });
    const t = queue[prevIndex];
    if (t) void start(t, true);
  },

  seek: (seconds) => {
    engineSeek(seconds);
    set({ position: seconds });
  },

  seekBy: (delta) => {
    const next = Math.max(0, get().position + delta);
    engineSeek(next);
    set({ position: next });
  },

  setVolume: (v) => {
    engineSetVolume(v);
    set({ volume: v });
  },

  toggleShuffle: () => {
    const { shuffle, queue, index } = get();
    const next = !shuffle;
    set({
      shuffle: next,
      order: next ? shuffleOrder(queue.length, index) : queue.map((_, i) => i),
    });
  },

  cycleRepeat: () => {
    const order: RepeatMode[] = ["off", "all", "one"];
    const i = order.indexOf(get().repeat);
    set({ repeat: order[(i + 1) % order.length] ?? "off" });
  },

  jumpTo: (trackId) => {
    const { queue } = get();
    const index = queue.findIndex((t) => t.id === trackId);
    if (index < 0) return;
    set({ index });
    const t = queue[index];
    if (t) void start(t, true);
  },

  removeFromQueue: (trackId) => {
    const queue = get().queue.filter((t) => t.id !== trackId);
    set({ queue, order: queue.map((_, i) => i) });
  },

  addToQueue: (tracks) => {
    const extra = Array.isArray(tracks) ? tracks : [tracks];
    const queue = [...get().queue];
    for (const t of extra) {
      if (!queue.some((q) => q.id === t.id)) queue.push(t);
    }
    set({ queue, order: get().shuffle ? shuffleOrder(queue.length, get().index) : queue.map((_, i) => i) });
  },

  retry: () => {
    const current = get().current;
    if (current) {
      consecutiveErrors = 0;
      const fresh = { ...current, streamUrl: undefined };
      void start(fresh, true);
    }
  },
}));
