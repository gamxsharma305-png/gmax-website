import { useEffect, useRef, useState } from "react";
import { Search as SearchIcon, X } from "lucide-react";
import { BROWSE_CATEGORIES } from "@/lib/gmax/catalog";
import { searchCatalog } from "@/lib/gmax/search";
import { emptySearchResults, type SearchResults, type Track } from "@/lib/gmax/types";
import { usePlayer } from "@/store/player";
import { useUi } from "@/store/ui";
import { TrackRow } from "./TrackRow";
import { Artwork } from "./Artwork";

export function SearchView() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(emptySearchResults());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playTrack = usePlayer((s) => s.playTrack);
  const currentId = usePlayer((s) => s.current?.id);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const setAddingTrack = useUi((s) => s.setAddingTrack);
  const timer = useRef<number | null>(null);
  const browsing = query.trim().length === 0;

  useEffect(() => {
    if (!query.trim()) {
      setResults(emptySearchResults());
      setError(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void runSearch(query);
    }, 280);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [query]);

  async function runSearch(q: string) {
    setBusy(true);
    setError(null);
    try {
      const next = await searchCatalog(q, { limit: 30 });
      setResults(next);
      if (!next.tracks.length && !next.artists.length && !next.albums.length) {
        setError(`No results for “${q.trim()}”`);
      }
    } catch {
      setError("Search failed. Tap to retry.");
    } finally {
      setBusy(false);
    }
  }

  function playFrom(track: Track, tracks: Track[], label: string) {
    void playTrack(track, { tracks, label });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-3 pt-[calc(18px+env(safe-area-inset-top))]">
        <h1 className="mb-4 font-display text-[28px] font-semibold">Search</h1>
        <div className="flex h-14 items-center gap-3 rounded-md border border-line bg-glass px-4">
          <SearchIcon size={18} className="text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Songs, artists, albums..."
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-fg outline-none placeholder:text-muted"
            autoCapitalize="off"
            autoCorrect="off"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} className="text-muted" aria-label="Clear">
              <X size={18} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="gmax-scroll px-4">
        {browsing ? (
          <>
            <h2 className="mb-3 text-lg font-medium">Browse GMAX</h2>
            <div className="grid grid-cols-2 gap-3">
              {BROWSE_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setQuery(c.query)}
                  className="relative h-[100px] overflow-hidden rounded-md border border-line bg-glass p-4 text-left"
                >
                  <span
                    className="absolute -bottom-5 -right-5 size-20 rounded-full opacity-35"
                    style={{ background: c.color }}
                  />
                  <span className="relative text-[15px] font-medium">{c.name}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {error ? (
              <button
                type="button"
                onClick={() => void runSearch(query)}
                className="mb-4 w-full rounded-md border border-line bg-glass p-4 text-left"
              >
                <p className="text-sm font-medium">{error}</p>
                <p className="mt-1 text-xs text-muted">Tap to try again</p>
              </button>
            ) : null}
            {busy && !results.tracks.length ? (
              <p className="py-10 text-center text-sm text-muted">Searching…</p>
            ) : null}

            {results.tracks.length ? (
              <>
                <h2 className="mb-2 text-lg font-medium">Songs</h2>
                {results.tracks.map((track) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    onPress={(t) => playFrom(t, results.tracks, `Search • ${results.query}`)}
                    onMore={setAddingTrack}
                    isPlaying={currentId === track.id && isPlaying}
                  />
                ))}
              </>
            ) : null}

            {results.artists.length ? (
              <>
                <h2 className="mb-2 mt-6 text-lg font-medium">Artists</h2>
                {results.artists.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="flex w-full items-center gap-3 py-2 text-left"
                    onClick={() => setQuery(a.name)}
                  >
                    <Artwork src={a.imageUrl} title={a.name} className="size-12 rounded-full" />
                    <span>
                      <span className="block text-[15px] font-medium">{a.name}</span>
                      <span className="text-[13px] text-muted">{a.subtitle || "Artist"}</span>
                    </span>
                  </button>
                ))}
              </>
            ) : null}

            {results.albums.length ? (
              <>
                <h2 className="mb-2 mt-6 text-lg font-medium">Albums</h2>
                {results.albums.map((al) => (
                  <button
                    key={al.id}
                    type="button"
                    className="flex w-full items-center gap-3 py-2 text-left"
                    onClick={() => setQuery(`${al.artist} ${al.title}`)}
                  >
                    <Artwork src={al.coverImageUrl} title={al.title} className="size-12 rounded-sm" />
                    <span>
                      <span className="block text-[15px] font-medium">{al.title}</span>
                      <span className="text-[13px] text-muted">
                        {al.year ? `${al.artist} • ${al.year}` : al.artist}
                      </span>
                    </span>
                  </button>
                ))}
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
