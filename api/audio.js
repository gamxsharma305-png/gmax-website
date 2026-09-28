import { resolveYouTubeAudio } from './yt-resolve.js';

/** @type {Map<string, { url: string, mime: string, expires: number }>} */
const upstreamCache = new Map();
/** @type {Map<string, { buf: Buffer, mime: string, expires: number }>} */
const bodyCache = new Map();

async function getUpstream(videoId) {
  const hit = upstreamCache.get(videoId);
  if (hit && hit.expires > Date.now()) return hit;

  const data = await resolveYouTubeAudio(videoId);
  const entry = {
    url: data.url,
    mime: data.mime || 'audio/mp4',
    expires: Date.now() + 4 * 60 * 1000,
  };
  upstreamCache.set(videoId, entry);
  if (upstreamCache.size > 40) {
    const first = upstreamCache.keys().next().value;
    if (first) upstreamCache.delete(first);
  }
  return entry;
}

async function fetchFullBody(videoId) {
  const cached = bodyCache.get(videoId);
  if (cached && cached.expires > Date.now()) return cached;

  let upstream = await getUpstream(videoId);
  let res = await fetch(upstream.url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  // Retry once with fresh resolve if upstream expired/blocked
  if (!res.ok) {
    upstreamCache.delete(videoId);
    upstream = await getUpstream(videoId);
    res = await fetch(upstream.url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
        Accept: '*/*',
      },
    });
  }

  if (!res.ok) throw new Error(`Upstream ${res.status}`);

  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  if (buf.length < 4000) throw new Error('Audio payload too small');

  const entry = {
    buf,
    mime: upstream.mime || 'audio/mp4',
    expires: Date.now() + 3 * 60 * 1000,
  };
  bodyCache.set(videoId, entry);
  if (bodyCache.size > 10) {
    const first = bodyCache.keys().next().value;
    if (first) bodyCache.delete(first);
  }
  return entry;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const videoId = String(req.query?.videoId || '').trim();
  if (!videoId || !/^[\w-]{6,20}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid videoId' });
  }

  try {
    const { buf, mime } = await fetchFullBody(videoId);
    const total = buf.length;
    const range = req.headers.range;

    res.setHeader('Content-Type', mime);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=120');

    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      if (m) {
        const start = parseInt(m[1], 10);
        const end = m[2] ? parseInt(m[2], 10) : total - 1;
        const lo = Math.max(0, start);
        const hi = Math.min(total - 1, end);
        if (lo <= hi) {
          const slice = buf.subarray(lo, hi + 1);
          res.status(206);
          res.setHeader('Content-Range', `bytes ${lo}-${hi}/${total}`);
          res.setHeader('Content-Length', String(slice.length));
          if (req.method === 'HEAD') return res.end();
          return res.end(slice);
        }
      }
    }

    res.status(200);
    res.setHeader('Content-Length', String(total));
    if (req.method === 'HEAD') return res.end();
    return res.end(buf);
  } catch (err) {
    console.error('[audio proxy]', videoId, err?.message || err);
    const msg = String(err?.message || 'Proxy failed');
    return res.status(500).json({
      error: /bot|sign in/i.test(msg)
        ? 'YouTube blocked extraction. Trying alternate mirrors failed — retry shortly.'
        : msg,
    });
  }
}
