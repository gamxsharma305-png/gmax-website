import { safeText, safeUrl } from "./text";
import type { ProviderId, Track } from "./types";
import { trackKey } from "./types";

export function normalizeTrack(raw: {
  id?: string;
  title?: unknown;
  artistName?: unknown;
  artistId?: unknown;
  albumImageUrl?: unknown;
  duration?: unknown;
  provider?: unknown;
  sourceId?: unknown;
  album?: unknown;
  videoId?: unknown;
  previewUrl?: unknown;
  explicit?: unknown;
  isVideo?: unknown;
}): Track | null {
  const sourceId = safeText(raw.sourceId) || safeText(raw.videoId) || safeText(raw.id);
  if (!sourceId) return null;

  const provider: ProviderId = raw.provider === "youtube" ? "youtube" : "itunes";
  const title = safeText(raw.title, "Unknown title");
  const artistName = safeText(raw.artistName, "Unknown artist");
  const videoId = safeText(raw.videoId);
  const previewUrl = safeUrl(raw.previewUrl);
  const durationRaw = raw.duration;
  const duration =
    typeof durationRaw === "number" && Number.isFinite(durationRaw) && durationRaw > 0
      ? Math.round(durationRaw)
      : 0;

  return {
    id: safeText(raw.id) || trackKey(provider, sourceId),
    title,
    artist: {
      id: safeText(raw.artistId, `artist:${artistName}`),
      name: artistName,
    },
    albumImageUrl: safeUrl(raw.albumImageUrl),
    duration,
    provider,
    sourceId,
    album: safeText(raw.album) || undefined,
    videoId: videoId || undefined,
    previewUrl: previewUrl || undefined,
    explicit: Boolean(raw.explicit),
    isVideo: Boolean(raw.isVideo),
  };
}

export function trackTitle(track: Track | null | undefined): string {
  return safeText(track?.title, "Unknown title");
}

export function trackArtist(track: Track | null | undefined): string {
  return safeText(track?.artist?.name, "Unknown artist");
}

export function canPlay(track: Track | null | undefined): boolean {
  if (!track) return false;
  return Boolean(safeText(track.videoId) || safeUrl(track.previewUrl));
}

export function upscaleItunesArt(url: string): string {
  if (!url) return "";
  return url.replace(/\d+x\d+bb/, "600x600bb").replace(/100x100/, "600x600");
}
