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

const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_ENDED = 0;
const YT_BUFFERING = 3;

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "auto";
  audio.addEventListener("play", () => handlers?.onPlay());
  audio.addEventListener("pause", () => {
    if (mode === "audio") handlers?.onPause();
  });
  audio.addEventListener("ended", () => {
    if (mode === "audio") handlers?.onEnded();
  });
  audio.addEventListener("timeupdate", () => {
    if (mode === "audio" && audio) {
      handlers?.onTime(audio.currentTime, audio.duration || 0);
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
  poll = window.setInterval(() => {
    if (mode !== "youtube" || !yt) return;
    try {
      handlers?.onTime(yt.getCurrentTime() || 0, yt.getDuration() || 0);
      const state = yt.getPlayerState();
      if (state === YT_ENDED) {
        stopPoll();
        handlers?.onEnded();
      } else if (state === YT_BUFFERING) {
        handlers?.onBuffer(true);
      } else if (state === YT_PLAYING) {
        handlers?.onBuffer(false);
        handlers?.onPlay();
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

async function ensureYt(): Promise<YtPlayer> {
  await loadYoutubeApi();
  if (yt) return yt;
  let host = document.getElementById("gmax-yt-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "gmax-yt-host";
    host.setAttribute("aria-hidden", "true");
    document.body.appendChild(host);
  }
  const w = window as unknown as {
    YT: { Player: new (el: string | HTMLElement, opts: unknown) => YtPlayer };
  };
  yt = await new Promise<YtPlayer>((resolve, reject) => {
    try {
      const player = new w.YT.Player(host!, {
        width: 1,
        height: 1,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: () => resolve(player),
          onError: () => handlers?.onError("This video can't be played here."),
          onStateChange: (e: { data: number }) => {
            if (mode !== "youtube") return;
            if (e.data === YT_PLAYING) {
              handlers?.onPlay();
              handlers?.onBuffer(false);
              startYtPoll();
            } else if (e.data === YT_PAUSED) {
              handlers?.onPause();
            } else if (e.data === YT_ENDED) {
              handlers?.onEnded();
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

export function initEngine(next: EngineHandlers) {
  handlers = next;
  ensureAudio();
}

export async function enginePlay(track: Track) {
  if (!canPlay(track) && !safeText(track.videoId) && !safeUrl(track.previewUrl)) {
    handlers?.onError("This track has no playable source.");
    return;
  }
  handlers?.onBuffer(true);
  const videoId = safeText(track.videoId);
  const preview = safeUrl(track.previewUrl);

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
      startYtPoll();
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
    } catch {
      handlers?.onError("Tap play to start audio.");
    }
    return;
  }

  handlers?.onBuffer(false);
  handlers?.onError("Couldn't find a playable source for this track.");
}

export function enginePause() {
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
  stopPoll();
  audio?.pause();
  try {
    yt?.pauseVideo();
  } catch {
    /* ignore */
  }
}
