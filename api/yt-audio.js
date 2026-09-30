/**
 * Direct YouTube audio URL resolver for HTML5 <audio>.
 * 1) Piped API (multiple instances)
 * 2) Cobalt API fallback
 *
 * GET /api/yt-audio?videoId=XXXX
 * Returns: { success, url, title?, mimeType? }
 */

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.nosea.vip',
  'https://api.piped.private.coffee',
  'https://pipedapi.leptons.xyz',
];

const COBALT_ENDPOINTS = [
  'https://api.cobalt.tools/',
  'https://cobalt-api.kwiatekmiki.com/',
];

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=300');
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

function pickPipedAudio(streams) {
  if (!Array.isArray(streams) || !streams.length) return null;
  // Prefer m4a / mp4 audio, highest bitrate
  const scored = streams
    .filter((s) => s && s.url && /audio/i.test(s.mimeType || s.mime_type || 'audio'))
    .map((s) => {
      const mime = String(s.mimeType || s.mime_type || '');
      const br = Number(s.bitrate || s.bitRate || 0);
      let score = br;
      if (/mp4|m4a|aac/i.test(mime)) score += 50000;
      if (/webm|opus/i.test(mime)) score += 20000;
      return { url: s.url, mimeType: mime, bitrate: br, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

async function tryPiped(videoId) {
  for (const base of PIPED_INSTANCES) {
    const r = await fetchJson(`${base}/streams/${encodeURIComponent(videoId)}`);
    if (!r.ok || !r.json) continue;
    const audio = pickPipedAudio(r.json.audioStreams || r.json.audio_streams);
    if (audio?.url) {
      return {
        url: audio.url,
        title: r.json.title || '',
        mimeType: audio.mimeType || 'audio/mp4',
        source: 'piped',
        instance: base,
      };
    }
  }
  return null;
}

async function tryCobalt(videoId) {
  const body = {
    url: `https://www.youtube.com/watch?v=${videoId}`,
    downloadMode: 'audio',
    audioFormat: 'm4a',
    isAudioOnly: true,
  };
  for (const endpoint of COBALT_ENDPOINTS) {
    const r = await fetchJson(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!r.json) continue;
    // Cobalt v7+ shapes
    const url =
      r.json.url ||
      r.json.audio ||
      r.json.tunnel ||
      r.json.data?.url ||
      (Array.isArray(r.json) ? null : null);
    if (typeof url === 'string' && url.startsWith('http')) {
      return {
        url,
        title: r.json.filename || r.json.title || '',
        mimeType: 'audio/mp4',
        source: 'cobalt',
        instance: endpoint,
      };
    }
    // status: tunnel / redirect
    if (r.json.status === 'tunnel' || r.json.status === 'redirect') {
      const u = r.json.url;
      if (typeof u === 'string' && u.startsWith('http')) {
        return {
          url: u,
          title: r.json.filename || '',
          mimeType: 'audio/mp4',
          source: 'cobalt',
          instance: endpoint,
        };
      }
    }
  }
  return null;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'GET only' });
  }

  const videoId = String(req.query?.videoId || req.query?.v || '').trim();
  if (!/^[\w-]{6,20}$/.test(videoId)) {
    return res.status(400).json({ success: false, error: 'Invalid videoId' });
  }

  try {
    let result = await tryPiped(videoId);
    if (!result) result = await tryCobalt(videoId);

    if (!result?.url) {
      return res.status(404).json({
        success: false,
        error: 'Could not extract audio (Piped + Cobalt failed)',
        videoId,
      });
    }

    return res.status(200).json({
      success: true,
      url: result.url,
      title: result.title,
      mimeType: result.mimeType,
      source: result.source,
      videoId,
    });
  } catch (err) {
    console.error('[yt-audio]', err?.message || err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Extract failed',
    });
  }
}
