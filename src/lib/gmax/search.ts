import { searchItunes } from "./itunes";
import { searchSaavn, resolveSaavnStream } from "./saavn";
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

/** Always try to get a playable source — API first, then direct Saavn in browser. */
export async function resolveVideoId(
  title: string,
  artist: string,
): Promise<ResolveResult | null> {
  const t = title.trim();
  if (!t) return null;

  try {
    const res = await fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t, artist }),
    });
    if (res.ok) {
      const data = (await res.json()) as ResolveResult;
      if (data.streamUrl || data.videoId) return data;
    }
  } catch {
    /* continue to client fallback */
  }

  try {
    const saavn = await resolveSaavnStream(t, artist);
    if (saavn?.streamUrl) {
      return { streamUrl: saavn.streamUrl, duration: saavn.duration ?? null, videoId: null };
    }
  } catch {
    /* ignore */
  }

  return null;
}
