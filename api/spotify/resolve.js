/**
 * RapidAPI Spotify Downloader proxy (spotify-downloader12)
 * - GET/POST ?url= or ?id= Spotify track URL/ID
 * - Returns metadata + downloadable audio URL when quota allows
 * Key stays server-side (RAPIDAPI_KEY).
 */

const HOST =
  process.env.RAPIDAPI_SPOTIFY_HOST || 'spotify-downloader12.p.rapidapi.com';

function setCors(res) {
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

function normalizeSpotifyUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  // spotify:track:ID
  const uri = raw.match(/spotify:track:([a-zA-Z0-9]+)/);
  if (uri) return `https://open.spotify.com/track/${uri[1]}`;
  // open.spotify.com/track/ID
  const web = raw.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
  if (web) return `https://open.spotify.com/track/${web[1]}`;
  // bare id
  if (/^[a-zA-Z0-9]{10,30}$/.test(raw)) {
    return `https://open.spotify.com/track/${raw}`;
  }
  return null;
}

function trackIdFromUrl(url) {
  const m = String(url).match(/track\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

async function rapidGet(path) {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error('RAPIDAPI_KEY not configured on server');
  const res = await fetch(`https://${HOST}${path}`, {
    headers: {
      'x-rapidapi-key': key,
      'x-rapidapi-host': HOST,
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

async function rapidConvert(spotifyUrl) {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error('RAPIDAPI_KEY not configured on server');
  const body = new URLSearchParams({ url: spotifyUrl });
  const res = await fetch(`https://${HOST}/convert`, {
    method: 'POST',
    headers: {
      'x-rapidapi-key': key,
      'x-rapidapi-host': HOST,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

function pickDownloadUrl(json) {
  if (!json || typeof json !== 'object') return null;
  const candidates = [
    json.url,
    json.link,
    json.download,
    json.download_url,
    json.downloadUrl,
    json.audio,
    json.audioUrl,
    json.mp3,
    json.data?.url,
    json.data?.download,
    json.data?.link,
    json.result?.url,
    json.result?.download,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('http')) return c;
  }
  return null;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = req.method === 'POST' ? parseBody(req) : {};
    const input =
      req.query?.url ||
      req.query?.id ||
      body.url ||
      body.id ||
      body.spotify_url ||
      '';
    const spotifyUrl = normalizeSpotifyUrl(input);
    if (!spotifyUrl) {
      return res.status(400).json({
        success: false,
        error: 'Pass Spotify track URL or ID (?url= or ?id=)',
      });
    }

    const id = trackIdFromUrl(spotifyUrl);

    // Metadata
    const metaRes = await rapidGet(
      `/Gettrack?spotify_url=${encodeURIComponent(spotifyUrl)}`,
    );
    const meta = metaRes.json || {};
    const title = meta.name || meta.title || 'Unknown';
    const artist =
      (Array.isArray(meta.artists) && meta.artists.map((a) => a.name).join(', ')) ||
      meta.artist ||
      'Unknown';
    const thumbnail =
      meta.album?.images?.[0]?.url || meta.image || meta.thumbnail || '';
    const durationMs = Number(meta.duration_ms) || 0;

    // Audio convert (may hit daily quota on BASIC)
    const conv = await rapidConvert(spotifyUrl);
    const streamUrl = pickDownloadUrl(conv.json);

    if (!streamUrl) {
      const msg =
        conv.json?.message ||
        conv.json?.error ||
        (conv.status === 429
          ? 'RapidAPI daily download quota exceeded. Upgrade plan or try tomorrow.'
          : 'Could not get download URL from Spotify API');
      return res.status(conv.status === 429 ? 429 : 502).json({
        success: false,
        error: msg,
        meta: {
          id,
          title,
          artist,
          thumbnail,
          duration: Math.round(durationMs / 1000),
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: id ? `spotify:${id}` : `spotify:${Date.now()}`,
        sourceId: id,
        title,
        artist,
        thumbnail,
        duration: Math.round(durationMs / 1000),
        streamUrl,
        provider: 'spotify',
      },
    });
  } catch (err) {
    console.error('[spotify resolve]', err?.message || err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Spotify resolve failed',
    });
  }
}
