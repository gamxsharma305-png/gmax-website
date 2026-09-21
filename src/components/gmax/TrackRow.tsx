import { MoreVertical } from "lucide-react";
import type { Track } from "@/lib/gmax/types";
import { trackArtist, trackTitle } from "@/lib/gmax/normalize";
import { Artwork } from "./Artwork";

export function TrackRow({
  track,
  onPress,
  onMore,
  isPlaying,
  isLoading,
}: {
  track: Track;
  onPress: (track: Track) => void;
  onMore?: (track: Track) => void;
  isPlaying?: boolean;
  isLoading?: boolean;
}) {
  const title = trackTitle(track);
  const artist = trackArtist(track);

  return (
    <button
      type="button"
      onClick={() => onPress(track)}
      className="flex w-full items-center gap-3 rounded-md px-1 py-2 text-left transition-colors hover:bg-glass"
    >
      <Artwork src={track.albumImageUrl} title={title} className="size-12 shrink-0 rounded-sm" />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[15px] font-medium ${isPlaying ? "text-accent" : "text-fg"}`}
        >
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-muted">{artist}</span>
      </span>
      {isLoading ? (
        <span className="size-5 shrink-0 animate-pulse rounded-full bg-lift" />
      ) : onMore ? (
        <span
          role="button"
          tabIndex={0}
          className="grid size-10 shrink-0 place-items-center rounded-full text-muted"
          onClick={(e) => {
            e.stopPropagation();
            onMore(track);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.stopPropagation();
              onMore(track);
            }
          }}
        >
          <MoreVertical size={18} />
        </span>
      ) : null}
    </button>
  );
}
