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
  getIframe?: () => HTMLIFrameElement;
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
let pipWindow: Window | null = null;
let wantPlay = false;
let bgKickTimer: number | null = null;
let ytEndedSent = false;

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
    /* unsupported / denied */
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

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "auto";
  audio.crossOrigin = "anonymous";
  audio.setAttribute("playsinline", "true");
  audio.setAttribute("webkit-playsinline", "true");
  audio.addEventListener("play", () => {
    handlers?.onPlay();
    try {
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
    } catch {
      /* ignore */
    }
  });
  audio.addEventListener("pause", () => {
    if (mode === "audio") handlers?.onPause();
    try {
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    } catch {
      /* ignore */
    }
  });
  audio.addEventListener("ended", () => {
    if (mode === "audio") {
      wantPlay = true;
      handlers?.onEnded();
    }
  });
  audio.addEventListener("timeupdate", () => {
    if (mode === "audio" && audio) {
      handlers?.onTime(audio.currentTime, audio.duration || 0);
      try {
        if ("mediaSession" in navigator && Number.isFinite(audio.duration) && audio.duration > 0) {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate || 1,
            position: Math.min(audio.currentTime, audio.duration),
          });
        }
      } catch {
        /* ignore */
      }
    }
  });
  audio.addEventListener("waiting", () => handlers?.onBuffer(true));
  audio.addEventListener("playing", () => handlers?.onBuffer(false));
  audio.addEventListener("error", () => {
    if (mode === "audio") handlers?.onError("Couldn't play this track.");
  });
  audio.volume = volume;
  return audio;
}

function stopPoll() {
  if (poll != null) {
    window.clearInterval(poll);
    poll = null;
  }
}

function startYtPoll() {
  stopPoll();
  ytEndedSent = false;
  poll = window.setInterval(() => {
    if (mode !== "youtube" || !yt) return;
    try {
      const t = yt.getCurrentTime() || 0;
      const d = yt.getDuration() || 0;
      handlers?.onTime(t, d);
      const state = yt.getPlayerState();
      const nearEnd = d > 3 && t >= d - 0.75;
      if ((state === YT_ENDED || nearEnd) && !ytEndedSent) {
        ytEndedSent = true;
        stopPoll();
        wantPlay = true;
        handlers?.onEnded();
      } else if (state === YT_BUFFERING) {
        handlers?.onBuffer(true);
      } else if (state === YT_PLAYING) {
        handlers?.onBuffer(false);
        handlers?.onPlay();
        ytEndedSent = false;
      }
    } catch {
      /* player tearing down */
    }
  }, 250);
}

function loadYoutubeApi(): Promise<void> {
  if (ytReady) return Promise.resolve();
  if (ytFailed) return Promise.reject(new Error("YouTube unavailable"));
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));

  return new Promise((resolve, reject) => {
    const w = window as unknown as {
      YT?: { Player: new (el: string | HTMLElement, opts: unknown) => YtPlayer };
      onYouTubeIframeAPIReady?: () => void;
    };
    const done = () => {
      ytReady = true;
      resolve();
    };
    if (w.YT?.Player) {
      done();
      return;
    }
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      done();
    };
    if (!document.getElementById("gmax-yt-api")) {
      const s = document.createElement("script");
      s.id = "gmax-yt-api";
      s.src = "https://www.youtube.com/iframe_api";
      s.onerror = () => {
        ytFailed = true;
        reject(new Error("YouTube unavailable"));
      };
      document.head.appendChild(s);
    }
    window.setTimeout(() => {
      if (!ytReady) {
        ytFailed = true;
        reject(new Error("YouTube unavailable"));
      }
    }, 8000);
  });
}

function enableYtPictureInPicture(player: YtPlayer) {
  try {
    const iframe = player.getIframe?.() || document.querySelector("#gmax-yt-host iframe");
    if (!iframe || !(iframe instanceof HTMLIFrameElement)) return;
    iframe.setAttribute(
      "allow",
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
    );
    iframe.setAttribute("allowfullscreen", "true");
    (iframe as HTMLIFrameElement & { allowPictureInPicture?: boolean }).allowPictureInPicture = true;
  } catch {
    /* ignore */
  }
}

function styleYtHostForPip(host: HTMLElement, inPip: boolean) {
  if (inPip) {
    host.style.cssText =
      "position:relative;width:100%;height:100%;opacity:1;pointer-events:auto;z-index:1;overflow:hidden;border-radius:0;inset:auto;";
  } else {
    host.style.cssText =
      "position:fixed;width:160px;height:90px;right:8px;bottom:88px;opacity:0.15;pointer-events:none;z-index:40;overflow:hidden;border-radius:8px;";
  }
}

function returnYtHostToApp() {
  const host = document.getElementById("gmax-yt-host");
  if (!host) return;
  if (host.parentElement !== document.body) {
    document.body.appendChild(host);
  }
  styleYtHostForPip(host, false);
  pipWindow = null;
}

export async function engineEnterPictureInPicture(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (mode !== "youtube") return false;

  try {
    if (yt) enableYtPictureInPicture(yt);
    const host = document.getElementById("gmax-yt-host");
    if (!host) return false;

    const dpip = (window as unknown as {
      documentPictureInPicture?: {
        requestWindow: (opts?: { width?: number; height?: number }) => Promise<Window>;
      };
    }).documentPictureInPicture;

    if (dpip?.requestWindow) {
      try {
        pipWindow?.close();
      } catch {
        /* ignore */
      }
      const win = await dpip.requestWindow({ width: 360, height: 220 });
      pipWindow = win;
      const doc = win.document;
      doc.head.innerHTML = "";
      const style = doc.createElement("style");
      style.textContent =
        "html,body{margin:0;padding:0;width:100%;height:100%;background:#050707;overflow:hidden}" +
        "iframe{width:100%!important;height:100%!important;border:0}";
      doc.head.appendChild(style);
      doc.body.innerHTML = "";
      styleYtHostForPip(host, true);
      doc.body.appendChild(host);
      try {
        yt?.playVideo();
      } catch {
        /* ignore */
      }
      win.addEventListener("pagehide", () => {
        returnYtHostToApp();
        try {
          yt?.playVideo();
        } catch {
          /* ignore */
        }
      });
      return true;
    }

    const videos = document.querySelectorAll("video");
    for (const v of videos) {
      if (typeof v.requestPictureInPicture === "function" && document.pictureInPictureEnabled) {
        await v.requestPictureInPicture();
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

async function ensureYt(): Promise<YtPlayer> {
  await loadYoutubeApi();
  if (yt) return yt;
  let host = document.getElementById("gmax-yt-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "gmax-yt-host";
    host.setAttribute("aria-hidden", "true");
    host.style.cssText =
      "position:fixed;width:160px;height:90px;right:8px;bottom:88px;opacity:0.15;pointer-events:none;z-index:40;overflow:hidden;border-radius:8px;";
    document.body.appendChild(host);
  }
  const w = window as unknown as {
    YT: { Player: new (el: string | HTMLElement, opts: unknown) => YtPlayer };
  };
  yt = await new Promise<YtPlayer>((resolve, reject) => {
    try {
      const player = new w.YT.Player(host!, {
        width: 160,
        height: 90,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            enableYtPictureInPicture(player);
            resolve(player);
          },
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
            } else if (e.data === YT_PAUSED) {
              handlers?.onPause();
            } else if (e.data === YT_ENDED) {
              if (!ytEndedSent) {
                ytEndedSent = true;
                wantPlay = true;
                stopPoll();
                handlers?.onEnded();
              }
            } else if (e.data === YT_BUFFERING) {
              handlers?.onBuffer(true);
            }
          },
        },
      });
    } catch (err) {
      reject(err);
    }
  });
  yt.setVolume(Math.round(volume * 100));
  return yt;
}

function bindMediaSession(track: Track) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist?.name || "GMAX",
      album: track.album || "GMAX",
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
    navigator.mediaSession.setActionHandler("play", () => {
      void engineResume();
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      enginePause();
    });
    navigator.mediaSession.setActionHandler("stop", () => {
      engineStop();
    });
    navigator.mediaSession.setActionHandler("seekbackward", (d) => {
      const off = d.seekOffset ?? 10;
      if (mode === "audio" && audio) audio.currentTime = Math.max(0, audio.currentTime - off);
    });
    navigator.mediaSession.setActionHandler("seekforward", (d) => {
      const off = d.seekOffset ?? 10;
      if (mode === "audio" && audio)
        audio.currentTime = Math.min(audio.duration || 1e9, audio.currentTime + off);
    });
    navigator.mediaSession.setActionHandler("seekto", (d) => {
      if (d.seekTime != null) engineSeek(d.seekTime);
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => navHandlers.next?.());
    navigator.mediaSession.setActionHandler("previoustrack", () => navHandlers.prev?.());
  } catch {
    /* ignore */
  }
}

export function setMediaSessionNav(next: () => void, prev: () => void) {
  navHandlers = { next, prev };
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.setActionHandler("nexttrack", () => navHandlers.next?.());
    navigator.mediaSession.setActionHandler("previoustrack", () => navHandlers.prev?.());
  } catch {
    /* ignore */
  }
}

function kickPlayback() {
  if (!wantPlay) return;
  if (mode === "youtube" && yt) {
    try {
      yt.playVideo();
    } catch {
      /* ignore */
    }
  }
  if (mode === "audio" && audio) {
    void audio.play().catch(() => undefined);
  }
}

function keepAliveInBackground() {
  if (typeof document === "undefined") return;

  const onHide = () => {
    if (!wantPlay) return;
    kickPlayback();
    if (bgKickTimer != null) window.clearInterval(bgKickTimer);
    bgKickTimer = window.setInterval(() => {
      if (!wantPlay || !document.hidden) {
        if (bgKickTimer != null) {
          window.clearInterval(bgKickTimer);
          bgKickTimer = null;
        }
        return;
      }
      kickPlayback();
    }, 1500);
  };

  const onShow = () => {
    if (bgKickTimer != null) {
      window.clearInterval(bgKickTimer);
      bgKickTimer = null;
    }
    if (!wantPlay) return;
    kickPlayback();
    void requestWakeLock();
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) onHide();
    else onShow();
  });
  window.addEventListener("pageshow", onShow);
  window.addEventListener("focus", onShow);
}

export function initEngine(next: EngineHandlers) {
  handlers = next;
  ensureAudio();
  keepAliveInBackground();
}

export async function enginePlay(track: Track) {
  const videoId = safeText(track.videoId);
  const stream = safeUrl(track.streamUrl);
  const preview = safeUrl(track.previewUrl);

  if (!videoId && !stream && !preview) {
    handlers?.onError("This track has no playable source.");
    return;
  }
  handlers?.onBuffer(true);

  if (stream) {
    mode = "audio";
    stopPoll();
    try {
      yt?.pauseVideo();
    } catch {
      /* ignore */
    }
    const el = ensureAudio();
    try {
      el.pause();
    } catch {
      /* ignore */
    }
    el.crossOrigin = "anonymous";
    el.src = stream;
    el.load();
    el.volume = volume;
    try {
      await el.play();
      wantPlay = true;
      bindMediaSession(track);
      void requestWakeLock();
      if (typeof document !== "undefined" && document.hidden) {
        [200, 600, 1500].forEach((ms) => {
          window.setTimeout(() => {
            if (wantPlay && mode === "audio" && audio) {
              void audio.play().catch(() => undefined);
            }
          }, ms);
        });
      }
    } catch {
      wantPlay = true;
      [300, 900, 2000].forEach((ms) => {
        window.setTimeout(() => {
          if (wantPlay && mode === "audio" && audio) {
            void audio.play().catch(() => undefined);
          }
        }, ms);
      });
      handlers?.onPlay();
    }
    return;
  }

  if (videoId && !ytFailed) {
    try {
      const player = await ensureYt();
      mode = "youtube";
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
      }
      player.setVolume(Math.round(volume * 100));
      player.loadVideoById(videoId);
      player.playVideo();
      wantPlay = true;
      enableYtPictureInPicture(player);
      startYtPoll();
      bindMediaSession(track);
      void requestWakeLock();
      if (typeof document !== "undefined" && document.hidden) {
        [300, 800, 1600, 3000].forEach((ms) => {
          window.setTimeout(() => {
            if (wantPlay && mode === "youtube") {
              try {
                yt?.playVideo();
              } catch {
                /* ignore */
              }
            }
          }, ms);
        });
      }
      return;
    } catch {
      /* fall through to preview */
    }
  }

  if (preview) {
    mode = "audio";
    stopPoll();
    try {
      yt?.pauseVideo();
    } catch {
      /* ignore */
    }
    const el = ensureAudio();
    el.src = preview;
    el.volume = volume;
    try {
      await el.play();
      wantPlay = true;
      bindMediaSession(track);
    } catch {
      handlers?.onError("Couldn't play this track.");
    }
    return;
  }

  handlers?.onBuffer(false);
  handlers?.onError("Couldn't find a playable source for this track.");
}

export function enginePause() {
  wantPlay = false;
  void releaseWakeLock();
  if (mode === "youtube") {
    try {
      yt?.pauseVideo();
    } catch {
      /* ignore */
    }
  } else {
    audio?.pause();
  }
}

export async function engineResume() {
  wantPlay = true;
  if (mode === "youtube") {
    try {
      yt?.playVideo();
    } catch {
      /* ignore */
    }
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
    try {
      yt?.seekTo(seconds, true);
    } catch {
      /* ignore */
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
