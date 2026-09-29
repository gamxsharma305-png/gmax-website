import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { searchCatalog } from "@/lib/gmax/search";
import { isSpotifyTrackQuery, resolveSpotifyTrack } from "@/lib/gmax/spotify";
import type { Track } from "@/lib/gmax/types";
import { usePlayer } from "@/store/player";
import { useUi } from "@/store/ui";
import { TrackRow } from "./TrackRow";

export function SearchView() {
  const playTrack = usePlayer((s) => s.playTrack);
  const currentId = usePlayer((s) => s.current?.id);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const setAddingTrack = useUi((s) => s.setAddingTrack);

  const [q, setQ] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    const query = q.trim();
    if (!query) {
      setTracks([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    timer.current = window.setTimeout(async () => {
      try {
        // Spotify track URL / ID → RapidAPI resolve → HTML5 stream
        if (isSpotifyTrackQuery(query)) {
          const r = await resolveSpotifyTrack(query);
          if ("error" in r) {
            setError(r.error);
            setTracks([]);
          } else {
            setError(null);
            setTracks([r.track]);
          }
          setLoading(false);
          return;
        }

        const res = await searchCatalog(query, { limit: 30 });
        setTracks(res.tracks);
        setError(null);
      } catch {
        setError("Search failed. Check network.");
        setTracks([]);
      } finally {
        setLoading(false);
      }
    }, 380);

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [q]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-2 pt-[calc(18px+env(safe-area-inset-top))]">
        <h1 className="mb-3 font-display text-[28px] font-semibold">Search</h1>
        <div className="flex h-12 items-center gap-2 rounded-md border border-line bg-glass px-3">
          <Search size={18} className="shrink-0 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Songs, artists, or Spotify track link…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
            autoCapitalize="off"
            autoCorrect="off"
          />
          {q ? (
            <button type="button" onClick={() => setQ("")} aria-label="Clear">
              <X size={16} className="text-muted" />
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Paste a Spotify track link for RapidAPI stream · or search normally
        </p>
      </div>

      <div className="gmax-scroll px-4 pb-4">
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> Searching…
          </div>
        ) : null}
        {error ? (
          <div className="rounded-md border border-line bg-glass p-3 text-sm text-red-400">
            {error}
          </div>
        ) : null}
        {!loading && !error && q && !tracks.length ? (
          <p className="py-6 text-sm text-muted">No results for “{q}”.</p>
        ) : null}
        {tracks.map((t) => (
          <TrackRow
            key={t.id}
            track={t}
            onPress={(track) =>
              void playTrack(track, { tracks, label: "Search" })
            }
            onMore={setAddingTrack}
            isPlaying={currentId === t.id && isPlaying}
          />
        ))}
      </div>
    </div>
  );
}
