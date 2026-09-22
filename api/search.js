const APP = "GMAXPlayer";

async function fetchJson(url, options = {}, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function pickStream(downloadUrl) {
  if (typeof downloadUrl === "string" && downloadUrl.startsWith("http")) return downloadUrl;
  if (!Array.isArray(downloadUrl)) return "";
  let best = "";
  let score = -1;
  for (const item of downloadUrl) {
    if (typeof item === "string" && item.startsWith("http")) {
      if (!best) best = item;
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const q = String(item.quality || "").toLowerCase();
    const url = item.url || item.link || "";
    if (!url) continue;
    let s = 1;
    if (q.includes("320")) s = 320;
    else if (q.includes("160")) s = 160;
    else if (q.includes("96")) s = 96;
    if (s > score) {
      score = s;
      best = url;
    }
  }
  return best;
}

function pickImage(images) {
  if (!Array.isArray(images) || !images.length) return "";
  for (let i = images.length - 1; i >= 0; i--) {
    const u = images[i]?.url || images[i]?.link;
    if (u) return u;
  }
  return "";
}

function runsText(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.simpleText) return node.simpleText;
  if (Array.isArray(node.runs)) return node.runs.map((r) => r.text || "").join("");
  if (node.text?.runs) return node.text.runs.map((r) => r.text || "").join("");
  return "";
}

function walkVideoRenderers(node, out) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const n of node) walkVideoRenderers(n, out);
    return;
  }
  if (typeof node !== "object") return;
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
    pickStream(item.downloadUrl) || pickStream(item.download_url) || item.media_url || "";
  const artist =
    item.primaryArtists ||
    (item.artists?.primary || []).map((a) => a.name).filter(Boolean).join(", ") ||
    "Unknown artist";
  return {
    id: `saavn:${item.id}`,
    title,
    artist: { id: `artist:${artist}`, name: artist },
    albumImageUrl: pickImage(item.image) || "",
    duration: Number(item.duration) || 0,
    provider: "saavn",
    sourceId: String(item.id),
    streamUrl: streamUrl || undefined,
    album: item.album?.name || undefined,
  };
}

function mapAudius(item) {
  if (!item || !item.id) return null;
  const title = item.title;
  if (!title) return null;
  const artist = item.user?.name || item.user?.handle || "Unknown artist";
  const art = item.artwork || {};
  return {
    id: `audius:${item.id}`,
    title,
    artist: { id: `artist:${artist}`, name: artist },
    albumImageUrl: art["1000x1000"] || art["480x480"] || art["150x150"] || "",
    duration: Number(item.duration) || 0,
    provider: "audius",
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
    "YouTube";
  const thumbs = video.thumbnail?.thumbnails || [];
  const thumb = thumbs.length ? thumbs[thumbs.length - 1].url : "";
  return {
    id: `youtube:${videoId}`,
    title,
    artist: { id: `artist:${artist}`, name: artist },
    albumImageUrl: thumb.startsWith("//") ? `https:${thumb}` : thumb,
    duration: 0,
    provider: "youtube",
    sourceId: videoId,
    videoId,
    isVideo: true,
  };
}

async function searchSaavn(query, limit) {
  const bases = ["https://jiosaavn-api-taupe.vercel.app", "https://saavn-api.vercel.app"];
  for (const base of bases) {
    const data = await fetchJson(
      `${base}/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`,
    );
    const results =
      data?.data?.results || data?.results || (Array.isArray(data?.data) ? data.data : null);
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
      artist: { id: `artist:${r.artistId}`, name: r.artistName || "Unknown" },
      albumImageUrl: (r.artworkUrl100 || "").replace("100x100", "600x600"),
      duration: Math.round((r.trackTimeMillis || 0) / 1000),
      provider: "itunes",
      sourceId: String(r.trackId),
      previewUrl: r.previewUrl || undefined,
      album: r.collectionName || undefined,
    }));
}

async function searchYouTube(query, limit) {
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  const queries = [query, `${query} official audio`, `${query} song`];
  const regions = ["US", "IN"];
  const out = [];
  const seen = new Set();

  for (const gl of regions) {
    for (const q of queries) {
      const data = await fetchJson(
        "https://www.youtube.com/youtubei/v1/search?prettyPrint=false",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": UA,
            Origin: "https://www.youtube.com",
            Referer: "https://www.youtube.com/",
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: "WEB",
                clientVersion: "2.20250317.01.00",
                hl: "en",
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
      if (out.length >= Math.min(10, limit)) break;
    }
    if (out.length >= Math.min(12, limit)) break;
  }
  return out;
}

function isGlobal(q) {
  return /\b(phonk|drift\s*phonk|montagem|montage[nm]?|funk|brazilian\s*funk|house|edm|techno|drill|lofi|lo-fi|lofi\s*hip\s*hop|synthwave|nightcore|sped\s*up|slowed)\b/i.test(
    q,
  );
}

function merge(buckets, limit) {
  const seen = new Set();
  const out = [];
  for (const bucket of buckets) {
    for (const t of bucket) {
      const key = `${t.title}\n${t.artist?.name || ""}`.toLowerCase();
      const titleOnly = (t.title || "").toLowerCase();
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
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = parseBody(req);
    const query = String(body.query || "").trim();
    const limit = Math.min(50, Math.max(1, Number(body.limit) || 25));
    if (!query) {
      return res.status(200).json({ query: "", tracks: [], artists: [], albums: [] });
    }

    // TEMP: YouTube off — Saavn + Audius only
    const global = isGlobal(query);
    const [audius, saavn] = await Promise.all([
      searchAudius(query, limit).catch(() => []),
      searchSaavn(query, limit).catch(() => []),
    ]);

    const buckets = global
      ? [
          audius.filter((t) => t.streamUrl),
          saavn.filter((t) => t.streamUrl),
          audius,
          saavn,
        ]
      : [
          saavn.filter((t) => t.streamUrl),
          audius.filter((t) => t.streamUrl),
          saavn,
          audius,
        ];

    const tracks = merge(buckets, limit);
    res.setHeader("X-Gmax-Yt", "0");
    res.setHeader("X-Gmax-Audius", String(audius.length));
    res.setHeader("X-Gmax-Saavn", String(saavn.length));
    return res.status(200).json({
      query,
      tracks,
      artists: [],
      albums: [],
    });
  } catch (err) {
    return res.status(200).json({
      query: "",
      tracks: [],
      artists: [],
      albums: [],
      error: String(err?.message || err),
    });
  }
}
