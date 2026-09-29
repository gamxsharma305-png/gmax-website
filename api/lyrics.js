/**
 * Lyrics proxy — LRCLIB (free, no key)
 * GET /api/lyrics?title=&artist=
 */

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const title = String(req.query?.title || '').trim();
  const artist = String(req.query?.artist || '').trim();
  if (!title) {
    return res.status(400).json({ success: false, error: 'title required' });
  }

  try {
    const q = [title, artist].filter(Boolean).join(' ');
    const searchUrl =
      `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`;
    const sRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'GMAXPlayer/1.0' },
    });
    if (!sRes.ok) {
      return res.status(200).json({ success: true, lyrics: null, source: null });
    }
    const list = await sRes.json();
    if (!Array.isArray(list) || !list.length) {
      return res.status(200).json({ success: true, lyrics: null, source: null });
    }

    // Prefer exact-ish title match, then with lyrics
    const titleLower = title.toLowerCase();
    const ranked = [...list].sort((a, b) => {
      const aT = String(a.trackName || a.name || '').toLowerCase();
      const bT = String(b.trackName || b.name || '').toLowerCase();
      const aExact = aT === titleLower || aT.includes(titleLower) ? 1 : 0;
      const bExact = bT === titleLower || bT.includes(titleLower) ? 1 : 0;
      if (bExact !== aExact) return bExact - aExact;
      const aL = a.plainLyrics || a.syncedLyrics ? 1 : 0;
      const bL = b.plainLyrics || b.syncedLyrics ? 1 : 0;
      return bL - aL;
    });

    const hit = ranked[0];
    let plain = hit.plainLyrics || '';
    let synced = hit.syncedLyrics || '';

    // Fetch full record if search stub lacks body
    if ((!plain && !synced) && hit.id) {
      const dRes = await fetch(`https://lrclib.net/api/get/${hit.id}`, {
        headers: { 'User-Agent': 'GMAXPlayer/1.0' },
      });
      if (dRes.ok) {
        const full = await dRes.json();
        plain = full.plainLyrics || plain;
        synced = full.syncedLyrics || synced;
      }
    }

    if (!plain && !synced) {
      return res.status(200).json({ success: true, lyrics: null, source: null });
    }

    return res.status(200).json({
      success: true,
      lyrics: plain || synced.replace(/\[\d+:\d+[\d.]*\]/g, '').trim(),
      synced: synced || null,
      source: 'lrclib',
      meta: {
        title: hit.trackName || title,
        artist: hit.artistName || artist,
      },
    });
  } catch (err) {
    console.error('[lyrics]', err?.message || err);
    return res.status(200).json({ success: true, lyrics: null, source: null });
  }
}
