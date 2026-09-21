import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { likedPlaylist, useLibrary } from "@/store/library";
import { usePlayer } from "@/store/player";
import { useUi } from "@/store/ui";
import { Artwork } from "./Artwork";

const FILTERS = ["Playlists", "Artists", "Albums"] as const;

export function LibraryView() {
  const playlists = useLibrary((s) => s.playlists);
  const liked = useLibrary((s) => s.liked);
  const recents = useLibrary((s) => s.recents);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const deletePlaylist = useLibrary((s) => s.deletePlaylist);
  const touchPlaylist = useLibrary((s) => s.touchPlaylist);
  const openPlaylist = useUi((s) => s.openPlaylist);
  const playTrack = usePlayer((s) => s.playTrack);

  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Playlists");
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");

  const allPlaylists = useMemo(() => {
    const sorted = [...playlists].sort((a, b) => b.updatedAt - a.updatedAt);
    return [likedPlaylist(), ...sorted];
  }, [playlists, liked]);

  const derived = useMemo(() => {
    const tracks = [...liked, ...playlists.flatMap((p) => p.tracks), ...recents];
    const artists = new Map<string, { name: string; image: string; count: number }>();
    const albums = new Map<string, { name: string; artist: string; image: string; count: number }>();
    for (const t of tracks) {
      const a = artists.get(t.artist.name);
      if (a) a.count++;
      else artists.set(t.artist.name, { name: t.artist.name, image: t.albumImageUrl, count: 1 });
      if (t.album) {
        const al = albums.get(t.album);
        if (al) al.count++;
        else
          albums.set(t.album, {
            name: t.album,
            artist: t.artist.name,
            image: t.albumImageUrl,
            count: 1,
          });
      }
    }
    return {
      artists: [...artists.values()].sort((x, y) => y.count - x.count),
      albums: [...albums.values()].sort((x, y) => y.count - x.count),
    };
  }, [liked, playlists, recents]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-2 pt-[calc(18px+env(safe-area-inset-top))]">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="font-display text-[28px] font-semibold">Your Library</h1>
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="grid size-10 place-items-center text-fg"
            aria-label="New playlist"
          >
            {showNew ? <X size={22} /> : <Plus size={22} />}
          </button>
        </div>
        {showNew ? (
          <form
            className="mb-4 rounded-md border border-line bg-glass p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const n = name.trim();
              if (!n) return;
              const p = createPlaylist(n);
              setName("");
              setShowNew(false);
              openPlaylist(p.id);
            }}
          >
            <p className="mb-2 text-sm font-medium">New playlist</p>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Playlist name"
                maxLength={60}
                className="h-11 min-w-0 flex-1 rounded-md border border-line bg-lift px-3 text-sm outline-none placeholder:text-faint"
              />
              <button
                type="submit"
                disabled={!name.trim()}
                className="h-11 rounded-md bg-fg px-3 text-sm font-medium text-bg disabled:opacity-40"
              >
                Create
              </button>
            </div>
          </form>
        ) : null}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium ${
                filter === f ? "bg-fg text-bg" : "border border-line bg-raised text-muted"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="gmax-scroll px-4">
        {filter === "Playlists"
          ? allPlaylists.map((p) => (
              <div key={p.id} className="flex items-center">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left"
                  onClick={() => {
                    if (p.id === "liked") {
                      if (p.tracks[0]) void playTrack(p.tracks[0], { tracks: p.tracks, label: p.name });
                      return;
                    }
                    touchPlaylist(p.id);
                    openPlaylist(p.id);
                  }}
                >
                  <Artwork src={p.coverImageUrl} title={p.name} className="size-14 rounded-sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium">{p.name}</span>
                    <span className="text-[12px] text-muted">
                      {p.id === "liked"
                        ? `${p.tracks.length} songs`
                        : `Playlist • ${p.creator} • ${p.tracks.length}`}
                    </span>
                  </span>
                </button>
                {p.id !== "liked" ? (
                  <button
                    type="button"
                    className="grid size-10 place-items-center text-faint"
                    onClick={() => deletePlaylist(p.id)}
                    aria-label={`Delete ${p.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                ) : null}
              </div>
            ))
          : null}

        {filter === "Artists" ? (
          derived.artists.length ? (
            derived.artists.map((a) => (
              <div key={a.name} className="flex items-center gap-3 py-2">
                <Artwork src={a.image} title={a.name} className="size-12 rounded-full" />
                <div>
                  <p className="text-[15px] font-medium">{a.name}</p>
                  <p className="text-[12px] text-muted">{a.count} tracks</p>
                </div>
              </div>
            ))
          ) : (
            <Empty text="Artists appear as you like and play songs." />
          )
        ) : null}

        {filter === "Albums" ? (
          derived.albums.length ? (
            derived.albums.map((a) => (
              <div key={a.name} className="flex items-center gap-3 py-2">
                <Artwork src={a.image} title={a.name} className="size-12 rounded-sm" />
                <div>
                  <p className="text-[15px] font-medium">{a.name}</p>
                  <p className="text-[12px] text-muted">{a.artist}</p>
                </div>
              </div>
            ))
          ) : (
            <Empty text="Albums appear from songs in your library." />
          )
        ) : null}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-line bg-glass p-4">
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}
