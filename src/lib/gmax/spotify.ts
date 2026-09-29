import { normalizeTrack } from "./normalize";
import type { Track } from "./types";

export type SpotifySearchHit = {
  id: string;
  sourceId?: string;
  title: string;
  artist: string;
  thumbnail?: string;
  duration?: number;
  provider?: string;
  streamUrl?: string;
  previewUrl?: string;
  needsResolve?: boolean;
  searchHint?: string;
};

/** Search by song name (no Spotify link needed). */
export async function searchSpotifyByName(
  query: string,
  limit = 20,
): Promise<{ tracks: Track[]; error?: string }> {
  const q = query.trim();
  if (!q) return { tracks: [] };

  try {
    const res = await fetch(
      `/api/spotify/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    );
    const json = (await res.json()) as {
      success?: boolean;
      tracks?: SpotifySearchHit[];
      error?: string;
    };
    if (!res.ok || !json.success) {
      return { tracks: [], error: json.error || "Spotify search failed" };
    }
    const tracks = (json.tracks || []).map((t) =>
      normalizeTrack({
        id: t.id,
        title: t.title,
        artistName: t.artist,
        albumImageUrl: t.thumbnail || "",
        duration: t.duration || 0,
        provider: (t.provider as Track["provider"]) || "spotify",
        sourceId: t.sourceId,
        streamUrl: t.streamUrl,
        previewUrl: t.previewUrl,
      }),
    );
    return { tracks };
  } catch (e) {
    return {
      tracks: [],
      error: e instanceof Error ? e.message : "Search failed",
    };
  }
}

/** On play: get full stream from RapidAPI convert (by Spotify id or title). */
export async function resolveSpotifyPlayback(
  track: Track,
): Promise<{ streamUrl: string; duration?: number } | { error: string }> {
  try {
    const body: Record<string, string> = {
      title: track.title || "",
      artist: track.artist?.name || "",
    };
    if (track.sourceId && track.provider === "spotify") {
      body.id = track.sourceId;
    } else if (track.id?.startsWith("spotify:")) {
      body.id = track.id.replace(/^spotify:/, "");
    }

    const res = await fetch("/api/spotify/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      success?: boolean;
      error?: string;
      data?: { streamUrl?: string; duration?: number };
    };
    if (!res.ok || !json.success || !json.data?.streamUrl) {
      return {
        error:
          json.error ||
          (res.status === 429
            ? "Daily Spotify download limit reached. Try later."
            : "Could not load audio"),
      };
    }
    return {
      streamUrl: json.data.streamUrl,
      duration: json.data.duration,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Resolve failed" };
  }
}
