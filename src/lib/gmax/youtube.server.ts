import { normalizeTrack } from "./normalize";
import { safeText } from "./text";
import type { Track } from "./types";

const YT_MUSIC = "https://music.youtube.com/youtubei/v1/search?prettyPrint=false";
const YT_WEB = "https://www.youtube.com/youtubei/v1/search?prettyPrint=false";
const SONGS_PARAMS = "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D";

type AnyRec = Record<string, unknown>;

function asRec(v: unknown): AnyRec | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AnyRec) : null;
}

function walkRenderers(node: unknown, out: AnyRec[]) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const n of node) walkRenderers(n, out);
    return;
  }
  const rec = asRec(node);
  if (!rec) return;
  if (rec.musicResponsiveListItemRenderer) {
    out.push(rec.musicResponsiveListItemRenderer as AnyRec);
    return;
  }
  if (rec.videoRenderer) {
    out.push({ __video: rec.videoRenderer });
    return;
  }
  for (const v of Object.values(rec)) walkRenderers(v, out);
}

function runsText(node: unknown): string {
  const rec = asRec(node);
  if (!rec) return "";
  if (typeof rec.text === "string") return rec.text;
  const inner = asRec(rec.text);
  const runs = (inner?.runs ?? rec.runs) as unknown;
  if (!Array.isArray(runs)) return safeText(rec.simpleText);
  return runs.map((r) => safeText(asRec(r)?.text)).filter(Boolean).join("");
}

function flexColumn(item: AnyRec, i: number): unknown {
  const cols = item.flexColumns;
  if (!Array.isArray(cols)) return undefined;
  return asRec(cols[i])?.musicResponsiveListItemFlexColumnRenderer;
}

function pickThumb(item: AnyRec): string {
  const paths = [
    asRec(asRec(asRec(item.thumbnail)?.musicThumbnailRenderer)?.thumbnail)?.thumbnails,
    asRec(item.thumbnail)?.thumbnails,
    asRec(asRec(item.__video as AnyRec)?.thumbnail)?.thumbnails,
  ];
  for (const list of paths) {
    if (!Array.isArray(list) || !list.length) continue;
    const last = asRec(list[list.length - 1]);
    const url = safeText(last?.url);
    if (url) return url.startsWith("//") ? `https:${url}` : url;
  }
  return "";
}

function videoIdOf(item: AnyRec): string {
  if (item.__video) return safeText(asRec(item.__video)?.videoId);
  const fromData = asRec(item.playlistItemData);
  if (fromData?.videoId) return safeText(fromData.videoId);
  const col0 = asRec(flexColumn(item, 0));
  const runs = asRec(col0?.text)?.runs;
  const run0 = Array.isArray(runs) ? asRec(runs[0]) : null;
  const watch = asRec(asRec(run0?.navigationEndpoint)?.watchEndpoint);
  if (watch?.videoId) return safeText(watch.videoId);
  const overlay = asRec(
    asRec(asRec(asRec(item.overlay)?.musicItemThumbnailOverlayRenderer)?.content)
      ?.musicPlayButtonRenderer,
  );
  const playWatch = asRec(asRec(overlay?.playNavigationEndpoint)?.watchEndpoint);
  if (playWatch?.videoId) return safeText(playWatch.videoId);
  return safeText(asRec(asRec(item.navigationEndpoint)?.watchEndpoint)?.videoId);
}

function parseMusicItem(item: AnyRec): Track | null {
  const videoId = videoIdOf(item);
  if (!videoId) return null;
  const title = runsText(flexColumn(item, 0)) || safeText(asRec(item.title)?.simpleText);
  const subtitle = runsText(flexColumn(item, 1));
  const parts = subtitle
    .split("•")
    .map((s) => s.trim())
    .filter((s) => s && s !== "Song" && s !== "Video" && !/^\d+:\d{2}/.test(s));
  return normalizeTrack({
    id: `youtube:${videoId}`,
    title,
    artistName: parts[0] || "Unknown artist",
    albumImageUrl: pickThumb(item),
    provider: "youtube",
    sourceId: videoId,
    videoId,
    album: parts.length > 1 ? parts[1] : undefined,
  });
}

function parseVideoRenderer(wrapper: AnyRec): Track | null {
  const video = asRec(wrapper.__video);
  if (!video) return null;
  const videoId = safeText(video.videoId);
  if (!videoId) return null;
  return normalizeTrack({
    id: `youtube:${videoId}`,
    title: runsText(video.title) || safeText(asRec(video.title)?.simpleText),
    artistName:
      runsText(video.ownerText) || runsText(video.shortBylineText) || "Unknown artist",
    albumImageUrl: pickThumb(wrapper),
    provider: "youtube",
    sourceId: videoId,
    videoId,
    isVideo: true,
  });
}

async function postJson(url: string, body: unknown, timeoutMs = 9000): Promise<unknown | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Origin: url.includes("music.youtube")
          ? "https://music.youtube.com"
          : "https://www.youtube.com",
        Referer: url.includes("music.youtube")
          ? "https://music.youtube.com/"
          : "https://www.youtube.com/",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function parseResponse(data: unknown): Track[] {
  const items: AnyRec[] = [];
  walkRenderers(data, items);
  const tracks: Track[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const track = item.__video ? parseVideoRenderer(item) : parseMusicItem(item);
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    tracks.push(track);
  }
  return tracks;
}

export async function searchYouTube(query: string, limit = 25): Promise<Track[]> {
  const q = query.trim();
  if (!q) return [];

  const music = await postJson(YT_MUSIC, {
    context: {
      client: {
        clientName: "WEB_REMIX",
        clientVersion: "1.20250317.01.00",
        hl: "en",
        gl: "IN",
      },
    },
    query: q,
    params: SONGS_PARAMS,
  });
  if (music) {
    const tracks = parseResponse(music).slice(0, limit);
    if (tracks.length) return tracks;
  }

  const web = await postJson(YT_WEB, {
    context: {
      client: {
        clientName: "WEB",
        clientVersion: "2.20250317.01.00",
        hl: "en",
        gl: "IN",
      },
    },
    query: `${q} official audio`,
  });
  if (web) return parseResponse(web).slice(0, limit);
  return [];
}

export async function resolveYouTubeVideo(
  title: string,
  artist: string,
): Promise<string | null> {
  const t = safeText(title);
  const a = safeText(artist);
  if (!t) return null;
  for (const q of [
    a ? `${a} ${t} official audio` : `${t} official audio`,
    a ? `${a} ${t}` : t,
  ]) {
    const tracks = await searchYouTube(q, 5);
    if (tracks[0]?.videoId) return tracks[0].videoId;
  }
  return null;
}
