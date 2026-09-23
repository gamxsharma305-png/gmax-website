import { useState } from "react";
import {
  ChevronDown,
  Heart,
  ListMusic,
  ListPlus,
  Pause,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  Shuffle,
  SkipBack,
  SkipForward,
  PictureInPicture2,
  X,
} from "lucide-react";
import { formatTime } from "@/lib/gmax/text";
import { engineEnterPictureInPicture } from "@/lib/gmax/engine";
import { trackArtist, trackTitle } from "@/lib/gmax/normalize";
import { useLibrary } from "@/store/library";
import { usePlayer } from "@/store/player";
import { useUi } from "@/store/ui";
import { Artwork } from "./Artwork";

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
  const seekBy = usePlayer((s) => s.seekBy);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const jumpTo = usePlayer((s) => s.jumpTo);
  const removeFromQueue = usePlayer((s) => s.removeFromQueue);
  const retry = usePlayer((s) => s.retry);
  const close = useUi((s) => s.closeOverlay);
  const enterFloatBall = useUi((s) => s.enterFloatBall);
  const setAddingTrack = useUi((s) => s.setAddingTrack);
  const liked = useLibrary((s) => (current ? s.liked.some((t) => t.id === current.id) : false));
  const toggleLike = useLibrary((s) => s.toggleLike);
  const [showQueue, setShowQueue] = useState(false);

  if (!current) return null;

  const title = trackTitle(current);
  const artist = trackArtist(current);
  const dur = duration > 0 ? duration : current.duration || 0;
  const pct = dur > 0 ? Math.min(100, Math.max(0, (position / dur) * 100)) : 0;
  const upcoming = queue.slice(index + 1);
  const isPreview = Boolean(current.previewUrl) && !current.videoId;

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

      <div className="relative flex h-full flex-col px-6 pb-[calc(16px+env(safe-area-inset-bottom))] pt-[calc(12px+env(safe-area-inset-top))]">
        <div className="mb-4 flex items-center justify-between">
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

        <div className="mx-auto mb-6 aspect-square w-full max-w-[340px] overflow-hidden rounded-md shadow-[0_24px_60px_rgb(0_0_0/0.55)]">
          <Artwork src={current.albumImageUrl} title={title} className="size-full text-5xl" />
        </div>

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-2xl font-semibold">{title}</p>
            <p className="mt-1 truncate text-[15px] text-muted">{artist}</p>
            {isPreview ? (
              <p className="mt-1 text-[11px] tracking-wide text-faint">PREVIEW</p>
            ) : null}
          </div>
          <button type="button" onClick={() => toggleLike(current)} className="grid size-11 place-items-center">
            <Heart size={26} fill={liked ? "currentColor" : "none"} className={liked ? "text-accent" : "text-fg"} />
          </button>
        </div>

        <div className="mb-2">
          <input
            type="range"
            min={0}
            max={dur || 0}
            step={0.25}
            value={Math.min(position, dur || 0)}
            onChange={(e) => seek(Number(e.target.value))}
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-fg/20 accent-fg"
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
            className="mb-3 rounded-sm border border-danger/50 bg-danger/15 px-3 py-2 text-left"
          >
            <p className="text-[13px] font-medium">{error}</p>
            <p className="text-[11px] text-muted">Tap to retry</p>
          </button>
        ) : null}

        <div className="mb-3 flex items-center justify-center gap-8">
          <button type="button" onClick={() => seekBy(-10)} className="flex items-center gap-1 text-muted">
            <RotateCcw size={20} />
            <span className="text-xs font-medium">10</span>
          </button>
          <button
            type="button"
            onClick={() => {
              // In-app floating ball (works on all sources)
              enterFloatBall();
              // Best-effort system / Document PiP for YouTube
              if (current.videoId || current.provider === "youtube") {
                void engineEnterPictureInPicture();
              }
            }}
            className="flex flex-col items-center gap-0.5 text-muted"
            aria-label="Picture in picture"
            title="Mini float player"
          >
            <PictureInPicture2 size={22} />
            <span className="text-[10px] font-medium">PiP</span>
          </button>
          <button type="button" onClick={() => seekBy(10)} className="flex items-center gap-1 text-muted">
            <RotateCw size={20} />
            <span className="text-xs font-medium">10</span>
          </button>
        </div>

        <div className="mb-5 flex items-center justify-between px-1">
          <button type="button" onClick={toggleShuffle} className={shuffle ? "text-accent" : "text-muted"}>
            <Shuffle size={22} />
          </button>
          <button type="button" onClick={previous}>
            <SkipBack size={30} fill="currentColor" />
          </button>
          <button
            type="button"
            onClick={toggle}
            className="grid size-16 place-items-center rounded-full bg-fg text-bg"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isLoading ? (
              <span className="size-5 animate-pulse rounded-full bg-bg/40" />
            ) : isPlaying ? (
              <Pause size={28} fill="currentColor" />
            ) : (
              <Play size={28} fill="currentColor" />
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

        <div className="mt-auto flex justify-end">
          <button
            type="button"
            onClick={() => setShowQueue((v) => !v)}
            className={showQueue ? "text-accent" : "text-muted"}
            aria-label="Queue"
          >
            <ListMusic size={22} />
          </button>
        </div>

        {showQueue ? (
          <div className="mt-3 max-h-36 overflow-y-auto rounded-md border border-line bg-glass p-3">
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
    </div>
  );
}
