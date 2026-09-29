/**
 * YouTube Music search via Innertube (same backend idea as ytmusicapi, but Node).
 * ytmusicapi is Python-only — cannot run on Vercel serverless as-is.
 * Returns videoIds for HTML5 / existing stream pipeline.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

function walk(node, out) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const n of node) walk(n, out);
    return;
  }
  if (typeof node !== 'object') return;
  if (node.musicResponsiveListItemRenderer || node.playlistPanelVideoRenderer) {
    out.push(node.musicResponsiveListItemRenderer || node.playlistPanelVideoRenderer);
    return;
  }
  for (const v of Object.values(node)) walk(v, out);
}

function runsText(runs) {
  if (!runs) return '';
  if (typeof runs === 'string') return runs;
  if (Array.isArray(runs)) return runs.map((r) => r.text || '').join('');
  if (runs.runs) return runs.runs.map((r) => r.text || '').join('');
  return runs.simpleText || '';
}

function mapItem(item) {
  try {
    const vid =
      item.playlistVideoId ||
      item.videoId ||
      item.navigationEndpoint?.watchEndpoint?.videoId ||
      item.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]
        ?.navigationEndpoint?.watchEndpoint?.videoId;
    if (!vid) return null;
    const title =
      runsText(item.title) ||
      runsText(item.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text) ||
      'Unknown';
    const artist =
      runsText(item.longBylineText) ||
      runsText(item.shortBylineText) ||
      runsText(item.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text) ||
      'YouTube Music';
    const thumbs = item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
      item.thumbnail?.thumbnails ||
      [];
    const thumb = thumbs.length ? thumbs[thumbs.length - 1].url : '';
    return {
      id: `ytmusic:${vid}`,
      title,
      artist,
      thumbnail: thumb.startsWith('//') ? `https:${thumb}` : thumb,
      videoId: vid,
      provider: 'youtube',
      sourceId: vid,
    };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const body = req.method === 'POST' ? parseBody(req) : {};
  const q = String(req.query?.q || body.query || body.q || '').trim();
  const limit = Math.min(30, Math.max(1, Number(req.query?.limit || body.limit) || 20));
  if (!q) return res.status(200).json({ success: true, tracks: [] });

  try {
    const r = await fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UA,
        Origin: 'https://music.youtube.com',
        Referer: 'https://music.youtube.com/',
        'X-Goog-EOM-Visitor-Id': 'CgtGMAX',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB_REMIX',
            clientVersion: '1.20250317.01.00',
            hl: 'en',
            gl: 'IN',
          },
        },
        query: q,
        params: 'EgWKAQIIAWoQEAMQBBAJEAoQBRAQEBU%3D', // songs filter
      }),
    });

    if (!r.ok) {
      return res.status(200).json({ success: false, tracks: [], error: 'YT Music search failed' });
    }

    const data = await r.json();
    const items = [];
    walk(data, items);
    const tracks = [];
    const seen = new Set();
    for (const raw of items) {
      const t = mapItem(raw);
      if (!t || seen.has(t.videoId)) continue;
      seen.add(t.videoId);
      tracks.push(t);
      if (tracks.length >= limit) break;
    }

    return res.status(200).json({ success: true, query: q, tracks });
  } catch (err) {
    return res.status(200).json({
      success: false,
      tracks: [],
      error: err?.message || 'search error',
    });
  }
}
