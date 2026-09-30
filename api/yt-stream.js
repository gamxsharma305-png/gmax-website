/**
 * GET/POST /api/yt-stream
 * Query/body: { q?: song name, url?: youtube url, videoId?: id }
 *
 * Flow:
 *  1) Resolve song name → YouTube URL (Piped search / youtubei)
 *  2) Cobalt instances (audio mp3) — official needs self-host or JWT
 *  3) Piped audioStreams fallback
 *
 * Env (optional):
 *  COBALT_API_URL=https://your-cobalt-instance/
 *  COBALT_API_KEY=Bearer token if instance requires it
 */

const COBALT_INSTANCES = [
  process.env.COBALT_API_URL,
  'https://api.cobalt.tools/',
  'https://cobalt-backend.vercel.app/',
].filter(Boolean);

const PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://api.piped.private.coffee',
  'https://pipedapi.adminforge.de',
];

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

function extractVideoId(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(
    /(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/v\/)([\w-]{11})|([\w-]{11})/,
  );
  return m?.[1] || m?.[2] || null;
}

function youtubeUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

async function fetchJson(url, options = {}, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json, text };
  } catch (e) {
    return { ok: false, status: 0, json: null, error: e?.message };
  } finally {
    clearTimeout(t);
  }
}

async function searchYouTubeId(query) {
  // Piped search first
  for (const base of PIPED) {
    const r = await fetchJson(
      `${base}/search?q=${encodeURIComponent(query)}&filter=videos`,
      {},
      8000,
    );
    const items = r.json?.items || r.json?.results || [];
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      const id =
        extractVideoId(it.url || it.id || '') ||
        (typeof it.id === 'string' && it.id.length === 11 ? it.id : null);
      if (id) {
        return {
          videoId: id,
          title: it.title || query,
          thumbnail: it.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          author: it.uploaderName || it.uploader || '',
        };
      }
    }
  }

  // youtubei web search fallback
  const r = await fetchJson(
    'https://www.youtube.com/youtubei/v1/search?prettyPrint=false',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20250317.01.00',
            hl: 'en',
            gl: 'IN',
          },
        },
        query,
      }),
    },
    12000,
  );
  const str = JSON.stringify(r.json || {});
  const m = str.match(/"videoId":"([\w-]{11})"/);
  if (m) {
    return {
      videoId: m[1],
      title: query,
      thumbnail: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`,
      author: '',
    };
  }
  return null;
}

function pickCobaltUrl(json) {
  if (!json || typeof json !== 'object') return null;
  // status: tunnel | redirect | stream | picker | error
  if (json.status === 'error') return null;
  const url =
    json.url ||
    json.audio ||
    json.tunnel ||
    (Array.isArray(json.tunnel) ? json.tunnel[0] : null) ||
    json.data?.url ||
    null;
  if (typeof url === 'string' && url.startsWith('http')) {
    return {
      url,
      filename: json.filename || json.data?.filename || '',
      status: json.status || 'ok',
    };
  }
  return null;
}

async function tryCobalt(videoUrl) {
  const body = {
    url: videoUrl,
    downloadMode: 'audio',
    audioFormat: 'mp3',
    audioBitrate: '128',
    filenameStyle: 'pretty',
  };
  const key = process.env.COBALT_API_KEY || '';

  for (const base of COBALT_INSTANCES) {
    const endpoint = base.endsWith('/') ? base : base + '/';
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (key) headers.Authorization = key.startsWith('Bearer') ? key : `Bearer ${key}`;

    const r = await fetchJson(
      endpoint,
      { method: 'POST', headers, body: JSON.stringify(body) },
      15000,
    );
    const hit = pickCobaltUrl(r.json);
    if (hit) {
      return { ...hit, source: 'cobalt', instance: endpoint };
    }
  }
  return null;
}

function pickPipedAudio(streams) {
  if (!Array.isArray(streams)) return null;
  const scored = streams
    .map((s) => {
      const url = s.url || s.s || '';
      if (!url.startsWith('http')) return null;
      const mime = String(s.mimeType || s.mime_type || '');
      const br = Number(s.bitrate || 0);
      let score = br;
      if (/mp4|m4a|aac/i.test(mime)) score += 50000;
      return { url, mimeType: mime, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

async function tryPiped(videoId) {
  for (const base of PIPED) {
    const r = await fetchJson(`${base}/streams/${encodeURIComponent(videoId)}`, {}, 10000);
    if (!r.json) continue;
    const audio = pickPipedAudio(r.json.audioStreams || r.json.audio_streams);
    if (audio?.url) {
      return {
        url: audio.url,
        title: r.json.title || '',
        thumbnail:
          r.json.thumbnailUrl ||
          r.json.thumbnail ||
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        author: r.json.uploader || r.json.uploaderName || '',
        mimeType: audio.mimeType || 'audio/mp4',
        source: 'piped',
        instance: base,
      };
    }
  }
  return null;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'GET or POST only' });
  }

  const body = req.method === 'POST' ? parseBody(req) : {};
  const q = String(req.query?.q || body.q || body.query || '').trim();
  const urlIn = String(req.query?.url || body.url || '').trim();
  let videoId = extractVideoId(req.query?.videoId || body.videoId || urlIn || '');

  let meta = {
    title: '',
    thumbnail: '',
    author: '',
  };

  try {
    if (!videoId && q) {
      const found = await searchYouTubeId(q);
      if (!found?.videoId) {
        return res.status(404).json({
          success: false,
          error: 'No YouTube result for that search',
          query: q,
        });
      }
      videoId = found.videoId;
      meta = {
        title: found.title || q,
        thumbnail: found.thumbnail || '',
        author: found.author || '',
      };
    }

    if (!videoId) {
      return res.status(400).json({
        success: false,
        error: 'Provide q (song name), url, or videoId',
      });
    }

    const videoUrl = youtubeUrl(videoId);
    if (!meta.thumbnail) {
      meta.thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    }

    // 1) Cobalt
    const cobalt = await tryCobalt(videoUrl);
    if (cobalt?.url) {
      return res.status(200).json({
        success: true,
        url: cobalt.url,
        title: meta.title || cobalt.filename || videoId,
        thumbnail: meta.thumbnail,
        artist: meta.author || 'YouTube',
        videoId,
        source: cobalt.source,
        mimeType: 'audio/mpeg',
      });
    }

    // 2) Piped
    const piped = await tryPiped(videoId);
    if (piped?.url) {
      return res.status(200).json({
        success: true,
        url: piped.url,
        title: piped.title || meta.title || videoId,
        thumbnail: piped.thumbnail || meta.thumbnail,
        artist: piped.author || meta.author || 'YouTube',
        videoId,
        source: 'piped',
        mimeType: piped.mimeType || 'audio/mp4',
      });
    }

    // 3) Same-origin stream proxy tip
    return res.status(404).json({
      success: false,
      error:
        'Cobalt/Piped could not extract audio. Set COBALT_API_URL to a self-hosted Cobalt instance, or use /api/stream?videoId=',
      videoId,
      streamProxy: `/api/stream?videoId=${encodeURIComponent(videoId)}`,
    });
  } catch (err) {
    console.error('[yt-stream]', err?.message || err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Extract failed',
    });
  }
}
