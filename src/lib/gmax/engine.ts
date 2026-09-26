import type { Track } from "./types";
import { safeUrl, safeText } from "./text";

type EngineHandlers = {
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
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
let yt: YtPlayer | null = null;
let ytFailed = false;
let mode: "audio" | "youtube" = "audio";
let handlers: EngineHandlers | null = null;
let poll: number | null = null;
let volume = 1;
let navHandlers: { next?: () => void; prev?: () => void } = {};
let wakeLock: WakeLockSentinel | null = null;
let wantPlay = false;
let watchTimer: number | null = null;
let lastWatchPos = 0;
let stallTicks = 0;
let blobUrl: string | null = null;

const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_ENDED = 0;
const YT_BUFFERING = 3;

async function requestWakeLock() {
  try {
    if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch { /* ignore */ }
}

async function releaseWakeLock() {
  try { await wakeLock?.release(); } catch { /* ignore */ }
  wakeLock = null;
}

function revokeBlob() {
  if (blobUrl) {
    try { URL.revokeObjectURL(blobUrl); } catch { /* */ }
    blobUrl = null;
  }
}

function startPlayWatchdog() {
  if (typeof window === "undefined" || watchTimer != null) return;
  watchTimer = window.setInterval(() => {
    if (!wantPlay) { stallTicks = 0; return; }
    let pos = 0;
    let playing = false;
    if (mode === "audio" && audio) {
      pos = audio.currentTime;
      playing = !audio.paused;
    } else if (mode === "youtube" && yt) {
      try {
        pos = yt.getCurrentTime();
        playing = yt.getPlayerState() === YT_PLAYING;
      } catch { return; }
    }
    if (!playing || (pos > 0.5 && Math.abs(pos - lastWatchPos) < 0.15)) {
      stallTicks += 1;
      if (stallTicks >= 2) {
        stallTicks = 0;
        void engineResume();
        if (mode === "audio") scheduleNetRetry();
      }
    } else stallTicks = 0;
    lastWatchPos = pos;
  }, 2000);
}

function stopPlayWatchdog() {
  if (watchTimer != null) { clearInterval(watchTimer); watchTimer = null; }
  stallTicks = 0;
}

let netRetryTimer: number | null = null;
let netRetries = 0;

function scheduleNetRetry() {
  if (!wantPlay || mode !== "audio" || !audio) return;
  if (netRetryTimer != null) return;
  netRetryTimer = window.setTimeout(() => {
    netRetryTimer = null;
    if (!wantPlay || !audio) return;
    netRetries += 1;
    if (netRetries > 8) return;
    try {
      void audio.play().catch(() => { /* */ });
    } catch { /* */ }
  }, 400 + netRetries * 300);
}

function ensureAudio() {
  if (audio) return audio;

  // Prefer a real DOM node — some Android WebViews only keep background audio for attached elements
  const el = document.createElement("audio");
  el.id = "gmax-audio-el";
  el.setAttribute("playsinline", "true");
  el.setAttribute("webkit-playsinline", "true");
  el.setAttribute("preload", "auto");
  el.style.cssText = "position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;left:0;bottom:0;z-index:-1";
  // Do NOT set crossOrigin — breaks many CDNs
  document.body.appendChild(el);
  audio = el;

  audio.addEventListener("play", () => {
    netRetries = 0;
    handlers?.onPlay();
    void requestWakeLock();
    try { if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing"; } catch { /* */ }
  });
  audio.addEventListener("pause", () => {
    if (mode === "audio" && wantPlay) {
      scheduleNetRetry();
      return;
    }
    if (mode === "audio") handlers?.onPause();
    try { if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused"; } catch { /* */ }
  });
  audio.addEventListener("ended", () => {
    if (mode === "audio") handlers?.onEnded();
  });
  audio.addEventListener("timeupdate", () => {
    if (mode === "audio" && audio) {
      handlers?.onTime(audio.currentTime, audio.duration || 0);
      try {
        if ("mediaSession" in navigator && Number.isFinite(audio.duration) && audio.duration > 0) {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            position: Math.min(audio.currentTime, audio.duration),
            playbackRate: audio.playbackRate || 1,
          });
        }
      } catch { /* */ }
    }
  });
  audio.addEventListener("waiting", () => handlers?.onBuffer(true));
  audio.addEventListener("stalled", () => {
    handlers?.onBuffer(true);
    if (wantPlay) scheduleNetRetry();
  });
  audio.addEventListener("playing", () => {
    netRetries = 0;
    handlers?.onBuffer(false);
  });
  audio.addEventListener("error", () => {
    if (wantPlay && netRetries < 5) {
      scheduleNetRetry();
      return;
    }
    handlers?.onError("Couldn't play this track.");
  });
  return audio;
}

function stopPoll() {
  if (poll != null) { clearInterval(poll); poll = null; }
}

function startYtPoll() {
  stopPoll();
  poll = window.setInterval(() => {
    if (mode !== "youtube" || !yt) return;
    try {
      const t = yt.getCurrentTime();
      const d = yt.getDuration();
      handlers?.onTime(t, d || 0);
      if ("mediaSession" in navigator && d > 0) {
        try {
          navigator.mediaSession.setPositionState({ duration: d, position: t, playbackRate: 1 });
        } catch { /* */ }
      }
    } catch { /* */ }
  }, 400);
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
    navigator.mediaSession.playbackState = "playing";
    void requestWakeLock();
    navigator.mediaSession.setActionHandler("play", () => { void engineResume(); });
    navigator.mediaSession.setActionHandler("pause", () => { enginePause(); });
    navigator.mediaSession.setActionHandler("stop", () => { engineStop(); });
    navigator.mediaSession.setActionHandler("seekbackward", (d) => {
      const off = d.seekOffset ?? 10;
      if (mode === "audio" && audio) audio.currentTime = Math.max(0, audio.currentTime - off);
      else if (yt) try { yt.seekTo(Math.max(0, yt.getCurrentTime() - off), true); } catch { /* */ }
    });
    navigator.mediaSession.setActionHandler("seekforward", (d) => {
      const off = d.seekOffset ?? 10;
      if (mode === "audio" && audio) audio.currentTime = audio.currentTime + off;
      else if (yt) try { yt.seekTo(yt.getCurrentTime() + off, true); } catch { /* */ }
    });
    navigator.mediaSession.setActionHandler("seekto", (d) => {
      if (d.seekTime != null) engineSeek(d.seekTime);
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => navHandlers.next?.());
    navigator.mediaSession.setActionHandler("previoustrack", () => navHandlers.prev?.());
  } catch { /* ignore */ }
}

export function setMediaSessionNav(next: () => void, prev: () => void) {
  navHandlers = { next, prev };
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.setActionHandler("nexttrack", () => navHandlers.next?.());
    navigator.mediaSession.setActionHandler("previoustrack", () => navHandlers.prev?.());
  } catch { /* ignore */ }
}

function keepAliveInBackground() {
  if (typeof document === "undefined") return;

  const kick = () => {
    if (!wantPlay) return;
    startPlayWatchdog();
    void requestWakeLock();
    void engineResume();
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
    if (!wantPlay) return;
    if (mode === "audio" && audio && audio.paused) {
      void audio.play().catch(() => scheduleNetRetry());
    } else if (mode === "youtube" && yt) {
      try {
        const st = yt.getPlayerState();
        if (st === YT_PAUSED || st === YT_BUFFERING) yt.playVideo();
      } catch { /* */ }
    }
  }, 2500);
}

let inited = false;

export function initEngine(h: EngineHandlers) {
  handlers = h;
  if (typeof document !== "undefined") ensureAudio();
  if (!inited) {
    inited = true;
    keepAliveInBackground();
  }
}

async function ensureYtApi(): Promise<void> {
  if (ytFailed) return;
  if (typeof window === "undefined") return;
  if ((window as unknown as { YT?: { Player: unknown } }).YT?.Player) return;
  await new Promise<void>((resolve, reject) => {
    const prev = (window as unknown as { onYouTubeIframeAPIReady?: () => void }).onYouTubeIframeAPIReady;
    (window as unknown as { onYouTubeIframeAPIReady?: () => void }).onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.onerror = () => { ytFailed = true; reject(new Error("YT API")); };
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
    host.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;bottom:0";
    document.body.appendChild(host);
  }
  const YT = (window as unknown as { YT: { Player: new (el: string | HTMLElement, opts: object) => YtPlayer } }).YT;
  yt = await new Promise<YtPlayer>((resolve, reject) => {
    try {
      const player = new YT.Player(host!, {
        height: "1",
        width: "1",
        playerVars: { autoplay: 0, controls: 0, modestbranding: 1, rel: 0, playsinline: 1, enablejsapi: 1 },
        events: {
          onReady: () => resolve(player),
          onError: () => handlers?.onError("This video can't be played here."),
          onStateChange: (e: { data: number }) => {
            if (mode !== "youtube") return;
            if (e.data === YT_PLAYING) {
              handlers?.onPlay();
              handlers?.onBuffer(false);
              startYtPoll();
            } else if (e.data === YT_PAUSED) handlers?.onPause();
            else if (e.data === YT_ENDED) handlers?.onEnded();
            else if (e.data === YT_BUFFERING) handlers?.onBuffer(true);
          },
        },
      });
    } catch (err) { reject(err); }
  });
  try { yt.setVolume(Math.round(volume * 100)); } catch { /* */ }
  return yt;
}

/** Load URL — for /api/audio try blob first so playback is local (better background). */
async function resolvePlayableSrc(url: string): Promise<string> {
  if (!url.includes("/api/audio")) return url;
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 45000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return url;
    const blob = await res.blob();
    if (blob.size < 1000) return url;
    revokeBlob();
    blobUrl = URL.createObjectURL(blob);
    return blobUrl;
  } catch {
    return url;
  }
}

async function playViaAudio(track: Track, url: string): Promise<boolean> {
  mode = "audio";
  try { yt?.pauseVideo(); } catch { /* */ }
  const el = ensureAudio();
  handlers?.onBuffer(true);
  const playUrl = await resolvePlayableSrc(url);
  el.src = playUrl;
  el.volume = volume;
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

export async function enginePlay(track: Track) {
  wantPlay = true;
  netRetries = 0;
  startPlayWatchdog();
  stopPoll();
  handlers?.onBuffer(true);

  const stream = safeUrl(track.streamUrl || "");
  if (stream) {
    const ok = await playViaAudio(track, stream);
    if (ok) return;
  }

  // Avoid YouTube iframe when possible — bad for background.
  // Only use if we have videoId and no stream worked.
  if (track.videoId && !ytFailed && !stream) {
    mode = "youtube";
    try {
      if (audio) { audio.pause(); audio.removeAttribute("src"); }
      const player = await getYtPlayer();
      player.loadVideoById(track.videoId);
      player.playVideo();
      bindMediaSession(track);
      handlers?.onBuffer(false);
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

export function enginePause() {
  wantPlay = false;
  void releaseWakeLock();
  if (mode === "youtube") {
    try { yt?.pauseVideo(); } catch { /* */ }
  } else {
    audio?.pause();
  }
}

export async function engineResume() {
  wantPlay = true;
  startPlayWatchdog();
  void requestWakeLock();
  if (mode === "youtube") {
    try { yt?.playVideo(); } catch { /* */ }
    return;
  }
  if (!audio) return;
  try {
    await audio.play();
  } catch {
    scheduleNetRetry();
  }
}

export function engineSeek(seconds: number) {
  if (mode === "youtube") {
    try { yt?.seekTo(seconds, true); } catch { /* */ }
    return;
  }
  if (audio) audio.currentTime = Math.max(0, seconds);
}

export function engineSetVolume(v: number) {
  volume = Math.min(1, Math.max(0, v));
  if (audio) audio.volume = volume;
  try { yt?.setVolume(Math.round(volume * 100)); } catch { /* */ }
}

export function engineStop() {
  wantPlay = false;
  stopPlayWatchdog();
  stopPoll();
  void releaseWakeLock();
  audio?.pause();
  try { yt?.pauseVideo(); } catch { /* */ }
}

export async function engineEnterPictureInPicture(): Promise<boolean> {
  return false;
}
