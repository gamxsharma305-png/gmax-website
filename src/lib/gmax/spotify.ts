import { normalizeTrack } from "./normalize";
import type { Track } from "./types";

export function extractSpotifyTrackId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const uri = raw.match(/spotify:track:([a-zA-Z0-9]+)/i);
  if (uri) return uri[1]!;
  const web = raw.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/i);
  if (web) return web[1]!;
  if (/^[a-zA-Z0-9]{10,30}$/.test(raw)) return raw;
  return null;
}

export function isSpotifyTrackQuery(query: string): boolean {
  return Boolean(extractSpotifyTrackId(query));
}

/** Resolve Spotify URL/ID → playable Track via our server proxy. */
export async function resolveSpotifyTrack(
  input: string,
): Promise<{ track: Track } | { error: string }> {
  const id = extractSpotifyTrackId(input);
  if (!id) return { error: "Invalid Spotify track URL/ID" };

  try {
    const res = await fetch(
      `/api/spotify/resolve?id=${encodeURIComponent(id)}`,
    );
    const json = (await res.json()) as {
      success?: boolean;
      error?: string;
      data?: {
        id: string;
        sourceId?: string;
        title: string;
        artist: string;
        thumbnail?: string;
        duration?: number;
        streamUrl: string;
        provider?: string;
      };
      meta?: {
        title?: string;
        artist?: string;
        thumbnail?: string;
        duration?: number;
      };
    };

    if (!res.ok || !json.success || !json.data?.streamUrl) {
      return {
        error:
          json.error ||
          (res.status === 429
            ? "Spotify API daily limit reached. Try later or upgrade RapidAPI plan."
            : "Could not load Spotify track"),
      };
    }

    const d = json.data;
    const track = normalizeTrack({
      id: d.id || `spotify:${id}`,
      title: d.title,
      artistName: d.artist,
      albumImageUrl: d.thumbnail || "",
      duration: d.duration || 0,
      provider: "spotify",
      sourceId: d.sourceId || id,
      streamUrl: d.streamUrl,
    });
    return { track };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Spotify resolve failed",
    };
  }
}
