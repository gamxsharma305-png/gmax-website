import { searchItunes } from "./itunes";
import { searchSaavn, resolveSaavnStream } from "./saavn";
import { searchAudius, resolveAudiusStream } from "./audius";
import type { SearchResults, Track } from "./types";
import { emptySearchResults } from "./types";

function isGlobalGenreQuery(query: string): boolean {
  return /\b(phonk|drift\s*phonk|montagem|montage[nm]?|funk|brazilian\s*funk|brega\s*funk|house|edm|techno|drill|trap\s*beat|lofi|lo-fi|synthwave|nightcore|sped\s*up|slowed)\b/i.test(
    query,
  );
}

function titleKey(track: Track): string {
  return `${track.title}\n${track.artist.name}`.toLowerCase();
}

function mergeTracks(buckets: Track[][], limit: number): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const bucket of buckets) {
    for (const t of bucket) {
      const key = titleKey(t);
      const titleOnly = t.title.toLowerCase();
      if (seen.has(key) || seen.has(titleOnly)) continue;
      seen.add(key);
      seen.add(titleOnly);
      out.push(t);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export async function searchCatalog(
  query: string,
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return emptySearchResults();
  const limit = options.limit ?? 25;
  const global = isGlobalGenreQuery(q);

  try {
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, limit }),
      signal: options.signal,
    });
    if (res.ok) {
      const results = (await res.json()) as SearchResults;
      if (results.tracks?.length) return results;
    }
  } catch {
    /* API may be down — use client fallbacks */
  }

  const [audius, saavn, itunes] = await Promise.allSettled([
    searchAudius(q, limit),
    searchSaavn(q, limit),
    searchItunes(q, limit, options.signal),
  ]);

  const audiusTracks = audius.status === "fulfilled" ? audius.value.tracks : [];
  const saavnTracks = saavn.status === "fulfilled" ? saavn.value.tracks : [];
  const itunesTracks = itunes.status === "fulfilled" ? itunes.value.tracks : [];

  const buckets = global
    ? [
        audiusTracks.filter((t) => t.streamUrl),
        saavnTracks.filter((t) => t.streamUrl),
        audiusTracks,
        saavnTracks,
        itunesTracks,
      ]
    : [
        saavnTracks.filter((t) => t.streamUrl),
        audiusTracks.filter((t) => t.streamUrl),
        saavnTracks,
        audiusTracks,
        itunesTracks,
      ];

  return {
    query: q,
    tracks: mergeTracks(buckets, limit),
    artists: itunes.status === "fulfilled" ? itunes.value.artists : [],
    albums: itunes.status === "fulfilled" ? itunes.value.albums : [],
  };
}

export type ResolveResult = {
  videoId?: string | null;
  streamUrl?: string | null;
  duration?: number | null;
  title?: string | null;
  artist?: string | null;
  thumbnail?: string | null;
};

/**
 * Resolve YouTube video → same-origin proxy URL for HTML5 audio.
 * Uses /api/audio so playback works from the user's device (CDN URLs are IP-bound).
 */
export async function resolveYouTubeStream(
  videoId: string,
): Promise<ResolveResult | null> {
  const id = videoId.trim();
  if (!id) return null;

  // Same-origin proxy — required for background + cross-device playback
  const proxyUrl = `/api/audio?videoId=${encodeURIComponent(id)}`;

  try {
    const res = await fetch(`/api/stream?videoId=${encodeURIComponent(id)}`);
    if (res.ok) {
      const json = (await res.json()) as {
        success?: boolean;
        data?: {
          title?: string;
          artist?: string;
          thumbnail?: string;
          duration?: number;
        };
      };
      if (json.success && json.data) {
        return {
          videoId: id,
          streamUrl: proxyUrl,
          duration: json.data.duration ?? null,
          title: json.data.title ?? null,
          artist: json.data.artist ?? null,
          thumbnail: json.data.thumbnail ?? null,
        };
      }
    }
  } catch {
    /* still return proxy URL — audio endpoint resolves on its own */
  }

  // Even if metadata fails, proxy can still stream
  return {
    videoId: id,
    streamUrl: proxyUrl,
    duration: null,
  };
}

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
      if (data.videoId && !data.streamUrl) {
        const stream = await resolveYouTubeStream(data.videoId);
        if (stream?.streamUrl) {
          return {
            ...data,
            streamUrl: stream.streamUrl,
            duration: stream.duration ?? data.duration,
          };
        }
      }
      if (data.streamUrl || data.videoId) return data;
    }
  } catch {
    /* continue */
  }

  try {
    const saavn = await resolveSaavnStream(t, artist);
    if (saavn?.streamUrl) {
      return { streamUrl: saavn.streamUrl, duration: saavn.duration ?? null, videoId: null };
    }
  } catch {
    /* ignore */
  }

  try {
    const audius = await resolveAudiusStream(t, artist);
    if (audius?.streamUrl) {
      return { streamUrl: audius.streamUrl, duration: audius.duration ?? null, videoId: null };
    }
  } catch {
    /* ignore */
  }

  return null;
}
