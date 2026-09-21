import { useState } from "react";
import { X } from "lucide-react";
import { trackTitle } from "@/lib/gmax/normalize";
import { likedPlaylist, useLibrary } from "@/store/library";
import { useUi } from "@/store/ui";

export function AddToPlaylist() {
  const track = useUi((s) => s.addingTrack);
  const close = () => useUi.getState().setAddingTrack(null);
  const playlists = useLibrary((s) => s.playlists);
  const addToPlaylist = useLibrary((s) => s.addToPlaylist);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const toggleLike = useLibrary((s) => s.toggleLike);
  const isLiked = useLibrary((s) => (track ? s.liked.some((t) => t.id === track.id) : false));
  const [name, setName] = useState("");

  if (!track) return null;

  const all = [likedPlaylist(), ...playlists];

  return (
    <div className="absolute inset-0 z-50 flex items-end bg-black/55" onClick={close}>
      <div
        className="gmax-in w-full rounded-t-xl border border-line bg-raised p-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-medium text-fg">Add to playlist</p>
          <button type="button" onClick={close} className="grid size-9 place-items-center text-muted">
            <X size={18} />
          </button>
        </div>
        <p className="mb-3 truncate text-xs text-muted">{trackTitle(track)}</p>
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim();
            if (!n) return;
            createPlaylist(n, [track]);
            setName("");
            close();
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New playlist name"
            maxLength={60}
            className="h-11 min-w-0 flex-1 rounded-md border border-line bg-lift px-3 text-sm text-fg outline-none placeholder:text-faint"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="h-11 rounded-md bg-fg px-3 text-sm font-medium text-bg disabled:opacity-40"
          >
            Create
          </button>
        </form>
        <div className="max-h-56 overflow-y-auto">
          {all.map((p) => (
            <button
              key={p.id}
              type="button"
              className="flex w-full items-center justify-between rounded-md px-1 py-3 text-left"
              onClick={() => {
                if (p.id === "liked") toggleLike(track);
                else addToPlaylist(p.id, track);
                close();
              }}
            >
              <span className="text-sm text-fg">{p.name}</span>
              <span className="text-xs text-muted">
                {p.id === "liked" ? (isLiked ? "Liked" : "Like") : `${p.tracks.length} songs`}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
