/** Strict Saavn resolve — prefer exact title match so the correct song plays. */

export type SaavnResolved = {
  streamUrl: string;
  duration?: number;
  title?: string;
  artist?: string;
};

function pickStream(downloadUrl: unknown): string {
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
    const q = String((item as { quality?: string }).quality || "").toLowerCase();
    const url =
      (item as { url?: string; link?: string }).url ||
      (item as { link?: string }).link ||
      "";
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

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/official|video|lyrics|audio|slowed|reverb|remix|full song/gi, " ")
    .replace(/[^a-z0-9\u0900-\u097f\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreMatch(
  wantTitle: string,
  wantArtist: string,
  gotTitle: string,
  gotArtist: string,
): number {
  const wt = norm(wantTitle);
  const gt = norm(gotTitle);
  if (!wt || !gt) return 0;
  let s = 0;
  if (gt === wt) s += 100;
  else if (gt.includes(wt) || wt.includes(gt)) s += 70;
  else {
    const wWords = wt.split(" ").filter((w) => w.length > 2);
    const hits = wWords.filter((w) => gt.includes(w)).length;
    if (wWords.length) s += (hits / wWords.length) * 40;
  }
  const wa = norm(wantArtist);
  const ga = norm(gotArtist);
  if (wa && ga) {
    if (ga === wa || ga.includes(wa) || wa.includes(ga)) s += 40;
    else {
      const parts = wa.split(/[,&]|\s+/).filter((p) => p.length > 2);
      if (parts.some((p) => ga.includes(p))) s += 20;
    }
  }
  return s;
}

export async function resolveSaavnStream(
  title: string,
  artist = "",
): Promise<SaavnResolved | null> {
  const q = [title, artist].filter(Boolean).join(" ").trim();
  if (!q) return null;

  const bases = [
    "https://jiosaavn-api-taupe.vercel.app",
    "https://saavn-api.vercel.app",
  ];

  for (const base of bases) {
    try {
      const res = await fetch(
        `${base}/search/songs?query=${encodeURIComponent(q)}&limit=8`,
      );
      if (!res.ok) continue;
      const data = await res.json();
      const results =
        data?.data?.results ||
        data?.results ||
        (Array.isArray(data?.data) ? data.data : null);
      if (!Array.isArray(results) || !results.length) continue;

      let best: (typeof results)[0] | null = null;
      let bestScore = 0;
      for (const item of results) {
        const t = item.name || item.title || "";
        const a =
          item.primaryArtists ||
          (item.artists?.primary || []).map((x: { name: string }) => x.name).join(", ") ||
          "";
        const sc = scoreMatch(title, artist, t, a);
        if (sc > bestScore) {
          bestScore = sc;
          best = item;
        }
      }

      // Reject weak matches — better no stream than wrong song
      if (!best || bestScore < 50) continue;

      const streamUrl =
        pickStream(best.downloadUrl) ||
        pickStream(best.download_url) ||
        best.media_url ||
        "";
      if (!streamUrl.startsWith("http")) continue;

      return {
        streamUrl,
        duration: Number(best.duration) || undefined,
        title: best.name || best.title,
        artist:
          best.primaryArtists ||
          (best.artists?.primary || []).map((x: { name: string }) => x.name).join(", "),
      };
    } catch {
      /* try next base */
    }
  }
  return null;
}
