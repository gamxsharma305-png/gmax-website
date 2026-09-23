import { useCallback, useRef, useState } from "react";
import { Pause, Play, X } from "lucide-react";
import { trackTitle } from "@/lib/gmax/normalize";
import { usePlayer } from "@/store/player";
import { useUi } from "@/store/ui";
import { Artwork } from "./Artwork";

const SIZE = 64;

export function FloatBall() {
  const current = usePlayer((s) => s.current);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const isLoading = usePlayer((s) => s.isLoading);
  const toggle = usePlayer((s) => s.toggle);
  const openNowPlaying = useUi((s) => s.openNowPlaying);
  const exitFloatBall = useUi((s) => s.exitFloatBall);

  const [pos, setPos] = useState({ x: 16, y: 120 });
  const drag = useRef<{ ox: number; oy: number; sx: number; sy: number; moved: boolean } | null>(
    null,
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = {
        ox: e.clientX,
        oy: e.clientY,
        sx: pos.x,
        sy: pos.y,
        moved: false,
      };
    },
    [pos.x, pos.y],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.ox;
    const dy = e.clientY - d.oy;
    if (Math.abs(dx) + Math.abs(dy) > 6) d.moved = true;
    const parent = (e.currentTarget as HTMLElement).offsetParent as HTMLElement | null;
    const maxX = (parent?.clientWidth || window.innerWidth) - SIZE - 8;
    const maxY = (parent?.clientHeight || window.innerHeight) - SIZE - 8;
    setPos({
      x: Math.max(8, Math.min(maxX, d.sx + dx)),
      y: Math.max(8, Math.min(maxY, d.sy + dy)),
    });
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (d && !d.moved) {
        // Tap → open full now playing
        openNowPlaying();
      }
    },
    [openNowPlaying],
  );

  if (!current) return null;

  const title = trackTitle(current);

  return (
    <div
      className="absolute z-[60] touch-none select-none"
      style={{ left: pos.x, top: pos.y, width: SIZE, height: SIZE }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className={`relative size-full overflow-hidden rounded-full border-2 border-fg/30 bg-raised shadow-[0_8px_28px_rgb(0_0_0/0.55)] ${
          isPlaying ? "ring-2 ring-accent/50" : ""
        }`}
        title={title}
      >
        <Artwork src={current.albumImageUrl} title={title} className="size-full" />
        <div className="pointer-events-none absolute inset-0 bg-black/25" />
        <button
          type="button"
          className="absolute inset-0 grid place-items-center text-fg"
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isLoading ? (
            <span className="size-4 animate-pulse rounded-full bg-fg/50" />
          ) : isPlaying ? (
            <Pause size={22} fill="currentColor" />
          ) : (
            <Play size={22} fill="currentColor" className="ml-0.5" />
          )}
        </button>
        <button
          type="button"
          className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-bg text-muted shadow"
          onClick={(e) => {
            e.stopPropagation();
            exitFloatBall();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Close float"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
