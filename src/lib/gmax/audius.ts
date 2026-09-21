import { normalizeTrack } from "./normalize";
import { safeText } from "./text";
import type { SearchResults, Track } from "./types";
import { emptySearchResults } from "./types";

const APP = "GMAXPlayer";
const BASES = [
  "https://discoveryprovider.audius.co",
  "https://api.audius.co",
];

type AnyRec = Record<string, unknown>;

function asRec(v: unknown): AnyRec | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AnyRec) : null;
}

function artworkUrl(art: unknown): string {
  const rec = asRec(art);
  if (!rec) return "";
  return (
    safeText(rec["1000x1000"]) ||
    safeText(rec["480x480"]) ||
    safeText(rec["150x150"]) ||
    ""
  );
}

function streamUrlFor(id: string): string {
  return `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(id)}/stream?app_name=${APP}`;
}

function mapTrack(raw: unknown): Track | null {
  const item = asRec(raw);
  if (!item) return null;
  const id = safeText(item.id) || String(item.track_id ?? "");
  const title = safeText(item.title);
  if (!id || !title) return null;
  const user = asRec(item.user);
  const artistName = safeText(user?.name) || safeText(user?.handle) || "Unknown artist";
  const duration = Number(item.duration) || 0;

  return normalizeTrack({
    id: `audius:${id}`,
    title,
    artistName,
    albumImageUrl: artworkUrl(item.artwork),
    duration,
    provider: "audius",
    sourceId: id,
    streamUrl: streamUrlFor(id),
  });
}

async function fetchJson(url: string): Promise<unknown | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
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

export async function searchAudius(
  query: string,
  limit = 25,
): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return emptySearchResults();

  for (const base of BASES) {
    const url = `${base}/v1/tracks/search?query=${encodeURIComponent(q)}&app_name=${APP}&limit=${Math.min(50, limit)}`;
    const data = await fetchJson(url);
    const rec = asRec(data);
    const list = Array.isArray(rec?.data) ? (rec!.data as unknown[]) : Array.isArray(data) ? (data as unknown[]) : [];
    if (!list.length) continue;

    const tracks: Track[] = [];
    const seen = new Set<string>();
    for (const raw of list) {
      const track = mapTrack(raw);
      if (!track || seen.has(track.id)) continue;
      seen.add(track.id);
      tracks.push(track);
      if (tracks.length >= limit) break;
    }
    if (tracks.length) {
      return { query: q, tracks, artists: [], albums: [] };
    }
  }
  return emptySearchResults(q);
}

export async function resolveAudiusStream(
  title: string,
  artist: string,
): Promise<{ streamUrl: string; duration?: number } | null> {
  const q = [artist, title].filter(Boolean).join(" ").trim() || title.trim();
  if (!q) return null;
  const results = await searchAudius(q, 8);
  const lower = title.toLowerCase();
  const hit =
    results.tracks.find(
      (t) => t.streamUrl && t.title.toLowerCase().includes(lower.slice(0, 10)),
    ) || results.tracks.find((t) => t.streamUrl);
  if (!hit?.streamUrl) return null;
  return { streamUrl: hit.streamUrl, duration: hit.duration };
}
