import type { Track } from "./types";
import { canPlay } from "./normalize";
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
let ytReady = false;
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
    if (!playing || (pos > 0.5 && Math.abs(pos - lastWatchPos) < 0.2)) {
      stallTicks += 1;
      if (stallTicks >= 3) {
        stallTicks = 0;
        void engineResume();
      }
    } else stallTicks = 0;
    lastWatchPos = pos;
  }, 2000);
}

function stopPlayWatchdog() {
  if (watchTimer != null) { clearInterval(watchTimer); watchTimer = null; }
  stallTicks = 0;
}

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "auto";
  audio.crossOrigin = "anonymous";
  audio.setAttribute("playsinline", "true");
  audio.setAttribute("webkit-playsinline", "true");
  audio.addEventListener("play", () => {
    handlers?.onPlay();
    try { if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing"; } catch { /* */ }
  });
  audio.addEventListener("pause", () => {
    if (mode === "audio") handlers?.onPause();
    try { if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused"; } catch { /* */ }
  });
  audio.addEventListener("ended", () => { if (mode === "audio") handlers?.onEnded(); });
  audio.addEventListener("timeupdate", () => {
    if (mode === "audio" && audio) {
      handlers?.onTime(audio.currentTime, audio.duration || 0);
      try {
        if ("mediaSession" in navigator && Number.isFinite(audio.duration) && audio.duration > 0) {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            position: audio.currentTime,
            playbackRate: audio.playbackRate || 1,
          });
        }
      } catch { /* */ }
    }
  });
  audio.addEventListener("waiting", () => handlers?.onBuffer(true));
  audio.addEventListener("playing", () => handlers?.onBuffer(false));
  audio.addEventListener("error", () => handlers?.onError("Couldn't play this track."));
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
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (wantPlay) {
      startPlayWatchdog();
      void engineResume();
    }
  });
}

let inited = false;

export function initEngine(h: EngineHandlers) {
  handlers = h;
  ensureAudio();
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
          onReady: () => { ytReady = true; resolve(player); },
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

export async function enginePlay(track: Track) {
  wantPlay = true;
  startPlayWatchdog();
  stopPoll();
  handlers?.onBuffer(true);

  if (track.provider === "youtube" && track.videoId && !ytFailed) {
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

  mode = "audio";
  try { yt?.pauseVideo(); } catch { /* */ }
  const el = ensureAudio();
  const url = safeUrl(track.streamUrl || track.previewUrl || "");
  if (!url) {
    handlers?.onBuffer(false);
    handlers?.onError("Couldn't find a playable source for this track.");
    return;
  }
  el.src = url;
  el.volume = volume;
  try {
    await el.play();
    bindMediaSession(track);
    handlers?.onBuffer(false);
  } catch {
    handlers?.onBuffer(false);
    handlers?.onError("Couldn't play this track.");
  }
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
  if (mode === "youtube") {
    try { yt?.playVideo(); } catch { /* */ }
    return;
  }
  try {
    await audio?.play();
    void requestWakeLock();
  } catch {
    handlers?.onError("Tap play to resume.");
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
