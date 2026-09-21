import { useEffect, useMemo, useState } from "react";
import { Compass, Heart, Moon, Play, Search, Target, User } from "lucide-react";
import { FEATURED_QUERY, randomQueryFor } from "@/lib/gmax/catalog";
import { greetingFor } from "@/lib/gmax/text";
import { searchCatalog } from "@/lib/gmax/search";
import type { Track } from "@/lib/gmax/types";
import { useLibrary } from "@/store/library";
import { usePlayer } from "@/store/player";
import { useUi } from "@/store/ui";
import { TrackRow } from "./TrackRow";

const ACTIONS = [
  { id: "liked", label: "Liked", Icon: Heart },
  { id: "discover", label: "Discover", Icon: Compass },
  { id: "chill", label: "Chill", Icon: Moon },
  { id: "focus", label: "Focus", Icon: Target },
] as const;

export function Home() {
  const profile = useLibrary((s) => s.profile);
  const recents = useLibrary((s) => s.recents);
  const liked = useLibrary((s) => s.liked);
  const playTrack = usePlayer((s) => s.playTrack);
  const currentId = usePlayer((s) => s.current?.id);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const setTab = useUi((s) => s.setTab);
  const openSettings = useUi((s) => s.openSettings);
  const setAddingTrack = useUi((s) => s.setAddingTrack);

  const [featured, setFeatured] = useState<Track[]>([]);
  const [starterError, setStarterError] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const greet = greetingFor(new Date().getHours(), profile.name);
  const hasRecents = recents.length > 0;
  const list = useMemo(() => {
    const src = hasRecents ? recents.slice(0, 8) : featured.slice(0, 6);
    const seen = new Set<string>();
    return src.filter((t) => {
      const k = t.title.toLowerCase();
      if (seen.has(t.id) || seen.has(k)) return false;
      seen.add(t.id);
      seen.add(k);
      return true;
    });
  }, [hasRecents, recents, featured]);

  useEffect(() => {
    let cancelled = false;
    searchCatalog(FEATURED_QUERY, { limit: 10 })
      .then((r) => {
        if (!cancelled) {
          setFeatured(r.tracks);
          setStarterError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setStarterError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function runAction(id: string, label: string) {
    if (id === "liked") {
      if (liked.length) await playTrack(liked[0]!, { tracks: liked, label: "Liked Songs" });
      else setTab("library");
      return;
    }
    const query = randomQueryFor(id);
    if (!query) return;
    setPending(id);
    try {
      const results = await searchCatalog(query, { limit: 25 });
      if (results.tracks.length) {
        const shuffled = [...results.tracks].sort(() => Math.random() - 0.5);
        await playTrack(shuffled[0]!, { tracks: shuffled, label });
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-2 pt-[calc(18px+env(safe-area-inset-top))]">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-xl text-muted">{greet.line}</p>
            {greet.name ? (
              <p className="font-display text-[28px] font-semibold leading-tight">{greet.name}.</p>
            ) : null}
            <p className="mt-1 text-[9px] font-medium tracking-[0.28em] text-faint">MADE BY GMAX</p>
          </div>
          <button
            type="button"
            onClick={openSettings}
            className="grid size-12 place-items-center rounded-full border border-line bg-raised text-muted"
            aria-label="Settings"
          >
            <User size={22} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setTab("search")}
          className="flex h-14 w-full items-center gap-3 rounded-md border border-line bg-glass px-4 text-left text-sm text-muted"
        >
          <Search size={18} />
          Search for songs, artists, or more...
        </button>
      </div>

      <div className="gmax-scroll px-4">
        <div className="mb-5 mt-2 flex gap-2">
          {["Music", "Podcasts", "Radio"].map((c, i) => (
            <span
              key={c}
              className={`rounded-full px-4 py-1.5 text-xs font-medium ${
                i === 0 ? "bg-fg text-bg" : "border border-line bg-raised text-muted"
              }`}
            >
              {c}
            </span>
          ))}
        </div>

        <div className="mb-4 flex items-center justify-between rounded-lg border border-line bg-glass px-5 py-5">
          <div>
            <p className="text-[16px] font-medium text-fg/90">A calmer you</p>
            <p className="text-[16px] font-medium text-fg/90">A softer tomorrow.</p>
          </div>
          <button
            type="button"
            className="grid size-12 place-items-center rounded-full bg-fg text-bg"
            onClick={() => {
              if (featured[0]) void playTrack(featured[0], { tracks: featured, label: "A calmer you" });
            }}
            aria-label="Play featured"
          >
            <Play size={20} fill="currentColor" />
          </button>
        </div>

        <div className="mb-8 grid grid-cols-4 gap-2">
          {ACTIONS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => void runAction(a.id, a.label)}
              className="flex flex-col items-center rounded-md border border-line bg-glass py-3"
            >
              <span className="mb-2 grid size-6 place-items-center text-muted">
                {pending === a.id ? (
                  <span className="size-3.5 animate-pulse rounded-full bg-muted" />
                ) : (
                  <a.Icon size={16} />
                )}
              </span>
              <span className="text-[10px] text-muted">{a.label}</span>
            </button>
          ))}
        </div>

        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-lg font-medium">{hasRecents ? "Recently Played" : "Start Listening"}</h2>
          <button type="button" className="text-xs text-muted" onClick={() => setTab("library")}>
            See all
          </button>
        </div>

        {list.length ? (
          list.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              onPress={(t) =>
                void playTrack(t, {
                  tracks: list,
                  label: hasRecents ? "Recently Played" : "Start Listening",
                })
              }
              onMore={setAddingTrack}
              isPlaying={currentId === track.id && isPlaying}
            />
          ))
        ) : (
          <div className="rounded-md border border-line bg-glass p-4">
            <p className="text-sm font-medium">
              {starterError ? "Couldn't load suggestions." : "Finding something for you..."}
            </p>
            <p className="mt-1 text-xs text-muted">
              {starterError ? "Check your connection and try Search." : "Search for anything to get started."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
