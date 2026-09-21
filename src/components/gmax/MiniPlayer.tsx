import { Pause, Play } from "lucide-react";
import { trackArtist, trackTitle } from "@/lib/gmax/normalize";
import { usePlayer } from "@/store/player";
import { useUi } from "@/store/ui";
import { Artwork } from "./Artwork";

export function MiniPlayer() {
  const current = usePlayer((s) => s.current);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const isLoading = usePlayer((s) => s.isLoading);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const toggle = usePlayer((s) => s.toggle);
  const open = useUi((s) => s.openNowPlaying);

  if (!current) return null;

  const pct =
    duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;
  const title = trackTitle(current);
  const artist = trackArtist(current);

  return (
    <div className="absolute inset-x-2 bottom-[72px] z-30 sm:bottom-[76px]">
      <button
        type="button"
        onClick={open}
        className="relative w-full overflow-hidden rounded-md border border-line bg-raised text-left shadow-[0_12px_32px_rgb(0_0_0/0.45)]"
      >
        <div className="flex items-center gap-2 p-2">
          <Artwork src={current.albumImageUrl} title={title} className="size-10 rounded-sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-fg">{title}</span>
            <span className="mt-0.5 block truncate text-[11px] text-muted">{artist}</span>
          </span>
          <span
            role="button"
            tabIndex={0}
            className="grid size-10 place-items-center text-fg"
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                toggle();
              }
            }}
          >
            {isLoading ? (
              <span className="size-4 animate-pulse rounded-full bg-fg/40" />
            ) : isPlaying ? (
              <Pause size={20} fill="currentColor" />
            ) : (
              <Play size={20} fill="currentColor" />
            )}
          </span>
        </div>
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-fg/15">
          <span className="block h-full bg-fg" style={{ width: `${pct}%` }} />
        </span>
      </button>
    </div>
  );
}
