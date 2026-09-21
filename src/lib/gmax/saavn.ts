import { normalizeTrack } from "./normalize";
import { safeText } from "./text";
import type { SearchResults, Track } from "./types";
import { emptySearchResults } from "./types";

const SAAVN_BASE = "https://saavn.sumit.co/api";

type AnyRec = Record<string, unknown>;

function asRec(v: unknown): AnyRec | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AnyRec) : null;
}

function pickImage(images: unknown): string {
  if (!Array.isArray(images) || !images.length) return "";
  for (let i = images.length - 1; i >= 0; i--) {
    const url = safeText(asRec(images[i])?.url);
    if (url) return url;
  }
  return "";
}

function pickStream(downloadUrl: unknown): string {
  if (!Array.isArray(downloadUrl) || !downloadUrl.length) return "";
  let best = "";
  for (const item of downloadUrl) {
    const rec = asRec(item);
    if (!rec) continue;
    const q = safeText(rec.quality).toLowerCase();
    const url = safeText(rec.url);
    if (!url) continue;
    if (q.includes("320")) return url;
    if (q.includes("160")) best = url;
    if (!best) best = url;
  }
  return best;
}

function primaryArtist(artists: unknown): string {
  const rec = asRec(artists);
  const primary = rec?.primary;
  if (Array.isArray(primary) && primary.length) {
    return (
      primary
        .map((a) => safeText(asRec(a)?.name))
        .filter(Boolean)
        .join(", ") || "Unknown artist"
    );
  }
  return "Unknown artist";
}

function mapSong(raw: unknown): Track | null {
  const item = asRec(raw);
  if (!item) return null;
  const id = safeText(item.id);
  const title = safeText(item.name) || safeText(item.title);
  if (!id || !title) return null;

  const streamUrl = pickStream(item.downloadUrl);
  const image =
    pickImage(item.image) ||
    pickImage(asRec(item.album)?.image) ||
    "";

  const duration = Number(item.duration) || 0;
  const albumName = safeText(asRec(item.album)?.name);

  return normalizeTrack({
    id: `saavn:${id}`,
    title,
    artistName: primaryArtist(item.artists),
    albumImageUrl: image,
    duration,
    provider: "saavn",
    sourceId: id,
    album: albumName || undefined,
    streamUrl: streamUrl || undefined,
    explicit: Boolean(item.explicitContent),
  });
}

async function fetchJson(url: string, timeoutMs = 10000): Promise<unknown | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function enrichWithStream(track: Track): Promise<Track> {
  if (track.streamUrl) return track;
  const id = track.sourceId;
  if (!id) return track;
  const data = await fetchJson(`${SAAVN_BASE}/songs/${encodeURIComponent(id)}`);
  const rec = asRec(data);
  const payload = rec?.data;
  const song = Array.isArray(payload) ? payload[0] : payload;
  const mapped = mapSong(song);
  if (mapped?.streamUrl) {
    return { ...track, streamUrl: mapped.streamUrl, duration: mapped.duration || track.duration };
  }
  return track;
}

export async function searchSaavn(
  query: string,
  limit = 25,
): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return emptySearchResults();

  const data = await fetchJson(
    `${SAAVN_BASE}/search/songs?query=${encodeURIComponent(q)}&limit=${Math.min(50, limit)}`,
  );
  if (!data) return emptySearchResults(q);

  const rec = asRec(data);
  const results =
    asRec(rec?.data)?.results ??
    rec?.results ??
    (Array.isArray(rec?.data) ? rec.data : null);

  if (!Array.isArray(results)) return emptySearchResults(q);

  const tracks: Track[] = [];
  const seen = new Set<string>();
  for (const raw of results) {
    const track = mapSong(raw);
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    tracks.push(track);
    if (tracks.length >= limit) break;
  }

  const enriched = await Promise.all(
    tracks.slice(0, Math.min(tracks.length, 15)).map((t) => enrichWithStream(t)),
  );
  const rest = tracks.slice(enriched.length);

  return {
    query: q,
    tracks: [...enriched, ...rest],
    artists: [],
    albums: [],
  };
}

export async function resolveSaavnStream(
  title: string,
  artist: string,
): Promise<{ streamUrl: string; duration?: number } | null> {
  const q = [artist, title].filter(Boolean).join(" ").trim();
  if (!q) return null;
  const results = await searchSaavn(q, 5);
  const hit = results.tracks.find((t) => t.streamUrl);
  if (!hit?.streamUrl) return null;
  return { streamUrl: hit.streamUrl, duration: hit.duration };
}
