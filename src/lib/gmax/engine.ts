import type { Track } from "./types";
import { safeUrl, safeText } from "./text";

type EngineHandlers = {
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onNearEnd?: () => void;
  onTime: (position: number, duration: number) => void;
  onError: (message: string) => void;
  onBuffer: (busy: boolean) => void;
};

type YtPlayer = {
  loadVideoById: (id: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  setVolume: (v: number) => void;
  destroy: () => void;
};

let audio: HTMLAudioElement | null = null;
let audioNext: HTMLAudioElement | null = null;
let yt: YtPlayer | null = null;
let ytFailed = false;
let mode: "audio" | "youtube" = "audio";
let handlers: EngineHandlers | null = null;
let poll: number | null = null;
let volume = 1;
let navHandlers: { next?: () => void; prev?: () => void } = {};
let wakeLock: WakeLockSentinel | null = null;

/** True while we intend to play (not user-paused). */
let wantPlay = false;
/** True after user/OS media-session pause — blocks all auto-resume. */
let userPaused = false;

let watchTimer: number | null = null;
let lastWatchPos = 0;
let stallTicks = 0;
let completionFired = false;
let nearEndFired = false;
let warmedUrl: string | null = null;

const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_ENDED = 0;
const YT_BUFFERING = 3;

async function requestWakeLock() {
  try {
    if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
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

function setSessionState(state: "playing" | "paused" | "none") {
  try {
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = state;
  } catch {
    /* */
  }
}

function fireEndedOnce() {
  if (completionFired || userPaused) return;
  completionFired = true;
  handlers?.onEnded();
}

function maybeNearEnd(pos: number, dur: number) {
  if (nearEndFired || userPaused || !Number.isFinite(dur) || dur < 20) return;
  if (dur - pos <= 12 && pos > 5) {
    nearEndFired = true;
    handlers?.onNearEnd?.();
  }
}

/** Only auto-resume when we still want playback and user did not pause. */
function shouldAutoResume(): boolean {
  return wantPlay && !userPaused && !completionFired;
}

function startPlayWatchdog() {
  if (typeof window === "undefined" || watchTimer != null) return;
  watchTimer = window.setInterval(() => {
    if (!shouldAutoResume()) {
      stallTicks = 0;
      return;
    }
    let pos = 0;
    let dur = 0;
    let playing = false;
    if (mode === "audio" && audio) {
      pos = audio.currentTime;
      dur = audio.duration || 0;
      playing = !audio.paused;
      if (Number.isFinite(dur) && dur > 0 && pos >= dur - 0.35 && !completionFired) {
        fireEndedOnce();
        return;
      }
      maybeNearEnd(pos, dur);
    } else if (mode === "youtube" && yt) {
      try {
        pos = yt.getCurrentTime();
        dur = yt.getDuration();
        const st = yt.getPlayerState();
        playing = st === YT_PLAYING;
        if (st === YT_ENDED || (dur > 0 && pos >= dur - 0.5)) {
          fireEndedOnce();
          return;
        }
        maybeNearEnd(pos, dur);
      } catch {
        return;
      }
    }
    // Stall recovery only — never override an intentional pause
    if (!playing || (pos > 0.5 && Math.abs(pos - lastWatchPos) < 0.12)) {
      stallTicks += 1;
      if (stallTicks >= 4) {
        stallTicks = 0;
        if (shouldAutoResume()) {
          void softResume();
          if (mode === "audio") scheduleNetRetry();
        }
      }
    } else stallTicks = 0;
    lastWatchPos = pos;
  }, 1500);
}

function stopPlayWatchdog() {
  if (watchTimer != null) {
    clearInterval(watchTimer);
    watchTimer = null;
  }
  stallTicks = 0;
}

let netRetryTimer: number | null = null;
let netRetries = 0;

function scheduleNetRetry() {
  if (!shouldAutoResume() || mode !== "audio" || !audio) return;
  if (netRetryTimer != null) return;
  netRetryTimer = window.setTimeout(() => {
    netRetryTimer = null;
    if (!shouldAutoResume() || !audio) return;
    netRetries += 1;
    if (netRetries > 10) return;
    try {
      void audio.play().catch(() => {
        /* */
      });
    } catch {
      /* */
    }
  }, 350 + netRetries * 250);
}

function ensureAudio() {
  if (audio) return audio;

  const el = document.createElement("audio");
  el.id = "gmax-audio-el";
  el.setAttribute("playsinline", "true");
  el.setAttribute("webkit-playsinline", "true");
  el.setAttribute("preload", "auto");
  el.style.cssText =
    "position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;left:0;bottom:0;z-index:-1";
  document.body.appendChild(el);
  audio = el;

  audio.addEventListener("play", () => {
    netRetries = 0;
    userPaused = false;
    wantPlay = true;
    handlers?.onPlay();
    void requestWakeLock();
    setSessionState("playing");
  });

  audio.addEventListener("pause", () => {
    // If user paused via notification / UI — stay paused
    if (userPaused || !wantPlay) {
      handlers?.onPause();
      setSessionState("paused");
      return;
    }
    // Unexpected pause while we still want play (buffer / OS blip)
    if (mode === "audio" && !completionFired) {
      scheduleNetRetry();
      return;
    }
    handlers?.onPause();
    setSessionState("paused");
  });

  audio.addEventListener("ended", () => {
    if (mode === "audio") fireEndedOnce();
  });

  audio.addEventListener("timeupdate", () => {
    if (mode === "audio" && audio) {
      const pos = audio.currentTime;
      const dur = audio.duration || 0;
      handlers?.onTime(pos, dur);
      maybeNearEnd(pos, dur);
      try {
        if ("mediaSession" in navigator && Number.isFinite(dur) && dur > 0) {
          navigator.mediaSession.setPositionState({
            duration: dur,
            position: Math.min(pos, dur),
            playbackRate: audio.playbackRate || 1,
          });
        }
      } catch {
        /* */
      }
    }
  });

  audio.addEventListener("waiting", () => handlers?.onBuffer(true));
  audio.addEventListener("stalled", () => {
    handlers?.onBuffer(true);
    if (shouldAutoResume()) scheduleNetRetry();
  });
  audio.addEventListener("playing", () => {
    netRetries = 0;
    handlers?.onBuffer(false);
  });
  audio.addEventListener("error", () => {
    if (shouldAutoResume() && netRetries < 6) {
      scheduleNetRetry();
      return;
    }
    if (!completionFired) handlers?.onError("Couldn't play this track.");
  });
  return audio;
}

function ensureAudioNext() {
  if (audioNext) return audioNext;
  const el = document.createElement("audio");
  el.id = "gmax-audio-next";
  el.setAttribute("playsinline", "true");
  el.setAttribute("preload", "auto");
  el.style.cssText =
    "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;bottom:0;z-index:-1";
  document.body.appendChild(el);
  audioNext = el;
  return el;
}

export function engineWarmNext(url: string) {
  const u = safeUrl(url);
  if (!u || u.includes("/api/audio")) return;
  if (warmedUrl === u) return;
  warmedUrl = u;
  try {
    const el = ensureAudioNext();
    el.preload = "auto";
    el.src = u;
    el.load();
  } catch {
    /* */
  }
}

function stopPoll() {
  if (poll != null) {
    clearInterval(poll);
    poll = null;
  }
}

function startYtPoll() {
  stopPoll();
  poll = window.setInterval(() => {
    if (mode !== "youtube" || !yt) return;
    try {
      const t = yt.getCurrentTime();
      const d = yt.getDuration();
      handlers?.onTime(t, d || 0);
      maybeNearEnd(t, d || 0);
      const st = yt.getPlayerState();
      if (st === YT_ENDED || (d > 0 && t >= d - 0.45)) {
        fireEndedOnce();
        return;
      }
      if ("mediaSession" in navigator && d > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration: d,
            position: t,
            playbackRate: 1,
          });
        } catch {
          /* */
        }
      }
    } catch {
      /* */
    }
  }, 400);
}

function wireMediaSessionActions() {
  if (!("mediaSession" in navigator)) return;
  try {
    // Play — notification ▶
    navigator.mediaSession.setActionHandler("play", () => {
      userPaused = false;
      wantPlay = true;
      void softResume();
      setSessionState("playing");
    });
    // Pause — notification ❚❚  (MUST stay paused)
    navigator.mediaSession.setActionHandler("pause", () => {
      userPaused = true;
      wantPlay = false;
      hardPause();
      handlers?.onPause();
      setSessionState("paused");
    });
    // Stop / dismiss (X on some OEMs)
    navigator.mediaSession.setActionHandler("stop", () => {
      userPaused = true;
      wantPlay = false;
      engineStop();
      handlers?.onPause();
      setSessionState("none");
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      navHandlers.prev?.();
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      navHandlers.next?.();
    });
    navigator.mediaSession.setActionHandler("seekbackward", (d) => {
      const off = d.seekOffset ?? 10;
      if (mode === "audio" && audio) audio.currentTime = Math.max(0, audio.currentTime - off);
      else if (yt)
        try {
          yt.seekTo(Math.max(0, yt.getCurrentTime() - off), true);
        } catch {
          /* */
        }
    });
    navigator.mediaSession.setActionHandler("seekforward", (d) => {
      const off = d.seekOffset ?? 10;
      if (mode === "audio" && audio) audio.currentTime = audio.currentTime + off;
      else if (yt)
        try {
          yt.seekTo(yt.getCurrentTime() + off, true);
        } catch {
          /* */
        }
    });
    navigator.mediaSession.setActionHandler("seekto", (d) => {
      if (d.seekTime != null) engineSeek(d.seekTime);
    });
  } catch {
    /* ignore */
  }
}

function bindMediaSession(track: Track) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: safeText(track.title) || "Unknown",
      artist: safeText(track.artist?.name) || "GMAX",
      album: safeText(track.album) || "GMAX",
      artwork: track.albumImageUrl
        ? [
            { src: track.albumImageUrl, sizes: "96x96", type: "image/jpeg" },
            { src: track.albumImageUrl, sizes: "256x256", type: "image/jpeg" },
            { src: track.albumImageUrl, sizes: "512x512", type: "image/jpeg" },
          ]
        : [],
    });
    setSessionState("playing");
    void requestWakeLock();
    wireMediaSessionActions();
  } catch {
    /* ignore */
  }
}

export function setMediaSessionNav(next: () => void, prev: () => void) {
  navHandlers = { next, prev };
  wireMediaSessionActions();
}

function hardPause() {
  void releaseWakeLock();
  if (mode === "youtube") {
    try {
      yt?.pauseVideo();
    } catch {
      /* */
    }
  } else {
    audio?.pause();
  }
}

async function softResume() {
  if (userPaused) return;
  wantPlay = true;
  startPlayWatchdog();
  void requestWakeLock();
  if (mode === "youtube") {
    try {
      yt?.playVideo();
    } catch {
      /* */
    }
    return;
  }
  if (!audio) return;
  try {
    await audio.play();
  } catch {
    scheduleNetRetry();
  }
}

function keepAliveInBackground() {
  if (typeof document === "undefined") return;

  const kick = () => {
    if (!shouldAutoResume()) return;
    startPlayWatchdog();
    void requestWakeLock();
    void softResume();
  };

  document.addEventListener("visibilitychange", kick);
  window.addEventListener("pageshow", kick);
  window.addEventListener("focus", kick);
  window.addEventListener("online", () => {
    netRetries = 0;
    kick();
  });
  document.addEventListener("resume", kick);

  window.setInterval(() => {
    if (!shouldAutoResume()) return;
    if (mode === "audio" && audio && audio.paused) {
      void audio.play().catch(() => scheduleNetRetry());
    } else if (mode === "youtube" && yt) {
      try {
        const st = yt.getPlayerState();
        if (st === YT_PAUSED || st === YT_BUFFERING) yt.playVideo();
        if (st === YT_ENDED) fireEndedOnce();
      } catch {
        /* */
      }
    }
  }, 2000);
}

let inited = false;

export function initEngine(h: EngineHandlers) {
  handlers = h;
  if (typeof document !== "undefined") ensureAudio();
  if (!inited) {
    inited = true;
    keepAliveInBackground();
    wireMediaSessionActions();
  }
}

async function ensureYtApi(): Promise<void> {
  if (ytFailed) return;
  if (typeof window === "undefined") return;
  if ((window as unknown as { YT?: { Player: unknown } }).YT?.Player) return;
  await new Promise<void>((resolve, reject) => {
    const prev = (window as unknown as { onYouTubeIframeAPIReady?: () => void })
      .onYouTubeIframeAPIReady;
    (window as unknown as { onYouTubeIframeAPIReady?: () => void }).onYouTubeIframeAPIReady =
      () => {
        prev?.();
        resolve();
      };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.onerror = () => {
        ytFailed = true;
        reject(new Error("YT API"));
      };
      document.head.appendChild(s);
    }
    window.setTimeout(() => resolve(), 8000);
  });
}

async function getYtPlayer(): Promise<YtPlayer> {
  await ensureYtApi();
  if (yt) return yt;
  let host = document.getElementById("gmax-yt-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "gmax-yt-host";
    host.style.cssText =
      "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;bottom:0";
    document.body.appendChild(host);
  }
  const YT = (
    window as unknown as {
      YT: { Player: new (el: string | HTMLElement, opts: object) => YtPlayer };
    }
  ).YT;
  yt = await new Promise<YtPlayer>((resolve, reject) => {
    try {
      const player = new YT.Player(host!, {
        height: "1",
        width: "1",
        playerVars: {
          autoplay: 0,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          enablejsapi: 1,
        },
        events: {
          onReady: () => resolve(player),
          onError: (e: { data?: number }) => {
            const code = e?.data;
            const msg =
              code === 101 || code === 150
                ? "This YouTube video blocks embedding."
                : code === 100
                  ? "YouTube video not available."
                  : "This video can't be played here.";
            handlers?.onError(msg);
          },
          onStateChange: (e: { data: number }) => {
            if (mode !== "youtube") return;
            if (e.data === YT_PLAYING) {
              userPaused = false;
              handlers?.onPlay();
              handlers?.onBuffer(false);
              startYtPoll();
              setSessionState("playing");
            } else if (e.data === YT_PAUSED) {
              if (userPaused || !wantPlay) {
                handlers?.onPause();
                setSessionState("paused");
              } else if (shouldAutoResume()) {
                try {
                  yt?.playVideo();
                } catch {
                  /* */
                }
              } else {
                handlers?.onPause();
                setSessionState("paused");
              }
            } else if (e.data === YT_ENDED) fireEndedOnce();
            else if (e.data === YT_BUFFERING) handlers?.onBuffer(true);
          },
        },
      });
    } catch (err) {
      reject(err);
    }
  });
  try {
    yt.setVolume(Math.round(volume * 100));
  } catch {
    /* */
  }
  return yt;
}

async function playViaAudio(track: Track, url: string): Promise<boolean> {
  mode = "audio";
  try {
    yt?.pauseVideo();
  } catch {
    /* */
  }
  const el = ensureAudio();
  handlers?.onBuffer(true);
  el.src = url;
  el.volume = volume;
  try {
    await el.play();
    bindMediaSession(track);
    handlers?.onBuffer(false);
    return true;
  } catch {
    await new Promise((r) => setTimeout(r, 200));
    try {
      await el.play();
      bindMediaSession(track);
      handlers?.onBuffer(false);
      return true;
    } catch {
      handlers?.onBuffer(false);
      return false;
    }
  }
}

export async function enginePlay(track: Track) {
  userPaused = false;
  wantPlay = true;
  completionFired = false;
  nearEndFired = false;
  netRetries = 0;
  warmedUrl = null;
  startPlayWatchdog();
  stopPoll();
  handlers?.onBuffer(true);

  const stream = safeUrl(track.streamUrl || "");
  if (stream && !stream.includes("/api/audio")) {
    const ok = await playViaAudio(track, stream);
    if (ok) return;
  }

  if (track.videoId && !ytFailed) {
    mode = "youtube";
    try {
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
      }
      const player = await getYtPlayer();
      player.loadVideoById(track.videoId);
      player.playVideo();
      bindMediaSession(track);
      handlers?.onBuffer(false);
      startYtPoll();
      return;
    } catch {
      ytFailed = true;
    }
  }

  const preview = safeUrl(track.previewUrl || "");
  if (preview) {
    const ok = await playViaAudio(track, preview);
    if (ok) return;
  }

  handlers?.onBuffer(false);
  handlers?.onError("Couldn't find a playable source for this track.");
}

/** UI / notification pause — stays paused until user hits play. */
export function enginePause() {
  userPaused = true;
  wantPlay = false;
  hardPause();
  setSessionState("paused");
}

export async function engineResume() {
  userPaused = false;
  wantPlay = true;
  await softResume();
  setSessionState("playing");
}

export function engineSeek(seconds: number) {
  if (mode === "youtube") {
    try {
      yt?.seekTo(seconds, true);
    } catch {
      /* */
    }
    return;
  }
  if (audio) audio.currentTime = Math.max(0, seconds);
}

export function engineSetVolume(v: number) {
  volume = Math.min(1, Math.max(0, v));
  if (audio) audio.volume = volume;
  try {
    yt?.setVolume(Math.round(volume * 100));
  } catch {
    /* */
  }
}

export function engineStop() {
  userPaused = true;
  wantPlay = false;
  completionFired = true;
  stopPlayWatchdog();
  stopPoll();
  void releaseWakeLock();
  audio?.pause();
  try {
    yt?.pauseVideo();
  } catch {
    /* */
  }
  setSessionState("none");
}

export async function engineEnterPictureInPicture(): Promise<boolean> {
  return false;
}
