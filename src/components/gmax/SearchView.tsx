import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { searchCatalog } from "@/lib/gmax/search";
import { resolveSpotifyPlayback, searchSpotifyByName } from "@/lib/gmax/spotify";
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
  const [mode, setMode] = useState<"spotify" | "all">("spotify");
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
        if (mode === "spotify") {
          // Name only — Spotify-style results (no link paste)
          const r = await searchSpotifyByName(query, 25);
          if (r.error && !r.tracks.length) {
            setError(r.error);
            setTracks([]);
          } else {
            setError(null);
            setTracks(r.tracks);
          }
        } else {
          const res = await searchCatalog(query, { limit: 30 });
          setTracks(res.tracks);
          setError(null);
        }
      } catch {
        setError("Search failed. Check network.");
        setTracks([]);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [q, mode]);

  async function onPlay(track: Track, list: Track[]) {
    // Spotify / needs full stream via RapidAPI
    if (
      track.provider === "spotify" ||
      track.id.startsWith("spotify:") ||
      (!track.streamUrl && !track.videoId)
    ) {
      const resolved = await resolveSpotifyPlayback(track);
      if ("error" in resolved) {
        setError(resolved.error);
        // still try normal play path as fallback
        await playTrack(track, { tracks: list, label: "Search" });
        return;
      }
      const enriched: Track = {
        ...track,
        streamUrl: resolved.streamUrl,
        duration: resolved.duration || track.duration,
      };
      const newList = list.map((t) => (t.id === track.id ? enriched : t));
      setTracks(newList);
      await playTrack(enriched, { tracks: newList, label: "Search" });
      return;
    }
    await playTrack(track, { tracks: list, label: "Search" });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-2 pt-[calc(18px+env(safe-area-inset-top))]">
        <h1 className="mb-3 font-display text-[28px] font-semibold">Search</h1>
        <div className="flex h-12 items-center gap-2 rounded-md border border-line bg-glass px-3">
          <Search size={18} className="shrink-0 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Song or artist name…"
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
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("spotify")}
            className={`rounded-full px-3 py-1 text-[11px] font-medium ${
              mode === "spotify" ? "bg-fg text-bg" : "border border-line text-muted"
            }`}
          >
            Spotify
          </button>
          <button
            type="button"
            onClick={() => setMode("all")}
            className={`rounded-full px-3 py-1 text-[11px] font-medium ${
              mode === "all" ? "bg-fg text-bg" : "border border-line text-muted"
            }`}
          >
            All sources
          </button>
        </div>
      </div>

      <div className="gmax-scroll px-4 pb-4">
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> Searching…
          </div>
        ) : null}
        {error ? (
          <div className="mb-2 rounded-md border border-line bg-glass p-3 text-sm text-red-400">
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
            onPress={(track) => void onPlay(track, tracks)}
            onMore={setAddingTrack}
            isPlaying={currentId === t.id && isPlaying}
          />
        ))}
      </div>
    </div>
  );
}
