import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  CloudDownload,
  Heart,
  ListMusic,
  ListPlus,
  Loader2,
  Mic2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Timer,
  X,
} from "lucide-react";
import { offlineSourceUrl } from "@/lib/gmax/offline";
import { formatTime } from "@/lib/gmax/text";
import { trackArtist, trackTitle } from "@/lib/gmax/normalize";
import { useLibrary } from "@/store/library";
import { useOffline } from "@/store/offline";
import { usePlayer } from "@/store/player";
import { useUi } from "@/store/ui";
import { Artwork } from "./Artwork";

const SLEEP_OPTIONS = [
  { label: "5 min", mins: 5 },
  { label: "15 min", mins: 15 },
  { label: "30 min", mins: 30 },
  { label: "45 min", mins: 45 },
  { label: "1 hour", mins: 60 },
] as const;

export function NowPlaying() {
  const current = usePlayer((s) => s.current);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const isLoading = usePlayer((s) => s.isLoading);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const error = usePlayer((s) => s.error);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const contextLabel = usePlayer((s) => s.contextLabel);
  const toggle = usePlayer((s) => s.toggle);
  const next = usePlayer((s) => s.next);
  const previous = usePlayer((s) => s.previous);
  const seek = usePlayer((s) => s.seek);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const jumpTo = usePlayer((s) => s.jumpTo);
  const removeFromQueue = usePlayer((s) => s.removeFromQueue);
  const retry = usePlayer((s) => s.retry);
  const close = useUi((s) => s.closeOverlay);
  const setAddingTrack = useUi((s) => s.setAddingTrack);
  const liked = useLibrary((s) => (current ? s.liked.some((t) => t.id === current.id) : false));
  const toggleLike = useLibrary((s) => s.toggleLike);

  const offlineHydrate = useOffline((s) => s.hydrate);
  const isSaved = useOffline((s) => (current ? s.isSaved(current.id) : false));
  const downloadingId = useOffline((s) => s.downloadingId);
  const dlProgress = useOffline((s) => s.progress);
  const download = useOffline((s) => s.download);
  const removeOffline = useOffline((s) => s.remove);

  const [showQueue, setShowQueue] = useState(false);
  const [showSleep, setShowSleep] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [sleepLeft, setSleepLeft] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void offlineHydrate();
  }, [offlineHydrate]);

  useEffect(() => {
    if (sleepLeft == null) return;
    if (sleepLeft <= 0) {
      const { isPlaying: playing } = usePlayer.getState();
      if (playing) usePlayer.getState().toggle();
      setSleepLeft(null);
      setToast("Sleep timer — paused");
      return;
    }
    const t = window.setTimeout(() => setSleepLeft((s) => (s == null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [sleepLeft]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  if (!current) return null;

  const title = trackTitle(current);
  const artist = trackArtist(current);
  const dur = duration > 0 ? duration : current.duration || 0;
  const pct = dur > 0 ? Math.min(100, Math.max(0, (position / dur) * 100)) : 0;
  const upcoming = queue.slice(index + 1);
  const isPreview = Boolean(current.previewUrl) && !current.videoId;
  const busyDl = downloadingId === current.id;
  const canOffline = Boolean(offlineSourceUrl(current) || current.title);

  async function onDownload() {
    if (!current) return;
    if (isSaved) {
      await removeOffline(current.id);
      setToast("Removed from offline");
      return;
    }
    if (!canOffline) {
      setToast("This track can’t be saved offline");
      return;
    }
    const ok = await download(current);
    const via = useOffline.getState().lastVia;
    const err = useOffline.getState().error;
    if (ok) {
      setToast(
        via === "saavn"
          ? "Saved offline (matched audio) ✓"
          : via === "youtube"
            ? "YouTube saved offline ✓"
            : "Saved offline ✓",
      );
    } else {
      setToast(err || "Download failed");
    }
  }

  function startSleep(mins: number) {
    setSleepLeft(mins * 60);
    setShowSleep(false);
    setToast(`Sleep timer: ${mins} min`);
  }

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-bg">
      <div
        className="pointer-events-none absolute inset-0 opacity-40 blur-3xl"
        style={{
          background: current.albumImageUrl
            ? `url(${current.albumImageUrl}) center/cover`
            : "linear-gradient(180deg,#1a2424,#050707)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-bg/70 to-bg" />

      <div className="relative flex h-full flex-col px-5 pb-[calc(12px+env(safe-area-inset-bottom))] pt-[calc(12px+env(safe-area-inset-top))]">
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={close} className="grid size-11 place-items-center" aria-label="Close">
            <ChevronDown size={28} />
          </button>
          <div className="text-center">
            <p className="text-[10px] font-medium tracking-[0.18em] text-muted">PLAYING FROM</p>
            <p className="max-w-[200px] truncate text-sm font-medium">{contextLabel || "GMAX"}</p>
          </div>
          <button
            type="button"
            className="grid size-11 place-items-center"
            onClick={() => setAddingTrack(current)}
            aria-label="Add to playlist"
          >
            <ListPlus size={22} />
          </button>
        </div>

        <div className="mx-auto mb-5 aspect-square w-full max-w-[320px] overflow-hidden rounded-2xl shadow-[0_24px_60px_rgb(0_0_0/0.55)]">
          <Artwork src={current.albumImageUrl} title={title} className="size-full text-5xl" />
        </div>

        <div className="mb-3 text-center">
          <p className="truncate font-display text-2xl font-semibold">{title}</p>
          <p className="mt-1 truncate text-[15px] text-muted">{artist}</p>
          {isPreview ? <p className="mt-1 text-[11px] tracking-wide text-faint">PREVIEW</p> : null}
          {isSaved ? (
            <p className="mt-1 text-[11px] font-medium text-accent">Available offline</p>
          ) : null}
        </div>

        <div className="mb-1">
          <input
            type="range"
            min={0}
            max={dur || 0}
            step={0.25}
            value={Math.min(position, dur || 0)}
            onChange={(e) => seek(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-fg/20 accent-fg"
            style={{
              background: `linear-gradient(to right, #f0f0f0 ${pct}%, rgb(255 255 255 / 0.2) ${pct}%)`,
            }}
            aria-label="Seek"
          />
          <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted">
            <span>{formatTime(position)}</span>
            <span>{formatTime(dur)}</span>
          </div>
        </div>

        {error ? (
          <button
            type="button"
            onClick={retry}
            className="mb-2 rounded-sm border border-danger/50 bg-danger/15 px-3 py-2 text-left"
          >
            <p className="text-[13px] font-medium">{error}</p>
            <p className="text-[11px] text-muted">Tap to retry</p>
          </button>
        ) : null}

        <div className="mb-4 mt-2 flex items-center justify-between px-1">
          <button type="button" onClick={toggleShuffle} className={shuffle ? "text-accent" : "text-muted"}>
            <Shuffle size={22} />
          </button>
          <button type="button" onClick={previous}>
            <SkipBack size={30} fill="currentColor" />
          </button>
          <button
            type="button"
            onClick={toggle}
            className="grid size-[64px] place-items-center rounded-full bg-fg text-bg"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isLoading ? (
              <span className="size-5 animate-pulse rounded-full bg-bg/40" />
            ) : isPlaying ? (
              <Pause size={28} fill="currentColor" />
            ) : (
              <Play size={28} fill="currentColor" className="ml-0.5" />
            )}
          </button>
          <button type="button" onClick={next}>
            <SkipForward size={30} fill="currentColor" />
          </button>
          <button
            type="button"
            onClick={cycleRepeat}
            className={repeat === "off" ? "text-muted" : "text-accent"}
          >
            {repeat === "one" ? <Repeat1 size={22} /> : <Repeat size={22} />}
          </button>
        </div>

        <div className="mt-auto">
          <div className="flex items-center justify-between rounded-full border border-line bg-raised/90 px-3 py-2.5 shadow-lg backdrop-blur-md">
            <button
              type="button"
              onClick={() => void onDownload()}
              className="grid size-10 place-items-center text-muted"
              aria-label={isSaved ? "Remove offline" : "Download offline"}
            >
              {busyDl ? (
                <Loader2 size={20} className="animate-spin text-accent" />
              ) : isSaved ? (
                <Check size={20} className="text-accent" />
              ) : (
                <CloudDownload size={20} />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowSleep((v) => !v);
                setShowQueue(false);
                setShowLyrics(false);
              }}
              className={`grid size-10 place-items-center ${
                sleepLeft != null ? "text-accent" : "text-muted"
              }`}
              aria-label="Sleep timer"
            >
              <Timer size={20} />
            </button>

            <button
              type="button"
              onClick={() => setAddingTrack(current)}
              className="grid size-10 place-items-center text-muted"
              aria-label="Add to playlist"
            >
              <ListPlus size={20} />
            </button>

            <button
              type="button"
              onClick={() => {
                setShowQueue((v) => !v);
                setShowSleep(false);
                setShowLyrics(false);
              }}
              className={`grid size-10 place-items-center ${
                showQueue ? "text-accent" : "text-muted"
              }`}
              aria-label="Queue"
            >
              <ListMusic size={20} />
            </button>

            <button
              type="button"
              onClick={() => {
                setShowLyrics((v) => !v);
                setShowQueue(false);
                setShowSleep(false);
              }}
              className={`grid size-10 place-items-center ${
                showLyrics ? "text-accent" : "text-muted"
              }`}
              aria-label="Lyrics"
            >
              <Mic2 size={20} />
            </button>

            <button
              type="button"
              onClick={() => toggleLike(current)}
              className="grid size-10 place-items-center"
              aria-label="Like"
            >
              <Heart
                size={20}
                fill={liked ? "currentColor" : "none"}
                className={liked ? "text-accent" : "text-muted"}
              />
            </button>
          </div>

          {busyDl ? (
            <p className="mt-2 text-center text-[11px] text-muted">
              Saving offline… {dlProgress}%
              {current.videoId ? " (YouTube → mirror if needed)" : ""}
            </p>
          ) : null}
          {sleepLeft != null ? (
            <p className="mt-2 text-center text-[11px] text-accent">
              Sleep in {Math.floor(sleepLeft / 60)}:{String(sleepLeft % 60).padStart(2, "0")}
            </p>
          ) : null}

          {showSleep ? (
            <div className="mt-3 rounded-2xl border border-line bg-glass p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Sleep timer</p>
                <button type="button" onClick={() => setShowSleep(false)}>
                  <X size={14} className="text-muted" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {SLEEP_OPTIONS.map((o) => (
                  <button
                    key={o.mins}
                    type="button"
                    onClick={() => startSleep(o.mins)}
                    className="rounded-full border border-line bg-raised px-3 py-1.5 text-xs font-medium"
                  >
                    {o.label}
                  </button>
                ))}
                {sleepLeft != null ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSleepLeft(null);
                      setToast("Sleep timer off");
                    }}
                    className="rounded-full border border-line px-3 py-1.5 text-xs text-muted"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {showLyrics ? (
            <div className="mt-3 max-h-40 overflow-y-auto rounded-2xl border border-line bg-glass p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Lyrics</p>
                <button type="button" onClick={() => setShowLyrics(false)}>
                  <X size={14} className="text-muted" />
                </button>
              </div>
              <p className="text-sm text-muted">
                Lyrics for <span className="text-fg">{title}</span> aren’t loaded yet.
              </p>
            </div>
          ) : null}

          {showQueue ? (
            <div className="mt-3 max-h-40 overflow-y-auto rounded-2xl border border-line bg-glass p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Up Next</p>
                <button type="button" onClick={() => setShowQueue(false)}>
                  <X size={14} className="text-muted" />
                </button>
              </div>
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted">Nothing queued.</p>
              ) : (
                upcoming.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 py-1.5">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => jumpTo(t.id)}>
                      <p className="truncate text-sm">{trackTitle(t)}</p>
                      <p className="truncate text-[11px] text-muted">{trackArtist(t)}</p>
                    </button>
                    <button type="button" onClick={() => removeFromQueue(t.id)} className="text-faint">
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>

        {toast ? (
          <div className="pointer-events-none absolute bottom-[88px] left-1/2 z-50 -translate-x-1/2 rounded-full bg-fg px-4 py-2 text-xs font-medium text-bg shadow-lg">
            {toast}
          </div>
        ) : null}
      </div>
    </div>
  );
}
