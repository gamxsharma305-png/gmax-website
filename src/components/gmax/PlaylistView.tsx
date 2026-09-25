import { useRef, useState } from "react";
import { ChevronLeft, GripVertical, Play, Shuffle } from "lucide-react";
import { likedPlaylist, useLibrary } from "@/store/library";
import { usePlayer } from "@/store/player";
import { useUi } from "@/store/ui";
import { Artwork } from "./Artwork";
import { TrackRow } from "./TrackRow";

export function PlaylistView() {
  const playlistId = useUi((s) => s.playlistId);
  const close = useUi((s) => s.closeOverlay);
  const setAddingTrack = useUi((s) => s.setAddingTrack);
  const playlists = useLibrary((s) => s.playlists);
  const movePlaylistTrack = useLibrary((s) => s.movePlaylistTrack);
  const playTrack = usePlayer((s) => s.playTrack);
  const currentId = usePlayer((s) => s.current?.id);
  const isPlaying = usePlayer((s) => s.isPlaying);

  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragFrom = useRef<number>(-1);

  const playlist =
    playlistId === "liked" ? likedPlaylist() : playlists.find((p) => p.id === playlistId);

  if (!playlist) {
    return (
      <div className="absolute inset-0 z-40 bg-bg px-4 pt-16">
        <button type="button" onClick={close} className="mb-4 text-sm text-muted">
          Back
        </button>
        <p>Playlist not found.</p>
      </div>
    );
  }

  const tracks = playlist.tracks;
  const canReorder = playlist.id !== "liked";

  function onDragStart(e: React.DragEvent, index: number, id: string) {
    if (!canReorder) return;
    dragFrom.current = index;
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    requestAnimationFrame(() => {
      (e.target as HTMLElement).closest("[data-track-row]")?.classList.add("opacity-40");
    });
  }

  function onDragOver(e: React.DragEvent, id: string) {
    if (!canReorder || !dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (id !== overId) setOverId(id);
  }

  function onDragLeave() {
    setOverId(null);
  }

  function onDrop(e: React.DragEvent, toIndex: number) {
    e.preventDefault();
    if (!canReorder || dragFrom.current < 0) return;
    const from = dragFrom.current;
    if (from === toIndex) {
      cleanupDrag();
      return;
    }
    const dir = from < toIndex ? 1 : -1;
    let i = from;
    const trackId = tracks[from]?.id;
    if (!trackId) {
      cleanupDrag();
      return;
    }
    while (i !== toIndex) {
      movePlaylistTrack(playlist!.id, trackId, dir as -1 | 1);
      i += dir;
    }
    cleanupDrag();
  }

  function onDragEnd(e: React.DragEvent) {
    (e.target as HTMLElement).closest("[data-track-row]")?.classList.remove("opacity-40");
    cleanupDrag();
  }

  function cleanupDrag() {
    dragFrom.current = -1;
    setDragId(null);
    setOverId(null);
  }

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-bg">
      <div className="flex items-center gap-1 px-2 pb-2 pt-[calc(12px+env(safe-area-inset-top))]">
        <button type="button" onClick={close} className="grid size-11 place-items-center" aria-label="Back">
          <ChevronLeft size={24} />
        </button>
        <h1 className="truncate font-display text-lg font-semibold">{playlist.name}</h1>
      </div>
      <div className="gmax-scroll px-4">
        <div className="mb-5 flex items-end gap-4">
          <Artwork src={playlist.coverImageUrl} title={playlist.name} className="size-28 rounded-md text-3xl" />
          <div>
            <p className="text-xs tracking-[0.2em] text-faint">PLAYLIST</p>
            <p className="mt-1 font-display text-2xl font-semibold leading-tight">{playlist.name}</p>
            <p className="mt-1 text-xs text-muted">
              {playlist.creator} • {tracks.length} songs
              {canReorder ? " · drag to reorder" : ""}
            </p>
          </div>
        </div>
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            disabled={!tracks.length}
            className="flex h-11 items-center gap-2 rounded-full bg-fg px-5 text-sm font-medium text-bg disabled:opacity-40"
            onClick={() => {
              if (tracks[0]) void playTrack(tracks[0], { tracks, label: playlist.name });
            }}
          >
            <Play size={16} fill="currentColor" />
            Play
          </button>
          <button
            type="button"
            disabled={!tracks.length}
            className="flex h-11 items-center gap-2 rounded-full border border-line px-5 text-sm font-medium disabled:opacity-40"
            onClick={() => {
              if (!tracks.length) return;
              const start = tracks[Math.floor(Math.random() * tracks.length)]!;
              void playTrack(start, { tracks, label: playlist.name });
            }}
          >
            <Shuffle size={16} />
            Shuffle
          </button>
        </div>
        {tracks.length ? (
          <div className="flex flex-col gap-0.5">
            {tracks.map((track, index) => {
              const isOver = overId === track.id && dragId !== track.id;
              return (
                <div
                  key={track.id}
                  data-track-row
                  draggable={canReorder}
                  onDragStart={(e) => onDragStart(e, index, track.id)}
                  onDragOver={(e) => onDragOver(e, track.id)}
                  onDragLeave={onDragLeave}
                  onDrop={(e) => onDrop(e, index)}
                  onDragEnd={onDragEnd}
                  className={`flex items-center gap-1 rounded-md border-b border-line/40 transition-all duration-200 ease-out ${
                    isOver ? "translate-y-0.5 border-accent/50 bg-accent/10" : ""
                  } ${dragId === track.id ? "opacity-40 scale-[0.98]" : ""}`}
                >
                  {canReorder ? (
                    <button
                      type="button"
                      className="grid size-10 shrink-0 cursor-grab place-items-center text-muted active:cursor-grabbing"
                      aria-label="Drag to reorder"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <GripVertical size={18} />
                    </button>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <TrackRow
                      track={track}
                      onPress={(t) => void playTrack(t, { tracks, label: playlist.name })}
                      onMore={setAddingTrack}
                      isPlaying={currentId === track.id && isPlaying}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-line bg-glass p-4 text-sm text-muted">
            No songs yet. Add tracks from Search.
          </div>
        )}
      </div>
    </div>
  );
}
