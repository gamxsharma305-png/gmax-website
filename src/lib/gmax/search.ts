import { searchItunes } from "./itunes";
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
    /* browser iTunes fallback */
  }

  return searchItunes(q, options.limit ?? 25, options.signal);
}

export async function resolveVideoId(
  title: string,
  artist: string,
): Promise<string | null> {
  try {
    const res = await fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, artist }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { videoId?: string | null };
    return data.videoId ?? null;
  } catch {
    return null;
  }
}
