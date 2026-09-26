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
import { resolveVideoId, resolveYouTubeStream } from "@/lib/gmax/search";
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

/** Resolve stream URL — YouTube videoId → /api/stream for real HTML5 audio. */
async function maybeResolve(track: Track, force = false): Promise<Track> {
  if (!force && track.streamUrl) return track;

  // YouTube: prefer direct audio stream (background playback)
  if (track.videoId && (force || !track.streamUrl)) {
    const token = ++resolveInflight;
    try {
      const stream = await resolveYouTubeStream(track.videoId);
      if (token !== resolveInflight) return track;
      if (stream?.streamUrl) {
        return {
          ...track,
          streamUrl: stream.streamUrl,
          duration: stream.duration || track.duration,
          albumImageUrl: stream.thumbnail || track.albumImageUrl,
        };
      }
    } catch {
      /* fall through — engine may use iframe */
    }
  }

  if (!track.title) return track;

  // Already have youtube videoId and we tried stream — keep for iframe fallback
  if (track.provider === "youtube" && track.videoId && !force) {
    return track;
  }

  const needStream = force || !track.streamUrl;
  if (!needStream && (track.videoId || track.previewUrl)) return track;

  const token = ++resolveInflight;
  try {
    const resolved = await resolveVideoId(track.title, track.artist?.name ?? "");
    if (token !== resolveInflight) return track;
    if (resolved?.streamUrl) {
      return {
        ...track,
        streamUrl: resolved.streamUrl,
        duration: resolved.duration || track.duration,
        videoId: track.videoId || resolved.videoId || undefined,
      };
    }
    if (resolved?.videoId && !track.videoId) {
      // Got videoId from resolve — try stream API once
      const stream = await resolveYouTubeStream(resolved.videoId);
      if (token !== resolveInflight) return track;
      if (stream?.streamUrl) {
        return {
          ...track,
          videoId: resolved.videoId,
          streamUrl: stream.streamUrl,
          duration: stream.duration || track.duration,
        };
      }
      return { ...track, videoId: resolved.videoId };
    }
  } catch {
    /* fall through */
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

  // Always try to get a real stream URL (YouTube included)
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
  if (!t || t.streamUrl) return;
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
    /* ignore prefetch errors */
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
        void start(t, !t.streamUrl).finally(done);
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
