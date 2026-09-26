import { Innertube, UniversalCache } from 'youtubei.js';

/**
 * Same-origin audio proxy.
 * Direct googlevideo URLs are IP-bound to the server that requested them,
 * so the browser cannot play them. We resolve + pipe from the server instead.
 */

let youtubeClient = null;
let clientPromise = null;

/** @type {Map<string, { url: string, mime: string, expires: number }>} */
const upstreamCache = new Map();

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
  // Cap cache size
  if (upstreamCache.size > 40) {
    const first = upstreamCache.keys().next().value;
    if (first) upstreamCache.delete(first);
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
    const upstream = await getUpstream(videoId);
    const range = req.headers.range;

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      Accept: '*/*',
    };
    if (range) headers.Range = range;

    const upstreamRes = await fetch(upstream.url, { headers });

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      // URL may have expired — bust cache and retry once
      upstreamCache.delete(videoId);
      const retryUp = await getUpstream(videoId);
      const retryRes = await fetch(retryUp.url, { headers });
      if (!retryRes.ok && retryRes.status !== 206) {
        return res.status(502).json({ error: 'Upstream audio failed', status: retryRes.status });
      }
      return pipeAudio(retryRes, res, retryUp.mime, req.method === 'HEAD');
    }

    return pipeAudio(upstreamRes, res, upstream.mime, req.method === 'HEAD');
  } catch (err) {
    console.error('[audio proxy]', videoId, err?.message || err);
    return res.status(500).json({ error: err?.message || 'Proxy failed' });
  }
}

async function pipeAudio(upstreamRes, res, mime, headOnly) {
  res.status(upstreamRes.status);
  res.setHeader('Content-Type', mime || upstreamRes.headers.get('content-type') || 'audio/mp4');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=120');

  const len = upstreamRes.headers.get('content-length');
  if (len) res.setHeader('Content-Length', len);
  const cr = upstreamRes.headers.get('content-range');
  if (cr) res.setHeader('Content-Range', cr);

  if (headOnly) {
    return res.end();
  }

  // Stream body to client
  const body = upstreamRes.body;
  if (!body) {
    const buf = Buffer.from(await upstreamRes.arrayBuffer());
    return res.end(buf);
  }

  // Web ReadableStream → Node response
  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        const chunk = Buffer.from(value);
        const ok = res.write(chunk);
        if (!ok) {
          await new Promise((resolve) => res.once('drain', resolve));
        }
      }
    }
    res.end();
  } catch (e) {
    try {
      res.end();
    } catch {
      /* */
    }
  }
}
