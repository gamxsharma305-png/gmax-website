/**
 * Resolve Spotify track ID/URL → playable stream via RapidAPI convert.
 * Also accepts title+artist to find a Spotify match via web search then convert.
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
  const uri = raw.match(/spotify:track:([a-zA-Z0-9]+)/);
  if (uri) return `https://open.spotify.com/track/${uri[1]}`;
  const web = raw.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
  if (web) return `https://open.spotify.com/track/${web[1]}`;
  if (/^[a-zA-Z0-9]{10,30}$/.test(raw)) return `https://open.spotify.com/track/${raw}`;
  return null;
}

function trackIdFromUrl(url) {
  const m = String(url).match(/track\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

async function rapidGet(path) {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error('RAPIDAPI_KEY not configured');
  const res = await fetch(`https://${HOST}${path}`, {
    headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': HOST },
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
  if (!key) throw new Error('RAPIDAPI_KEY not configured');
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

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

async function findSpotifyIdByName(title, artist) {
  const q = [title, artist].filter(Boolean).join(' ').trim();
  if (!q) return null;
  try {
    const tokRes = await fetch(
      'https://open.spotify.com/get_access_token?reason=transport&productType=web_player',
      { headers: { 'User-Agent': UA, Referer: 'https://open.spotify.com/' } },
    );
    if (!tokRes.ok) return null;
    const tok = await tokRes.json();
    const token = tok.accessToken || tok.access_token;
    if (!token) return null;
    const sRes = await fetch(
      `https://api.spotify.com/v1/search?type=track&limit=5&q=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA } },
    );
    if (!sRes.ok) return null;
    const data = await sRes.json();
    const item = data?.tracks?.items?.[0];
    return item?.id || null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = req.method === 'POST' ? parseBody(req) : {};
    let input =
      req.query?.url ||
      req.query?.id ||
      body.url ||
      body.id ||
      body.spotify_url ||
      '';
    const title = String(body.title || req.query?.title || '').trim();
    const artist = String(body.artist || req.query?.artist || '').trim();

    let spotifyUrl = normalizeSpotifyUrl(input);

    // Name search → first Spotify match → convert
    if (!spotifyUrl && (title || artist)) {
      const foundId = await findSpotifyIdByName(title, artist);
      if (foundId) spotifyUrl = `https://open.spotify.com/track/${foundId}`;
    }

    if (!spotifyUrl) {
      return res.status(400).json({
        success: false,
        error: 'Pass Spotify id/url or title (+ artist)',
      });
    }

    const id = trackIdFromUrl(spotifyUrl);

    const metaRes = await rapidGet(
      `/Gettrack?spotify_url=${encodeURIComponent(spotifyUrl)}`,
    );
    const meta = metaRes.json || {};
    const metaTitle = meta.name || meta.title || title || 'Unknown';
    const metaArtist =
      (Array.isArray(meta.artists) && meta.artists.map((a) => a.name).join(', ')) ||
      meta.artist ||
      artist ||
      'Unknown';
    const thumbnail =
      meta.album?.images?.[0]?.url || meta.image || meta.thumbnail || '';
    const durationMs = Number(meta.duration_ms) || 0;

    const conv = await rapidConvert(spotifyUrl);
    const streamUrl = pickDownloadUrl(conv.json);

    if (!streamUrl) {
      const msg =
        conv.json?.message ||
        conv.json?.error ||
        (conv.status === 429
          ? 'RapidAPI daily download limit reached. Upgrade plan or wait for reset.'
          : 'Could not get audio URL');
      return res.status(conv.status === 429 ? 429 : 502).json({
        success: false,
        error: msg,
        meta: {
          id,
          title: metaTitle,
          artist: metaArtist,
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
        title: metaTitle,
        artist: metaArtist,
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
