import { ChevronLeft, Play, Shuffle } from "lucide-react";
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
  const playTrack = usePlayer((s) => s.playTrack);
  const currentId = usePlayer((s) => s.current?.id);
  const isPlaying = usePlayer((s) => s.isPlaying);

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
          tracks.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              onPress={(t) => void playTrack(t, { tracks, label: playlist.name })}
              onMore={setAddingTrack}
              isPlaying={currentId === track.id && isPlaying}
            />
          ))
        ) : (
          <div className="rounded-md border border-line bg-glass p-4 text-sm text-muted">
            No songs yet. Add tracks from Search.
          </div>
        )}
      </div>
    </div>
  );
}
