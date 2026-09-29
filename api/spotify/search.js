/**
 * Name → Spotify tracks (no link paste required).
 * Uses Spotify public web search endpoints; then clients resolve audio via /api/spotify/resolve.
 */

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

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

async function fetchJson(url, headers = {}, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json', ...headers },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Anonymous Spotify token used by open.spotify.com */
async function getSpotifyToken() {
  const data = await fetchJson(
    'https://open.spotify.com/get_access_token?reason=transport&productType=web_player',
    { 'App-Platform': 'WebPlayer', Referer: 'https://open.spotify.com/' },
  );
  if (data?.accessToken) return data.accessToken;
  // Fallback cookie-less body sometimes differs
  if (data?.access_token) return data.access_token;
  return null;
}

async function searchSpotifyOfficial(query, limit, token) {
  if (!token) return [];
  const url =
    `https://api.spotify.com/v1/search?type=track&limit=${Math.min(30, limit)}` +
    `&q=${encodeURIComponent(query)}`;
  const data = await fetchJson(url, { Authorization: `Bearer ${token}` });
  const items = data?.tracks?.items;
  if (!Array.isArray(items)) return [];
  return items
    .filter((t) => t?.id && t?.name)
    .map((t) => ({
      id: `spotify:${t.id}`,
      sourceId: t.id,
      title: t.name,
      artist: (t.artists || []).map((a) => a.name).filter(Boolean).join(', ') || 'Unknown',
      thumbnail: t.album?.images?.[0]?.url || t.album?.images?.[1]?.url || '',
      duration: Math.round((t.duration_ms || 0) / 1000),
      provider: 'spotify',
      // stream filled on play via /api/spotify/resolve
      needsResolve: true,
    }));
}

/** Deezer free search as backup when Spotify token blocked */
async function searchDeezer(query, limit) {
  const data = await fetchJson(
    `https://api.deezer.com/search/track?q=${encodeURIComponent(query)}&limit=${Math.min(25, limit)}`,
  );
  const items = data?.data;
  if (!Array.isArray(items)) return [];
  return items
    .filter((t) => t?.title)
    .map((t) => ({
      id: `deezer:${t.id}`,
      sourceId: String(t.id),
      title: t.title,
      artist: t.artist?.name || 'Unknown',
      thumbnail: t.album?.cover_xl || t.album?.cover_medium || '',
      duration: Number(t.duration) || 0,
      provider: 'deezer',
      // preview only from Deezer; play path will try Spotify-name resolve + Saavn
      streamUrl: t.preview || undefined,
      previewUrl: t.preview || undefined,
      needsResolve: true,
      searchHint: `${t.title} ${t.artist?.name || ''}`.trim(),
    }));
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = req.method === 'POST' ? parseBody(req) : {};
    const query = String(req.query?.q || req.query?.query || body.query || body.q || '').trim();
    const limit = Math.min(30, Math.max(1, Number(req.query?.limit || body.limit) || 20));

    if (!query) {
      return res.status(200).json({ success: true, query: '', tracks: [] });
    }

    let tracks = [];
    const token = await getSpotifyToken();
    if (token) {
      tracks = await searchSpotifyOfficial(query, limit, token);
    }

    // Backup so search is never empty if Spotify blocks Vercel IPs
    if (tracks.length < 5) {
      const deezer = await searchDeezer(query, limit);
      const seen = new Set(tracks.map((t) => t.title.toLowerCase()));
      for (const t of deezer) {
        if (seen.has(t.title.toLowerCase())) continue;
        seen.add(t.title.toLowerCase());
        tracks.push(t);
        if (tracks.length >= limit) break;
      }
    }

    return res.status(200).json({
      success: true,
      query,
      tracks: tracks.slice(0, limit),
      source: token ? 'spotify' : 'fallback',
    });
  } catch (err) {
    console.error('[spotify search]', err?.message || err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Search failed',
      tracks: [],
    });
  }
}
