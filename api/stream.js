/**
 * Same-origin YouTube audio proxy.
 * GET /api/stream?videoId=VIDEO_ID
 *
 * Sources (in order):
 *  1) Piped public APIs (audioStreams[].url | .s)
 *  2) Invidious (adaptiveFormats audio)
 * Then pipes bytes with Range support for HTML5 <audio>.
 */

const PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.adminforge.de',
  'https://api.piped.private.coffee',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.ducks.party',
  'https://pipedapi.drgns.space',
  'https://pipedapi.nosebs.ru',
  'https://piped-api.privacy.com.de',
  'https://api.piped.yt',
];

const INVIDIOUS = [
  'https://invidious.f5.si',
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://invidious.materialio.us',
];

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Length, Content-Range, Accept-Ranges',
  );
}

function streamUrlFrom(obj) {
  if (!obj || typeof obj !== 'object') return '';
  const u =
    obj.url ||
    obj.s ||
    obj.link ||
    obj.href ||
    (typeof obj.stream === 'string' ? obj.stream : '') ||
    '';
  return typeof u === 'string' && u.startsWith('http') ? u : '';
}

function pickPipedAudio(streams) {
  if (!Array.isArray(streams) || !streams.length) return null;
  const scored = streams
    .map((s) => {
      const url = streamUrlFrom(s);
      if (!url) return null;
      const mime = String(s.mimeType || s.mime_type || s.type || 'audio/mp4');
      if (!/audio/i.test(mime) && s.videoOnly) return null;
      const br = Number(s.bitrate || s.bitRate || s.quality || 0);
      let score = br;
      if (/mp4|m4a|aac/i.test(mime)) score += 80000;
      if (/webm|opus/i.test(mime)) score += 25000;
      return { url, mimeType: mime.split(';')[0] || 'audio/mp4', score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

function pickInvidiousAudio(formats) {
  if (!Array.isArray(formats) || !formats.length) return null;
  const scored = formats
    .map((f) => {
      const url = streamUrlFrom(f);
      if (!url) return null;
      const mime = String(f.type || f.mimeType || '');
      if (!/audio/i.test(mime)) return null;
      const br = Number(f.bitrate || 0);
      let score = br;
      if (/mp4|m4a|aac/i.test(mime)) score += 80000;
      return { url, mimeType: mime.split(';')[0] || 'audio/mp4', score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

async function fetchJson(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (!r.ok) return null;
    const text = await r.text();
    if (!text || text[0] === '<' || text.startsWith('Please')) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function resolveAudio(videoId) {
  // 1) Piped
  for (const base of PIPED) {
    const data = await fetchJson(`${base}/streams/${encodeURIComponent(videoId)}`);
    if (!data) continue;
    const audio = pickPipedAudio(data.audioStreams || data.audio_streams);
    if (audio?.url) {
      return { ...audio, source: 'piped', instance: base };
    }
  }

  // 2) Invidious
  for (const base of INVIDIOUS) {
    const data = await fetchJson(
      `${base}/api/v1/videos/${encodeURIComponent(videoId)}`,
    );
    if (!data) continue;
    const audio = pickInvidiousAudio(data.adaptiveFormats || data.adaptive_formats);
    if (audio?.url) {
      return { ...audio, source: 'invidious', instance: base };
    }
  }

  return null;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'GET only' });
  }

  const videoId = String(req.query?.videoId || req.query?.v || '').trim();
  // YouTube ids are 11 chars, but allow slight variance
  if (!/^[\w-]{6,20}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid videoId' });
  }

  try {
    const audio = await resolveAudio(videoId);
    if (!audio?.url) {
      return res.status(404).json({
        error: 'No audio stream found',
        videoId,
        hint: 'Public Piped/Invidious instances may be down. App will try iframe backup.',
      });
    }

    const range = req.headers.range || req.headers.Range;
    const upstreamHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: '*/*',
      Referer: 'https://www.youtube.com/',
    };
    if (range) upstreamHeaders.Range = range;

    const upstream = await fetch(audio.url, {
      headers: upstreamHeaders,
      redirect: 'follow',
    });

    if (!upstream.ok && upstream.status !== 206) {
      // Last resort: redirect client to CDN URL (may not work locked, but helps debug)
      res.setHeader('Location', audio.url);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(302).end();
    }

    const contentType =
      (upstream.headers.get('content-type') || audio.mimeType || 'audio/mp4').split(
        ';',
      )[0];
    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=1800');
    res.setHeader('X-Gmax-Source', audio.source || 'unknown');

    const cl = upstream.headers.get('content-length');
    if (cl) res.setHeader('Content-Length', cl);
    const cr = upstream.headers.get('content-range');
    if (cr) res.setHeader('Content-Range', cr);

    if (req.method === 'HEAD') return res.end();

    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.send(buf);
  } catch (err) {
    console.error('[stream]', err?.message || err);
    return res.status(502).json({ error: err?.message || 'Stream proxy failed' });
  }
}
