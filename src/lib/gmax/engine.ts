import type { Track } from "./types";
import { canPlay } from "./normalize";
import { safeUrl, safeText } from "./text";

type EngineHandlers = {
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onTime: (position: number, duration: number) => void;
  onError: (message: string) => void;
  onNext?: () => void;
  onPrev?: () => void;
};

let audio: HTMLAudioElement | null = null;
let yt: YT.Player | null = null;
let ytReady = false;
let handlers: EngineHandlers | null = null;
let currentTrack: Track | null = null;
let wantPlay = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let watchTimer: ReturnType<typeof setInterval> | null = null;
let lastPos = 0;
let stallCount = 0;
let wakeLock: WakeLockSentinel | null = null;

declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio();
  audio.crossOrigin = "anonymous";
  audio.preload = "auto";
  audio.addEventListener("play", () => handlers?.onPlay());
  audio.addEventListener("pause", () => {
    if (!wantPlay) handlers?.onPause();
  });
  audio.addEventListener("ended", () => handlers?.onEnded());
  audio.addEventListener("timeupdate", () => {
    if (audio) handlers?.onTime(audio.currentTime, audio.duration || 0);
  });
  audio.addEventListener("error", () => {
    const code = audio?.error?.code;
    handlers?.onError(code ? `Audio error ${code}` : "Audio error");
  });
  return audio;
}

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator && !wakeLock) {
      wakeLock = await (navigator as Navigator & { wakeLock: { request: (t: string) => Promise<WakeLockSentinel> } }).wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
      });
    }
  } catch {
    /* ignore */
  }
}

async function releaseWakeLock() {
  try {
    await wakeLock?.release();
  } catch {
    /* ignore */
  }
  wakeLock = null;
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (watchTimer) {
    clearInterval(watchTimer);
    watchTimer = null;
  }
}

function startPoll() {
  stopPoll();
  pollTimer = setInterval(() => {
    if (yt && ytReady) {
      try {
        const t = yt.getCurrentTime();
        const d = yt.getDuration();
        handlers?.onTime(t, d || 0);
      } catch {
        /* ignore */
      }
    }
  }, 500);

  // Watchdog: resume if stalled mid-song while wantPlay
  watchTimer = setInterval(() => {
    if (!wantPlay) {
      stallCount = 0;
      return;
    }
    let pos = 0;
    let paused = false;
    if (audio && !audio.paused) {
      pos = audio.currentTime;
    } else if (audio && audio.paused && wantPlay) {
      paused = true;
      pos = audio.currentTime;
    } else if (yt && ytReady) {
      try {
        const st = yt.getPlayerState();
        pos = yt.getCurrentTime();
        paused = st === 2; // paused
      } catch {
        /* ignore */
      }
    }
    if (paused || (pos > 0 && Math.abs(pos - lastPos) < 0.15)) {
      stallCount += 1;
      if (stallCount >= 3) {
        stallCount = 0;
        void engineResume();
      }
    } else {
      stallCount = 0;
    }
    lastPos = pos;
  }, 2000);
}

function bindMediaSession(track: Track) {
  if (!("mediaSession" in navigator)) return;
  try {
    const artwork = track.artwork ? [{ src: track.artwork, sizes: "512x512", type: "image/jpeg" }] : [];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: safeText(track.title) || "Unknown",
      artist: safeText(track.artist) || "Unknown",
      album: safeText(track.album) || "",
      artwork,
    });
    navigator.mediaSession.setActionHandler("play", () => {
      void engineResume();
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      enginePause();
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      handlers?.onPrev?.();
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      handlers?.onNext?.();
    });
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime != null) engineSeek(details.seekTime);
    });
    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      const off = details.seekOffset ?? 10;
      engineSeek(Math.max(0, (audio?.currentTime ?? 0) - off));
    });
    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      const off = details.seekOffset ?? 10;
      engineSeek((audio?.currentTime ?? 0) + off);
    });
  } catch {
    /* some browsers ignore handlers */
  }
}

function keepAliveInBackground() {
  // Periodic tiny work + resume if browser suspended media
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && wantPlay) {
      void engineResume();
      void requestWakeLock();
    }
  });
}

let keepAliveBound = false;

export function engineInit(h: EngineHandlers) {
  handlers = h;
  ensureAudio();
  if (!keepAliveBound) {
    keepAliveBound = true;
    keepAliveInBackground();
  }
}

export async function engineLoad(track: Track, autoplay = true) {
  currentTrack = track;
  wantPlay = autoplay;
  stallCount = 0;
  lastPos = 0;
  bindMediaSession(track);
  stopPoll();

  if (track.source === "youtube" && track.youtubeId) {
    await loadYt(track.youtubeId, autoplay);
    return;
  }

  // HTMLAudio path
  if (yt) {
    try {
      yt.stopVideo();
    } catch {
      /* ignore */
    }
  }
  const a = ensureAudio();
  const url = safeUrl(track.streamUrl || track.previewUrl || "");
  if (!url || !canPlay(track)) {
    handlers?.onError("No playable stream");
    return;
  }
  a.src = url;
  a.load();
  startPoll();
  if (autoplay) {
    try {
      await a.play();
      void requestWakeLock();
      handlers?.onPlay();
    } catch (e) {
      handlers?.onError(String(e));
    }
  }
}

async function loadYt(id: string, autoplay: boolean) {
  await ensureYtApi();
  const el = document.getElementById("gmax-yt");
  if (!el) {
    const div = document.createElement("div");
    div.id = "gmax-yt";
    div.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px";
    document.body.appendChild(div);
  }
  return new Promise<void>((resolve) => {
    const onReady = (event: YT.PlayerEvent) => {
      yt = event.target;
      ytReady = true;
      startPoll();
      if (autoplay) {
        try {
          yt.playVideo();
          void requestWakeLock();
          handlers?.onPlay();
        } catch {
          /* ignore */
        }
      }
      resolve();
    };
    if (yt) {
      try {
        yt.loadVideoById(id);
        if (autoplay) yt.playVideo();
        startPoll();
        resolve();
        return;
      } catch {
        /* recreate */
      }
    }
    // @ts-expect-error YT global
    yt = new window.YT.Player("gmax-yt", {
      height: "1",
      width: "1",
      videoId: id,
      playerVars: {
        autoplay: autoplay ? 1 : 0,
        controls: 0,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
      },
      events: {
        onReady,
        onStateChange: (e: YT.OnStateChangeEvent) => {
          if (e.data === 0) handlers?.onEnded();
          if (e.data === 1) handlers?.onPlay();
          if (e.data === 2 && !wantPlay) handlers?.onPause();
        },
        onError: () => handlers?.onError("YouTube error"),
      },
    });
  });
}

function ensureYtApi(): Promise<void> {
  if (window.YT && window.YT.Player) return Promise.resolve();
  return new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  });
}

export async function engineResume() {
  wantPlay = true;
  void requestWakeLock();
  if (audio && audio.src) {
    try {
      await audio.play();
      handlers?.onPlay();
    } catch {
      /* ignore */
    }
    return;
  }
  if (yt && ytReady) {
    try {
      yt.playVideo();
      handlers?.onPlay();
    } catch {
      /* ignore */
    }
  }
}

export function enginePause() {
  wantPlay = false;
  void releaseWakeLock();
  audio?.pause();
  try {
    yt?.pauseVideo();
  } catch {
    /* ignore */
  }
  handlers?.onPause();
}

export function engineSeek(seconds: number) {
  if (audio && audio.src) {
    audio.currentTime = seconds;
    return;
  }
  if (yt && ytReady) {
    try {
      yt.seekTo(seconds, true);
    } catch {
      /* ignore */
    }
  }
}

export function engineSetVolume(volume: number) {
  if (audio) audio.volume = volume;
  try {
    yt?.setVolume(Math.round(volume * 100));
  } catch {
    /* ignore */
  }
}

export function engineStop() {
  wantPlay = false;
  stopPoll();
  void releaseWakeLock();
  audio?.pause();
  try {
    yt?.pauseVideo();
  } catch {
    /* ignore */
  }
}
