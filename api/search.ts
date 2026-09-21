import { searchItunes } from "../src/lib/gmax/itunes";
import { searchYouTube } from "../src/lib/gmax/youtube.server";
import { searchSaavn } from "../src/lib/gmax/saavn";
import type { SearchResults, Track } from "../src/lib/gmax/types";
import { emptySearchResults } from "../src/lib/gmax/types";

type Req = {
  method?: string;
  body?: { query?: string; limit?: number };
};
type Res = {
  setHeader: (k: string, v: string) => void;
  status: (n: number) => Res;
  json: (v: unknown) => void;
  end: () => void;
};

function titleKey(track: Track): string {
  return `${track.title}\n${track.artist.name}`.toLowerCase();
}

/**
 * Priority:
 * 1. Saavn tracks with full streamUrl (full song)
 * 2. YouTube tracks with videoId (full song via iframe)
 * 3. iTunes tracks (30s preview only)
 */
function mergeAll(
  saavn: Track[],
  youtube: Track[],
  itunes: Track[],
  limit: number,
): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];

  const push = (t: Track) => {
    const key = titleKey(t);
    const titleOnly = t.title.toLowerCase();
    if (seen.has(key) || seen.has(titleOnly)) return false;
    seen.add(key);
    seen.add(titleOnly);
    out.push(t);
    return out.length >= limit;
  };

  for (const t of saavn.filter((x) => x.streamUrl)) {
    if (push(t)) return out;
  }
  for (const t of youtube.filter((x) => x.videoId)) {
    if (push(t)) return out;
  }
  for (const t of saavn) {
    if (push(t)) return out;
  }
  for (const t of youtube) {
    if (push(t)) return out;
  }
  for (const t of itunes) {
    if (push(t)) return out;
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

  const [saavn, yt, itunes] = await Promise.allSettled([
    searchSaavn(query, limit),
    searchYouTube(query, limit),
    searchItunes(query, limit),
  ]);

  const saavnTracks: Track[] =
    saavn.status === "fulfilled" ? saavn.value.tracks : [];
  const ytTracks: Track[] = yt.status === "fulfilled" ? yt.value : [];
  const itunesResults: SearchResults =
    itunes.status === "fulfilled" ? itunes.value : emptySearchResults(query);

  const payload: SearchResults = {
    query,
    tracks: mergeAll(saavnTracks, ytTracks, itunesResults.tracks, limit),
    artists: itunesResults.artists,
    albums: itunesResults.albums,
  };

  res.setHeader("X-Gmax-Saavn-Count", String(saavnTracks.length));
  res.setHeader("X-Gmax-Yt-Count", String(ytTracks.length));
  res.setHeader("X-Gmax-Itunes-Count", String(itunesResults.tracks.length));

  return res.status(200).json(payload);
}
