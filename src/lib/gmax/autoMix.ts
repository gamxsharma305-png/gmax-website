import { searchCatalog } from "./search";
import type { Track } from "./types";
import { AUTO_PLAYLISTS } from "./catalog";

function dedupeTracks(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const t of tracks) {
    const key = `${t.title}\n${t.artist?.name || ""}`.toLowerCase();
    const titleOnly = t.title.toLowerCase();
    if (seen.has(key) || seen.has(titleOnly)) continue;
    seen.add(key);
    seen.add(titleOnly);
    out.push(t);
  }
  return out;
}

/**
 * Build a long auto-mix (Spotify Mega Punjabi Hits style).
 * Runs primary + extraQueries in parallel batches and merges unique tracks.
 */
export async function buildAutoMix(
  mixId: string,
  options: { targetCount?: number } = {},
): Promise<{ tracks: Track[]; name: string; description: string } | null> {
  const mix = AUTO_PLAYLISTS.find((m) => m.id === mixId);
  if (!mix) return null;

  const target = options.targetCount ?? 60;
  const queries = [mix.query, ...(mix.extraQueries || [])];

  // Cap parallel calls — first 12 queries cover Mega Punjabi depth
  const slice = queries.slice(0, 14);
  const results = await Promise.allSettled(
    slice.map((q) => searchCatalog(q, { limit: 15 })),
  );

  const buckets: Track[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.tracks?.length) {
      buckets.push(...r.value.tracks);
    }
  }

  let tracks = dedupeTracks(buckets);

  // Light shuffle so order feels like a curated mix, not pure search rank
  tracks = tracks
    .map((t) => ({ t, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.t)
    .slice(0, target);

  return {
    tracks,
    name: mix.name,
    description: mix.description,
  };
}
