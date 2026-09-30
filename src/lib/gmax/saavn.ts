/** Saavn search + strict stream resolve (exact title match preferred). */

import { normalizeTrack } from "./normalize";
import type { SearchResults, Track } from "./types";
import { emptySearchResults } from "./types";

export type SaavnResolved = {
  streamUrl: string;
  duration?: number;
  title?: string;
  artist?: string;
};

function pickStream(downloadUrl: unknown): string {
  if (typeof downloadUrl === "string" && downloadUrl.startsWith("http")) return downloadUrl;
  if (!Array.isArray(downloadUrl)) return "";
  let best = "";
  let score = -1;
  for (const item of downloadUrl) {
    if (typeof item === "string" && item.startsWith("http")) {
      if (!best) best = item;
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const q = String((item as { quality?: string }).quality || "").toLowerCase();
    const url =
      (item as { url?: string; link?: string }).url ||
      (item as { link?: string }).link ||
      "";
    if (!url) continue;
    let s = 1;
    if (q.includes("320")) s = 320;
    else if (q.includes("160")) s = 160;
    else if (q.includes("96")) s = 96;
    if (s > score) {
      score = s;
      best = url;
    }
  }
  return best;
}

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/official|video|lyrics|audio|slowed|reverb|remix|full song/gi, " ")
    .replace(/[^a-z0-9\u0900-\u097f\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreMatch(
  wantTitle: string,
  wantArtist: string,
  gotTitle: string,
  gotArtist: string,
): number {
  const wt = norm(wantTitle);
  const gt = norm(gotTitle);
  if (!wt || !gt) return 0;
  let s = 0;
  if (gt === wt) s += 100;
  else if (gt.includes(wt) || wt.includes(gt)) s += 70;
  else {
    const wWords = wt.split(" ").filter((w) => w.length > 2);
    const hits = wWords.filter((w) => gt.includes(w)).length;
    if (wWords.length) s += (hits / wWords.length) * 40;
  }
  const wa = norm(wantArtist);
  const ga = norm(gotArtist);
  if (wa && ga) {
    if (ga === wa || ga.includes(wa) || wa.includes(ga)) s += 40;
    else {
      const parts = wa.split(/[,&]|\s+/).filter((p) => p.length > 2);
      if (parts.some((p) => ga.includes(p))) s += 20;
    }
  }
  return s;
}

function artistFromItem(item: Record<string, unknown>): string {
  if (typeof item.primaryArtists === "string") return item.primaryArtists;
  const artists = item.artists as { primary?: { name?: string }[] } | undefined;
  if (artists?.primary?.length) {
    return artists.primary.map((x) => x.name || "").filter(Boolean).join(", ");
  }
  return "";
}

function mapSaavnTrack(item: Record<string, unknown>): Track | null {
  const id = String(item.id || item.token || "");
  const title = String(item.name || item.title || "");
  if (!id || !title) return null;
  const artist = artistFromItem(item) || "Unknown";
  const image =
    (Array.isArray(item.image) &&
      (item.image as { url?: string }[]).slice(-1)[0]?.url) ||
    (typeof item.image === "string" ? item.image : "") ||
    "";
  const streamUrl =
    pickStream(item.downloadUrl) ||
    pickStream(item.download_url) ||
    (typeof item.media_url === "string" ? item.media_url : "") ||
    "";

  return normalizeTrack({
    id: `saavn:${id}`,
    title,
    artistName: artist,
    albumImageUrl: typeof image === "string" ? image.replace(/50x50|150x150/, "500x500") : "",
    duration: Number(item.duration) || 0,
    provider: "saavn",
    sourceId: id,
    streamUrl: streamUrl.startsWith("http") ? streamUrl : undefined,
    album: typeof item.album === "string" ? item.album : undefined,
  });
}

const BASES = [
  "https://jiosaavn-api-taupe.vercel.app",
  "https://saavn-api.vercel.app",
];

export async function searchSaavn(
  query: string,
  limit = 25,
): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return emptySearchResults();

  for (const base of BASES) {
    try {
      const res = await fetch(
        `${base}/search/songs?query=${encodeURIComponent(q)}&limit=${Math.min(50, limit)}`,
      );
      if (!res.ok) continue;
      const data = await res.json();
      const results =
        data?.data?.results ||
        data?.results ||
        (Array.isArray(data?.data) ? data.data : null);
      if (!Array.isArray(results) || !results.length) continue;

      const tracks: Track[] = [];
      const seen = new Set<string>();
      for (const raw of results) {
        if (!raw || typeof raw !== "object") continue;
        const track = mapSaavnTrack(raw as Record<string, unknown>);
        if (!track || seen.has(track.id)) continue;
        seen.add(track.id);
        tracks.push(track);
        if (tracks.length >= limit) break;
      }
      if (tracks.length) {
        return { query: q, tracks, artists: [], albums: [] };
      }
    } catch {
      /* next base */
    }
  }
  return emptySearchResults(q);
}

export async function resolveSaavnStream(
  title: string,
  artist = "",
): Promise<SaavnResolved | null> {
  const q = [title, artist].filter(Boolean).join(" ").trim();
  if (!q) return null;

  for (const base of BASES) {
    try {
      const res = await fetch(
        `${base}/search/songs?query=${encodeURIComponent(q)}&limit=8`,
      );
      if (!res.ok) continue;
      const data = await res.json();
      const results =
        data?.data?.results ||
        data?.results ||
        (Array.isArray(data?.data) ? data.data : null);
      if (!Array.isArray(results) || !results.length) continue;

      let best: Record<string, unknown> | null = null;
      let bestScore = 0;
      for (const item of results) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        const t = String(rec.name || rec.title || "");
        const a = artistFromItem(rec);
        const sc = scoreMatch(title, artist, t, a);
        if (sc > bestScore) {
          bestScore = sc;
          best = rec;
        }
      }

      if (!best || bestScore < 50) continue;

      const streamUrl =
        pickStream(best.downloadUrl) ||
        pickStream(best.download_url) ||
        (typeof best.media_url === "string" ? best.media_url : "") ||
        "";
      if (!streamUrl.startsWith("http")) continue;

      return {
        streamUrl,
        duration: Number(best.duration) || undefined,
        title: String(best.name || best.title || ""),
        artist: artistFromItem(best),
      };
    } catch {
      /* try next base */
    }
  }
  return null;
}
