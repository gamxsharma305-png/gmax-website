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
    onPlay: () => usePlayer.setState({ isPlaying: true, isLoading: false, error: null }),
    onPause: () => usePlayer.setState({ isPlaying: false }),
    onEnded: () => usePlayer.getState().next(),
    onTime: (position, duration) => {
      const d = Number.isFinite(duration) && duration > 0 ? duration : usePlayer.getState().duration;
      usePlayer.setState({ position, duration: d });
    },
    onError: (message) =>
      usePlayer.setState({ error: message, isLoading: false, isPlaying: false }),
    onBuffer: (busy) => usePlayer.setState({ isLoading: busy }),
  });
  setMediaSessionNav(
    () => usePlayer.getState().next(),
    () => usePlayer.getState().previous(),
  );
}

async function maybeResolve(track: Track, force = false): Promise<Track> {
  if (!force && (track.streamUrl || track.videoId || track.previewUrl)) {
    return track;
  }
  if (!track.title) return track;

  const token = ++resolveInflight;
  try {
    const resolved = await resolveVideoId(track.title, track.artist?.name ?? "");
    if (token !== resolveInflight) return track;
    if (resolved?.streamUrl) {
      return {
        ...track,
        streamUrl: resolved.streamUrl,
        duration: resolved.duration || track.duration,
      };
    }
    if (resolved?.videoId) {
      return { ...track, videoId: resolved.videoId, streamUrl: undefined };
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

  const needsResolve =
    forceResolve || (!track.streamUrl && !track.videoId && !track.previewUrl);
  let resolved = needsResolve ? await maybeResolve(track, true) : await maybeResolve(track, false);

  if (!resolved.streamUrl && !resolved.videoId && !resolved.previewUrl) {
    resolved = await maybeResolve(track, true);
  }

  usePlayer.setState({ current: resolved });

  if (!canPlay(resolved) && !resolved.videoId && !resolved.streamUrl && !resolved.previewUrl) {
    usePlayer.setState({
      isLoading: false,
      error: "This track has no playable source.",
    });
    return;
  }

  await enginePlay(resolved);
  useLibrary.getState().recordPlay(resolved);
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
    const { queue, index, order, shuffle, repeat, current } = get();
    if (!queue.length) return;
    if (repeat === "one" && current) {
      void start(current, true);
      return;
    }
    const seq = shuffle ? order : queue.map((_, i) => i);
    const pos = seq.indexOf(index);
    const nextPos = pos + 1;
    if (nextPos >= seq.length) {
      const nextIndex = seq[0] ?? 0;
      set({ index: nextIndex });
      const t = queue[nextIndex];
      if (t) void start(t, true);
      else {
        enginePause();
        set({ isPlaying: false });
      }
      return;
    }
    const nextIndex = seq[nextPos] ?? index;
    set({ index: nextIndex });
    const t = queue[nextIndex];
    if (t) void start(t, true);
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
      const fresh = { ...current, streamUrl: undefined };
      void start(fresh, true);
    }
  },
}));
