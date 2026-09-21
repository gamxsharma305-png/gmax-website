import { searchItunes } from "../src/lib/gmax/itunes";
import { searchYouTube } from "../src/lib/gmax/youtube.server";
import type { SearchResults, Track } from "../src/lib/gmax/types";
import { emptySearchResults } from "../src/lib/gmax/types";

type Req = { method?: string; body?: { query?: string; limit?: number } };
type Res = {
  setHeader: (k: string, v: string) => void;
  status: (n: number) => Res;
  json: (v: unknown) => void;
  end: () => void;
};

function titleKey(track: Track): string {
  return `${track.title}\n${track.artist.name}`.toLowerCase();
}

function mergeTracks(youtube: Track[], itunes: Track[], limit: number): Track[] {
  const previews = new Map<string, Track>();
  for (const t of itunes) {
    const k = t.title.toLowerCase();
    if (t.previewUrl && !previews.has(k)) previews.set(k, t);
  }

  const seen = new Set<string>();
  const out: Track[] = [];

  for (const t of youtube) {
    const key = titleKey(t);
    if (seen.has(key) || seen.has(t.title.toLowerCase())) continue;
    seen.add(key);
    seen.add(t.title.toLowerCase());
    const match = previews.get(t.title.toLowerCase());
    out.push(
      match?.previewUrl
        ? { ...t, previewUrl: match.previewUrl, duration: t.duration || match.duration }
        : t,
    );
    if (out.length >= limit) return out;
  }

  for (const t of itunes) {
    const key = titleKey(t);
    if (seen.has(key) || seen.has(t.title.toLowerCase())) continue;
    seen.add(key);
    seen.add(t.title.toLowerCase());
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const query = String(req.body?.query ?? "").trim();
  const limit = Math.min(50, Math.max(1, Number(req.body?.limit) || 25));
  if (!query) return res.status(200).json(emptySearchResults());

  const [yt, itunes] = await Promise.allSettled([
    searchYouTube(query, limit),
    searchItunes(query, limit),
  ]);

  const ytTracks: Track[] = yt.status === "fulfilled" ? yt.value : [];
  const itunesResults: SearchResults =
    itunes.status === "fulfilled" ? itunes.value : emptySearchResults(query);

  const payload: SearchResults = {
    query,
    tracks: mergeTracks(ytTracks, itunesResults.tracks, limit),
    artists: itunesResults.artists,
    albums: itunesResults.albums,
  };
  return res.status(200).json(payload);
}
