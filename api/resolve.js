const APP = "GMAXPlayer";

async function fetchJson(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json", "User-Agent": "GMAX/1.0" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function pickStream(downloadUrl) {
  if (!Array.isArray(downloadUrl)) return "";
  let best = "";
  let score = -1;
  for (const item of downloadUrl) {
    if (!item || typeof item !== "object") continue;
    const q = String(item.quality || "").toLowerCase();
    const url = item.url || item.link || "";
    if (!url) continue;
    let s = 1;
    if (q.includes("320")) s = 320;
    else if (q.includes("160")) s = 160;
    if (s > score) {
      score = s;
      best = url;
    }
  }
  return best;
}

async function resolveSaavn(title, artist) {
  const q = [artist, title].filter(Boolean).join(" ").trim() || title;
  const data = await fetchJson(
    `https://jiosaavn-api-taupe.vercel.app/search/songs?query=${encodeURIComponent(q)}&limit=5`,
  );
  const results = data?.data?.results || [];
  for (const item of results) {
    const streamUrl = pickStream(item.downloadUrl);
    if (streamUrl) {
      return { streamUrl, duration: Number(item.duration) || null, videoId: null };
    }
  }
  return null;
}

async function resolveAudius(title, artist) {
  const q = [artist, title].filter(Boolean).join(" ").trim() || title;
  const data = await fetchJson(
    `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(q)}&app_name=${APP}&limit=5`,
  );
  const list = data?.data || [];
  for (const item of list) {
    if (item?.id) {
      return {
        streamUrl: `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(item.id)}/stream?app_name=${APP}`,
        duration: Number(item.duration) || null,
        videoId: null,
      };
    }
  }
  return null;
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
    const title = String(body.title || "").trim();
    const artist = String(body.artist || "").trim();
    if (!title) return res.status(200).json({ videoId: null, streamUrl: null });

    const saavn = await resolveSaavn(title, artist).catch(() => null);
    if (saavn?.streamUrl) return res.status(200).json(saavn);

    const audius = await resolveAudius(title, artist).catch(() => null);
    if (audius?.streamUrl) return res.status(200).json(audius);

    return res.status(200).json({ videoId: null, streamUrl: null });
  } catch {
    return res.status(200).json({ videoId: null, streamUrl: null });
  }
}
