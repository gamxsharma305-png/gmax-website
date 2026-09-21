import { searchItunes } from "./itunes";
import { searchSaavn } from "./saavn";
import type { SearchResults } from "./types";
import { emptySearchResults } from "./types";

export async function searchCatalog(
  query: string,
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return emptySearchResults();

  try {
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, limit: options.limit ?? 25 }),
      signal: options.signal,
    });
    if (res.ok) {
      const results = (await res.json()) as SearchResults;
      if (results.tracks?.length) return results;
    }
  } catch {
    /* fall through to browser fallbacks */
  }

  // Client-side fallbacks when API is unavailable
  try {
    const saavn = await searchSaavn(q, options.limit ?? 25);
    if (saavn.tracks.length) return saavn;
  } catch {
    /* continue */
  }

  return searchItunes(q, options.limit ?? 25, options.signal);
}

export type ResolveResult = {
  videoId?: string | null;
  streamUrl?: string | null;
  duration?: number | null;
};

export async function resolveVideoId(
  title: string,
  artist: string,
): Promise<ResolveResult | null> {
  try {
    const res = await fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, artist }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ResolveResult;
    if (data.streamUrl || data.videoId) return data;
    return null;
  } catch {
    return null;
  }
}
