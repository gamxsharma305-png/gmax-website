/**
 * YouTube → same-origin stream URL for reliable lock-screen / background play.
 *
 * Uses /api/stream?videoId=… (Vercel proxies Piped → audio bytes).
 * External googlevideo URLs break on mobile when the screen locks;
 * same-origin proxy avoids that.
 *
 * localStorage gmax.forceIframe = "1" forces old iframe path.
 */

const cache = new Map<string, { url: string; ts: number }>();
const TTL = 15 * 60 * 1000;

export function preferIframeBackup(): boolean {
  try {
    return localStorage.getItem("gmax.forceIframe") === "1";
  } catch {
    return false;
  }
}

/** Same-origin proxy URL — preferred for HTML5 <audio> on mobile. */
export function ytStreamProxyUrl(videoId: string): string {
  return `/api/stream?videoId=${encodeURIComponent(videoId)}`;
}

/**
 * Resolve playable URL for a YouTube videoId.
 * Returns same-origin /api/stream so Media Session + lock screen work.
 */
export async function resolveYtDirectAudio(
  videoId: string,
): Promise<{ url: string; source?: string } | null> {
  if (!videoId || preferIframeBackup()) return null;
  if (!/^[\w-]{6,20}$/.test(videoId)) return null;

  const hit = cache.get(videoId);
  if (hit && Date.now() - hit.ts < TTL) {
    return { url: hit.url, source: "cache" };
  }

  // Prefer same-origin proxy immediately (best for background audio)
  const proxy = ytStreamProxyUrl(videoId);

  // Lightweight HEAD/GET check — if proxy is up, use it
  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(proxy, {
      method: "GET",
      headers: { Range: "bytes=0-1" },
      signal: ctrl.signal,
    });
    window.clearTimeout(t);
    // 200 or 206 = stream works
    if (res.ok || res.status === 206) {
      cache.set(videoId, { url: proxy, ts: Date.now() });
      // Cancel body read to free connection
      try {
        res.body?.cancel();
      } catch {
        /* */
      }
      return { url: proxy, source: "stream-proxy" };
    }
  } catch {
    /* fall through to yt-audio JSON resolve */
  }

  // Fallback: JSON resolve (external URL) — may stop on lock screen
  try {
    const res = await fetch(`/api/yt-audio?videoId=${encodeURIComponent(videoId)}`);
    const json = (await res.json()) as {
      success?: boolean;
      url?: string;
      source?: string;
    };
    if (res.ok && json.success && json.url?.startsWith("http")) {
      // Still prefer proxy if we have videoId
      cache.set(videoId, { url: proxy, ts: Date.now() });
      return { url: proxy, source: json.source || "yt-audio" };
    }
  } catch {
    /* */
  }

  // Last resort: still return proxy URL — engine will try; iframe backup if fails
  cache.set(videoId, { url: proxy, ts: Date.now() });
  return { url: proxy, source: "stream-proxy" };
}
