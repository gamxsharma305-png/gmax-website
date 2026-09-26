import { Innertube, UniversalCache } from 'youtubei.js';

/**
 * Same-origin audio proxy — buffers upstream then returns bytes.
 * Streaming pipes often hang on Vercel; full buffer is more reliable under ~4MB.
 */

let youtubeClient = null;
let clientPromise = null;

/** @type {Map<string, { url: string, mime: string, expires: number }>} */
const upstreamCache = new Map();

/** @type {Map<string, { buf: Buffer, mime: string, expires: number }>} */
const bodyCache = new Map();

async function getYouTubeClient() {
  if (youtubeClient) return youtubeClient;
  if (clientPromise) return clientPromise;
  clientPromise = Innertube.create({
    cache: new UniversalCache(false),
    generate_session_locally: false,
    enable_session_cache: false,
  })
    .then((c) => {
      youtubeClient = c;
      return c;
    })
    .catch((err) => {
      clientPromise = null;
      throw err;
    });
  return clientPromise;
}

async function resolveAudioUrl(format, player) {
  if (!format) return null;
  if (format.url && typeof format.url === 'string' && format.url.startsWith('http')) {
    return format.url;
  }
  if (!player) return null;
  try {
    let url = format.decipher(player);
    if (url && typeof url.then === 'function') url = await url;
    if (url && typeof url === 'string') return url;
  } catch {
    /* */
  }
  return null;
}

const CLIENTS = ['IOS', 'ANDROID', 'WEB'];

async function getUpstream(videoId) {
  const hit = upstreamCache.get(videoId);
  if (hit && hit.expires > Date.now()) return hit;

  const yt = await getYouTubeClient();
  let info = null;
  for (const client of CLIENTS) {
    try {
      info = await yt.getBasicInfo(videoId, client);
      if (info) break;
    } catch {
      info = null;
    }
  }
  if (!info) throw new Error('Video unavailable');

  let audioFormat = null;
  try {
    audioFormat = info.chooseFormat({ type: 'audio', quality: 'best' });
  } catch {
    const adaptive = info.streaming_data?.adaptive_formats || [];
    audioFormat =
      adaptive.find((f) => f.has_audio && !f.has_video) ||
      adaptive.find((f) => String(f.mime_type || '').startsWith('audio/')) ||
      null;
  }
  if (!audioFormat) throw new Error('No audio format');

  const url = await resolveAudioUrl(audioFormat, yt.session.player);
  if (!url) throw new Error('Failed to resolve stream');

  const mime = (audioFormat.mime_type || 'audio/mp4').split(';')[0].trim();
  const entry = { url, mime, expires: Date.now() + 4 * 60 * 1000 };
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
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      Accept: '*/*',
    },
  });

  if (!res.ok) {
    upstreamCache.delete(videoId);
    upstream = await getUpstream(videoId);
    res = await fetch(upstream.url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        Accept: '*/*',
      },
    });
  }

  if (!res.ok) throw new Error(`Upstream ${res.status}`);

  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  // Vercel hobby soft limit ~4.5MB — still return; client may get truncated on huge files
  const entry = {
    buf,
    mime: upstream.mime || 'audio/mp4',
    expires: Date.now() + 3 * 60 * 1000,
  };
  bodyCache.set(videoId, entry);
  if (bodyCache.size > 12) {
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
    return res.status(500).json({ error: err?.message || 'Proxy failed' });
  }
}
