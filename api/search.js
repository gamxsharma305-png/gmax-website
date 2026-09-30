/**
 * Multi-source search.
 * Order (user request): YouTube on top, then Saavn / Audius / iTunes / Archive.
 */

const APP = 'GMAXPlayer';

async function fetchJson(url, options = {}, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text[0] === '<') return null;
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

function pickStream(downloadUrl) {
  if (typeof downloadUrl === 'string' && downloadUrl.startsWith('http')) return downloadUrl;
  if (!Array.isArray(downloadUrl)) return '';
  let best = '';
  let score = -1;
  for (const item of downloadUrl) {
    if (typeof item === 'string' && item.startsWith('http')) {
      if (!best) best = item;
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const q = String(item.quality || '').toLowerCase();
    const url = item.url || item.link || '';
    if (!url) continue;
    let s = 1;
    if (q.includes('320')) s = 320;
    else if (q.includes('160')) s = 160;
    else if (q.includes('96')) s = 96;
    if (s > score) {
      score = s;
      best = url;
    }
  }
  return best;
}

function pickImage(images) {
  if (typeof images === 'string' && images.startsWith('http')) return images;
  if (!Array.isArray(images) || !images.length) return '';
  for (let i = images.length - 1; i >= 0; i--) {
    const u = images[i]?.url || images[i]?.link || (typeof images[i] === 'string' ? images[i] : '');
    if (u) return String(u).replace(/50x50|150x150/, '500x500');
  }
  return '';
}

function runsText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.simpleText) return node.simpleText;
  if (Array.isArray(node.runs)) return node.runs.map((r) => r.text || '').join('');
  if (node.text?.runs) return node.text.runs.map((r) => r.text || '').join('');
  return '';
}

function walkVideoRenderers(node, out) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const n of node) walkVideoRenderers(n, out);
    return;
  }
  if (typeof node !== 'object') return;
  if (node.videoRenderer) {
    out.push(node.videoRenderer);
    return;
  }
  if (node.playlistVideoRenderer) {
    out.push(node.playlistVideoRenderer);
    return;
  }
  for (const v of Object.values(node)) walkVideoRenderers(v, out);
}

function mapSaavn(item) {
  if (!item || !item.id) return null;
  const title = item.name || item.title;
  if (!title) return null;
  const streamUrl =
    pickStream(item.downloadUrl) || pickStream(item.download_url) || item.media_url || '';
  const artist =
    item.primaryArtists ||
    item.artists?.primary?.map((a) => a.name).filter(Boolean).join(', ') ||
    item.artist ||
    'Unknown artist';
  return {
    id: `saavn:${item.id}`,
    title,
    artist: { id: `artist:${artist}`, name: String(artist) },
    albumImageUrl: pickImage(item.image) || '',
    duration: Number(item.duration) || 0,
    provider: 'saavn',
    sourceId: String(item.id),
    streamUrl: streamUrl || undefined,
    album: item.album?.name || item.albumName || undefined,
  };
}

function mapAudius(item) {
  if (!item || !item.id) return null;
  const title = item.title;
  if (!title) return null;
  const artist = item.user?.name || item.user?.handle || 'Unknown artist';
  const art = item.artwork || {};
  return {
    id: `audius:${item.id}`,
    title,
    artist: { id: `artist:${artist}`, name: artist },
    albumImageUrl: art['1000x1000'] || art['480x480'] || art['150x150'] || '',
    duration: Number(item.duration) || 0,
    provider: 'audius',
    sourceId: String(item.id),
    streamUrl: `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(item.id)}/stream?app_name=${APP}`,
  };
}

function mapYoutube(video) {
  const videoId = video?.videoId;
  if (!videoId) return null;
  const title = runsText(video.title);
  if (!title) return null;
  const artist =
    runsText(video.ownerText) ||
    runsText(video.shortBylineText) ||
    runsText(video.longBylineText) ||
    'YouTube';
  const thumbs = video.thumbnail?.thumbnails || [];
  const thumb = thumbs.length ? thumbs[thumbs.length - 1].url : '';
  return {
    id: `youtube:${videoId}`,
    title,
    artist: { id: `artist:${artist}`, name: artist },
    albumImageUrl: thumb.startsWith('//') ? `https:${thumb}` : thumb,
    duration: 0,
    provider: 'youtube',
    sourceId: videoId,
    videoId,
    isVideo: true,
  };
}

/** Piped search → extra YouTube-like results */
async function searchPiped(query, limit) {
  const bases = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.leptons.xyz',
    'https://api.piped.private.coffee',
  ];
  for (const base of bases) {
    const data = await fetchJson(
      `${base}/search?q=${encodeURIComponent(query)}&filter=videos`,
      {},
      8000,
    );
    const items = data?.items || data?.results || [];
    if (!Array.isArray(items) || !items.length) continue;
    const out = [];
    const seen = new Set();
    for (const it of items) {
      const url = String(it.url || it.id || '');
      const m = url.match(/([\w-]{11})/);
      const videoId = it.id || (m ? m[1] : '');
      if (!videoId || videoId.length < 10) continue;
      const title = it.title || '';
      if (!title || seen.has(videoId)) continue;
      seen.add(videoId);
      out.push({
        id: `youtube:${videoId}`,
        title,
        artist: {
          id: `artist:${it.uploaderName || 'YouTube'}`,
          name: it.uploaderName || it.uploader || 'YouTube',
        },
        albumImageUrl: it.thumbnail || '',
        duration: Number(it.duration) || 0,
        provider: 'youtube',
        sourceId: videoId,
        videoId,
        isVideo: true,
      });
      if (out.length >= limit) break;
    }
    if (out.length) return out;
  }
  return [];
}

async function searchSaavn(query, limit) {
  const bases = [
    'https://saavn.dev/api',
    'https://jiosaavn-api-taupe.vercel.app',
    'https://saavn-api.vercel.app',
  ];
  for (const base of bases) {
    const path = base.includes('saavn.dev')
      ? `${base}/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`
      : `${base}/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`;
    const data = await fetchJson(path);
    const results =
      data?.data?.results ||
      data?.results ||
      (Array.isArray(data?.data) ? data.data : null);
    if (!Array.isArray(results) || !results.length) continue;
    const out = [];
    const seen = new Set();
    for (const raw of results) {
      const t = mapSaavn(raw);
      if (!t || seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
      if (out.length >= limit) break;
    }
    if (out.length) return out;
  }
  return [];
}

async function searchAudius(query, limit) {
  const data = await fetchJson(
    `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=${APP}&limit=${limit}`,
  );
  const list = data?.data || [];
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const t = mapAudius(raw);
    if (!t || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

async function searchItunes(query, limit) {
  const data = await fetchJson(
    `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${limit}`,
  );
  const results = data?.results || [];
  return results
    .filter((r) => r.trackName)
    .map((r) => ({
      id: `itunes:${r.trackId}`,
      title: r.trackName,
      artist: { id: `artist:${r.artistId}`, name: r.artistName || 'Unknown' },
      albumImageUrl: (r.artworkUrl100 || '').replace('100x100', '600x600'),
      duration: Math.round((r.trackTimeMillis || 0) / 1000),
      provider: 'itunes',
      sourceId: String(r.trackId),
      previewUrl: r.previewUrl || undefined,
      album: r.collectionName || undefined,
    }));
}

/** Internet Archive audio search */
async function searchArchive(query, limit) {
  const q = `mediatype:(audio) AND (${query})`;
  const data = await fetchJson(
    `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=year&rows=${limit}&page=1&output=json`,
    {},
    10000,
  );
  const docs = data?.response?.docs || [];
  if (!Array.isArray(docs)) return [];
  const out = [];
  for (const d of docs) {
    const id = d.identifier;
    if (!id) continue;
    const title = Array.isArray(d.title) ? d.title[0] : d.title || id;
    const artist = Array.isArray(d.creator)
      ? d.creator[0]
      : d.creator || 'Internet Archive';
    out.push({
      id: `archive:${id}`,
      title: String(title),
      artist: { id: `artist:${artist}`, name: String(artist) },
      albumImageUrl: `https://archive.org/services/img/${encodeURIComponent(id)}`,
      duration: 0,
      provider: 'archive',
      sourceId: String(id),
      // IA item page; playback may need file list — use as soft result
      streamUrl: `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(id)}.mp3`,
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function searchYouTube(query, limit) {
  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const queries = [query, `${query} official audio`, `${query} song`];
  const regions = ['IN', 'US'];
  const out = [];
  const seen = new Set();

  for (const gl of regions) {
    for (const q of queries) {
      const data = await fetchJson(
        'https://www.youtube.com/youtubei/v1/search?prettyPrint=false',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': UA,
            Origin: 'https://www.youtube.com',
            Referer: 'https://www.youtube.com/',
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: 'WEB',
                clientVersion: '2.20250317.01.00',
                hl: 'en',
                gl,
              },
            },
            query: q,
          }),
        },
        14000,
      );
      if (!data) continue;
      const renderers = [];
      walkVideoRenderers(data, renderers);
      for (const video of renderers) {
        const t = mapYoutube(video);
        if (!t || seen.has(t.id)) continue;
        seen.add(t.id);
        out.push(t);
        if (out.length >= limit) return out;
      }
      if (out.length >= Math.min(12, limit)) break;
    }
    if (out.length >= Math.min(14, limit)) break;
  }

  // Fill with Piped if thin
  if (out.length < Math.min(8, limit)) {
    const piped = await searchPiped(query, limit - out.length);
    for (const t of piped) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
      if (out.length >= limit) break;
    }
  }
  return out;
}

function merge(buckets, limit) {
  const seen = new Set();
  const out = [];
  for (const bucket of buckets) {
    for (const t of bucket) {
      const key = `${t.title}\n${t.artist?.name || ''}`.toLowerCase();
      const titleOnly = (t.title || '').toLowerCase();
      if (seen.has(key) || seen.has(titleOnly)) continue;
      seen.add(key);
      seen.add(titleOnly);
      out.push(t);
      if (out.length >= limit) return out;
    }
  }
  return out;
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = parseBody(req);
    const query = String(body.query || '').trim();
    const limit = Math.min(50, Math.max(1, Number(body.limit) || 30));
    if (!query) {
      return res.status(200).json({ query: '', tracks: [], artists: [], albums: [] });
    }

    const [youtube, saavn, audius, itunes, archive] = await Promise.all([
      searchYouTube(query, limit).catch(() => []),
      searchSaavn(query, limit).catch(() => []),
      searchAudius(query, Math.min(15, limit)).catch(() => []),
      searchItunes(query, Math.min(12, limit)).catch(() => []),
      searchArchive(query, Math.min(8, limit)).catch(() => []),
    ]);

    // YouTube ALWAYS on top, then Saavn (Indian), then others
    const buckets = [
      youtube.filter((t) => t.videoId),
      youtube,
      saavn.filter((t) => t.streamUrl),
      saavn,
      audius.filter((t) => t.streamUrl),
      audius,
      itunes,
      archive,
    ];

    const tracks = merge(buckets, limit);
    res.setHeader('X-Gmax-Yt', String(youtube.length));
    res.setHeader('X-Gmax-Saavn', String(saavn.length));
    res.setHeader('X-Gmax-Audius', String(audius.length));
    return res.status(200).json({
      query,
      tracks,
      artists: [],
      albums: [],
      sources: {
        youtube: youtube.length,
        saavn: saavn.length,
        audius: audius.length,
        itunes: itunes.length,
        archive: archive.length,
      },
    });
  } catch (err) {
    return res.status(200).json({
      query: '',
      tracks: [],
      artists: [],
      albums: [],
      error: String(err?.message || err),
    });
  }
}
