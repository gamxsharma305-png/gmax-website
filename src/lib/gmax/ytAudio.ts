/**
 * Resolve YouTube videoId → direct audio URL (Piped → Cobalt via /api/yt-audio).
 * Iframe remains as backup in engine when this fails or FORCE_IFRAME is on.
 */

const cache = new Map<string, { url: string; ts: number }>();
const TTL = 10 * 60 * 1000;

/** Set localStorage gmax.forceIframe = "1" to force old iframe path. */
export function preferIframeBackup(): boolean {
  try {
    return localStorage.getItem("gmax.forceIframe") === "1";
  } catch {
    return false;
  }
}

export async function resolveYtDirectAudio(
  videoId: string,
): Promise<{ url: string; source?: string } | null> {
  if (!videoId || preferIframeBackup()) return null;

  const hit = cache.get(videoId);
  if (hit && Date.now() - hit.ts < TTL) {
    return { url: hit.url, source: "cache" };
  }

  try {
    const res = await fetch(`/api/yt-audio?videoId=${encodeURIComponent(videoId)}`);
    const json = (await res.json()) as {
      success?: boolean;
      url?: string;
      source?: string;
    };
    if (res.ok && json.success && json.url?.startsWith("http")) {
      cache.set(videoId, { url: json.url, ts: Date.now() });
      return { url: json.url, source: json.source };
    }
  } catch {
    /* */
  }
  return null;
}
