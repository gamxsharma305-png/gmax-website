/**
 * YouTube → playable URL.
 * Prefers same-origin /api/stream (lock-screen friendly).
 * If proxy returns 404 (Piped/Invidious down), returns null so engine uses iframe backup.
 */

const cache = new Map<string, { url: string; ts: number }>();
const failCache = new Map<string, number>();
const TTL = 12 * 60 * 1000;
const FAIL_TTL = 2 * 60 * 1000;

export function preferIframeBackup(): boolean {
  try {
    return localStorage.getItem("gmax.forceIframe") === "1";
  } catch {
    return false;
  }
}

export function ytStreamProxyUrl(videoId: string): string {
  return `/api/stream?videoId=${encodeURIComponent(videoId)}`;
}

export async function resolveYtDirectAudio(
  videoId: string,
): Promise<{ url: string; source?: string } | null> {
  if (!videoId || preferIframeBackup()) return null;
  if (!/^[\w-]{6,20}$/.test(videoId)) return null;

  const failedAt = failCache.get(videoId);
  if (failedAt && Date.now() - failedAt < FAIL_TTL) return null;

  const hit = cache.get(videoId);
  if (hit && Date.now() - hit.ts < TTL) {
    return { url: hit.url, source: "cache" };
  }

  const proxy = ytStreamProxyUrl(videoId);

  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(proxy, {
      method: "GET",
      headers: { Range: "bytes=0-1023" },
      signal: ctrl.signal,
    });
    window.clearTimeout(t);

    if (res.status === 404 || res.status === 502) {
      failCache.set(videoId, Date.now());
      try {
        res.body?.cancel();
      } catch {
        /* */
      }
      return null; // iframe backup
    }

    if (res.ok || res.status === 206 || res.status === 302) {
      cache.set(videoId, { url: proxy, ts: Date.now() });
      try {
        res.body?.cancel();
      } catch {
        /* */
      }
      return { url: proxy, source: "stream-proxy" };
    }
  } catch {
    failCache.set(videoId, Date.now());
    return null;
  }

  failCache.set(videoId, Date.now());
  return null;
}
