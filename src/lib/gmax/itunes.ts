import { normalizeTrack, upscaleItunesArt } from "./normalize";
import { safeText } from "./text";
import type { SearchResults, Track } from "./types";
import { emptySearchResults } from "./types";

type ItunesResult = {
  wrapperType?: string;
  kind?: string;
  trackId?: number;
  collectionId?: number;
  trackName?: string;
  collectionName?: string;
  artistName?: string;
  artistId?: number;
  artworkUrl100?: string;
  artworkUrl60?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  releaseDate?: string;
};

type ItunesResponse = { results?: ItunesResult[] };

export async function searchItunes(
  query: string,
  limit = 25,
  signal?: AbortSignal,
): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return emptySearchResults();

  const url =
    `https://itunes.apple.com/search?term=${encodeURIComponent(q)}` +
    `&media=music&entity=song&limit=${Math.min(50, Math.max(1, limit))}`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("Search failed. Check your connection.");
  const data = (await res.json()) as ItunesResponse;
  const tracks: Track[] = [];
  const albums = new Map<
    string,
    { id: string; title: string; artist: string; coverImageUrl: string; year?: string }
  >();
  const artists = new Map<
    string,
    { id: string; name: string; imageUrl: string; subtitle?: string }
  >();

  for (const item of data.results ?? []) {
    if (item.kind !== "song" && item.wrapperType !== "track") continue;
    const track = normalizeTrack({
      id: item.trackId ? `itunes:${item.trackId}` : undefined,
      title: item.trackName,
      artistName: item.artistName,
      artistId: item.artistId ? `itunes-artist:${item.artistId}` : undefined,
      albumImageUrl: upscaleItunesArt(item.artworkUrl100 || item.artworkUrl60 || ""),
      duration: item.trackTimeMillis ? item.trackTimeMillis / 1000 : 0,
      provider: "itunes",
      sourceId: item.trackId ? String(item.trackId) : undefined,
      album: item.collectionName,
      previewUrl: item.previewUrl,
    });
    if (track) tracks.push(track);

    const artistName = safeText(item.artistName);
    if (artistName && item.artistId && !artists.has(String(item.artistId))) {
      artists.set(String(item.artistId), {
        id: `itunes-artist:${item.artistId}`,
        name: artistName,
        imageUrl: upscaleItunesArt(item.artworkUrl100 || ""),
        subtitle: "Artist",
      });
    }
    const albumName = safeText(item.collectionName);
    if (albumName && item.collectionId && !albums.has(String(item.collectionId))) {
      const year = safeText(item.releaseDate).slice(0, 4) || undefined;
      albums.set(String(item.collectionId), {
        id: `itunes-album:${item.collectionId}`,
        title: albumName,
        artist: artistName || "Unknown artist",
        coverImageUrl: upscaleItunesArt(item.artworkUrl100 || ""),
        year,
      });
    }
  }

  return {
    query: q,
    tracks,
    artists: [...artists.values()].slice(0, 12),
    albums: [...albums.values()].slice(0, 12),
  };
}
