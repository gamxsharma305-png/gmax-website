import { normalizeTrack } from "./normalize";
import { safeText } from "./text";
import type { SearchResults, Track } from "./types";
import { emptySearchResults } from "./types";

/** Multiple mirrors — primary often rate-limits / goes down */
const SAAVN_BASES = [
  "https://jiosaavn-api-taupe.vercel.app",
  "https://saavn-api.vercel.app",
  "https://saavn.sumit.co/api",
];

type AnyRec = Record<string, unknown>;

function asRec(v: unknown): AnyRec | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AnyRec) : null;
}

function pickImage(images: unknown): string {
  if (!Array.isArray(images) || !images.length) return "";
  for (let i = images.length - 1; i >= 0; i--) {
    const rec = asRec(images[i]);
    if (!rec) continue;
    const url = safeText(rec.url) || safeText(rec.link);
    if (url) return url;
  }
  return "";
}

function pickStream(downloadUrl: unknown): string {
  if (typeof downloadUrl === "string" && downloadUrl.startsWith("http")) {
    return downloadUrl;
  }
  if (!Array.isArray(downloadUrl) || !downloadUrl.length) return "";
  let best = "";
  let bestScore = -1;
  for (const item of downloadUrl) {
    if (typeof item === "string" && item.startsWith("http")) {
      if (!best) best = item;
      continue;
    }
    const rec = asRec(item);
    if (!rec) continue;
    const q = safeText(rec.quality).toLowerCase();
    const url = safeText(rec.url) || safeText(rec.link);
    if (!url) continue;
    let score = 0;
    if (q.includes("320")) score = 320;
    else if (q.includes("160")) score = 160;
    else if (q.includes("96")) score = 96;
    else if (q.includes("48")) score = 48;
    else score = 1;
    if (score > bestScore) {
      bestScore = score;
      best = url;
    }
  }
  return best;
}

function primaryArtist(item: AnyRec): string {
  const flat = safeText(item.primaryArtists);
  if (flat) return flat;
  const artists = asRec(item.artists);
  const primary = artists?.primary;
  if (Array.isArray(primary) && primary.length) {
    return (
      primary
        .map((a) => safeText(asRec(a)?.name))
        .filter(Boolean)
        .join(", ") || "Unknown artist"
    );
  }
  const subtitle = safeText(item.subtitle);
  if (subtitle) {
    const part = subtitle.split("-")[0]?.trim();
    if (part) return part;
  }
  return "Unknown artist";
}

function mapSong(raw: unknown): Track | null {
  const item = asRec(raw);
  if (!item) return null;
  const id = safeText(item.id);
  const title = safeText(item.name) || safeText(item.title);
  if (!id || !title) return null;

  const streamUrl =
    pickStream(item.downloadUrl) ||
    pickStream(item.download_url) ||
    safeText(item.media_url) ||
    safeText(item.mediaUrl) ||
    "";

  const image =
    pickImage(item.image) ||
    pickImage(asRec(item.album)?.image) ||
    safeText(item.image) ||
    "";

  const duration = Number(item.duration) || 0;
  const albumRec = asRec(item.album);
  const albumName = safeText(albumRec?.name) || safeText(item.album);

  return normalizeTrack({
    id: `saavn:${id}`,
    title,
    artistName: primaryArtist(item),
    albumImageUrl: image,
    duration,
    provider: "saavn",
    sourceId: id,
    album: albumName || undefined,
    streamUrl: streamUrl || undefined,
    explicit: Boolean(item.explicitContent),
  });
}

async function fetchJson(url: string, timeoutMs = 12000): Promise<unknown | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; GMAX/1.0)",
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function extractResults(data: unknown): unknown[] {
  const rec = asRec(data);
  if (!rec) return [];
  const dataRec = asRec(rec.data);
  if (dataRec && Array.isArray(dataRec.results)) return dataRec.results;
  if (Array.isArray(dataRec?.results)) return dataRec.results as unknown[];
  if (Array.isArray(rec.data)) return rec.data as unknown[];
  if (Array.isArray(rec.results)) return rec.results;
  if (Array.isArray(data)) return data as unknown[];
  if (Array.isArray(rec)) return rec as unknown[];
  return [];
}

async function searchOnBase(base: string, query: string, limit: number): Promise<Track[]> {
  const paths = [
    `${base}/search/songs?query=${encodeURIComponent(query)}&limit=${Math.min(50, limit)}`,
    `${base}/api/search/songs?query=${encodeURIComponent(query)}&limit=${Math.min(50, limit)}`,
  ];
  for (const url of paths) {
    const data = await fetchJson(url);
    if (!data) continue;
    const results = extractResults(data);
    if (!results.length) continue;
    const tracks: Track[] = [];
    const seen = new Set<string>();
    for (const raw of results) {
      const track = mapSong(raw);
      if (!track || seen.has(track.id)) continue;
      seen.add(track.id);
      tracks.push(track);
      if (tracks.length >= limit) break;
    }
    if (tracks.length) return tracks;
  }
  return [];
}

async function songById(base: string, id: string): Promise<Track | null> {
  const paths = [
    `${base}/songs?id=${encodeURIComponent(id)}`,
    `${base}/api/songs/${encodeURIComponent(id)}`,
    `${base}/songs/${encodeURIComponent(id)}`,
  ];
  for (const url of paths) {
    const data = await fetchJson(url);
    if (!data) continue;
    const results = extractResults(data);
    const first = results[0] ?? asRec(data)?.data ?? data;
    const mapped = mapSong(first);
    if (mapped?.streamUrl) return mapped;
  }
  return null;
}

async function enrichWithStream(track: Track): Promise<Track> {
  if (track.streamUrl) return track;
  const id = track.sourceId;
  if (!id) return track;
  for (const base of SAAVN_BASES) {
    const full = await songById(base, id);
    if (full?.streamUrl) {
      return {
        ...track,
        streamUrl: full.streamUrl,
        duration: full.duration || track.duration,
        albumImageUrl: track.albumImageUrl || full.albumImageUrl,
      };
    }
  }
  return track;
}

export async function searchSaavn(
  query: string,
  limit = 25,
): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return emptySearchResults();

  let tracks: Track[] = [];
  for (const base of SAAVN_BASES) {
    tracks = await searchOnBase(base, q, limit);
    if (tracks.length) break;
  }
  if (!tracks.length) return emptySearchResults(q);

  const enriched = await Promise.all(
    tracks.slice(0, Math.min(tracks.length, 20)).map((t) => enrichWithStream(t)),
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
  const q = [artist, title].filter(Boolean).join(" ").trim() || title.trim();
  if (!q) return null;
  const results = await searchSaavn(q, 8);
  const lower = title.toLowerCase();
  const hit =
    results.tracks.find(
      (t) => t.streamUrl && t.title.toLowerCase().includes(lower.slice(0, 12)),
    ) || results.tracks.find((t) => t.streamUrl);
  if (!hit?.streamUrl) return null;
  return { streamUrl: hit.streamUrl, duration: hit.duration };
}
