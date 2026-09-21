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
  const item = rec.musicResponsiveListItemRenderer;
  if (item && typeof item === "object") {
    out.push(item as AnyRec);
    return;
  }
  const video = rec.videoRenderer;
  if (video && typeof video === "object") {
    out.push({ __video: video });
    return;
  }
  for (const v of Object.values(rec)) walkRenderers(v, out);
}

function runsText(node: unknown): string {
  const rec = asRec(node);
  if (!rec) return "";
  const text = rec.text;
  if (typeof text === "string") return text;
  const inner = asRec(text);
  const runs = (inner?.runs ?? rec.runs) as unknown;
  if (!Array.isArray(runs)) return safeText(rec.simpleText);
  return runs
    .map((r) => safeText(asRec(r)?.text))
    .filter(Boolean)
    .join("");
}

function flexColumn(item: AnyRec, i: number): unknown {
  const cols = item.flexColumns;
  if (!Array.isArray(cols)) return undefined;
  const col = asRec(cols[i]);
  return col?.musicResponsiveListItemFlexColumnRenderer;
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
  if (item.__video) {
    return safeText(asRec(item.__video)?.videoId);
  }
  const fromData = asRec(item.playlistItemData);
  if (fromData?.videoId) return safeText(fromData.videoId);

  const col0 = asRec(flexColumn(item, 0));
  const run0 = Array.isArray(asRec(col0?.text)?.runs)
    ? asRec((asRec(col0?.text)?.runs as unknown[])[0])
    : null;
  const watch = asRec(asRec(run0?.navigationEndpoint)?.watchEndpoint);
  if (watch?.videoId) return safeText(watch.videoId);

  const overlay = asRec(
    asRec(
      asRec(asRec(item.overlay)?.musicItemThumbnailOverlayRenderer)?.content,
    )?.musicPlayButtonRenderer,
  );
  const playWatch = asRec(asRec(overlay?.playNavigationEndpoint)?.watchEndpoint);
  if (playWatch?.videoId) return safeText(playWatch.videoId);

  const nav = asRec(asRec(item.navigationEndpoint)?.watchEndpoint);
  return safeText(nav?.videoId);
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
  const artistName = parts[0] || "Unknown artist";
  const album = parts.length > 1 ? parts[1] : undefined;
  return normalizeTrack({
    id: `youtube:${videoId}`,
    title,
    artistName,
    albumImageUrl: pickThumb(item),
    provider: "youtube",
    sourceId: videoId,
    videoId,
    album,
  });
}

function parseVideoRenderer(wrapper: AnyRec): Track | null {
  const video = asRec(wrapper.__video);
  if (!video) return null;
  const videoId = safeText(video.videoId);
  if (!videoId) return null;
  const title = runsText(video.title) || safeText(asRec(video.title)?.simpleText);
  const artistName =
    runsText(video.ownerText) ||
    runsText(video.shortBylineText) ||
    "Unknown artist";
  return normalizeTrack({
    id: `youtube:${videoId}`,
    title,
    artistName,
    albumImageUrl: pickThumb(wrapper),
    provider: "youtube",
    sourceId: videoId,
    videoId,
    isVideo: true,
  });
}

async function postJson(url: string, body: unknown, timeoutMs = 10000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
    if (!res.ok) throw new Error(`YouTube ${res.status}`);
    return await res.json();
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
    if (!track) continue;
    if (seen.has(track.id)) continue;
    seen.add(track.id);
    tracks.push(track);
  }
  return tracks;
}

export async function searchYouTube(query: string, limit = 25): Promise<Track[]> {
  const q = query.trim();
  if (!q) return [];

  try {
    const music = await postJson(YT_MUSIC, {
      context: {
        client: {
          clientName: "WEB_REMIX",
          clientVersion: "1.20240101.01.00",
          hl: "en",
          gl: "US",
        },
      },
      query: q,
      params: SONGS_PARAMS,
    });
    const tracks = parseResponse(music).slice(0, limit);
    if (tracks.length) return tracks;
  } catch {
    /* fall through to youtube.com */
  }

  try {
    const web = await postJson(YT_WEB, {
      context: {
        client: {
          clientName: "WEB",
          clientVersion: "2.20240101.00.00",
          hl: "en",
          gl: "US",
        },
      },
      query: `${q} official audio`,
    });
    return parseResponse(web).slice(0, limit);
  } catch {
    return [];
  }
}

export async function resolveYouTubeVideo(
  title: string,
  artist: string,
): Promise<string | null> {
  const q = `${safeText(artist)} ${safeText(title)} official audio`.trim();
  if (!q) return null;
  const tracks = await searchYouTube(q, 5);
  return tracks[0]?.videoId ?? null;
}
