/**
 * Shared YouTube audio URL resolver for stream + audio proxy.
 * Order: youtubei.js clients → Piped instances → Invidious instances.
 */

import { Innertube, UniversalCache } from 'youtubei.js';

let youtubeClient = null;
let clientPromise = null;

async function getYouTubeClient() {
  if (youtubeClient) return youtubeClient;
  if (clientPromise) return clientPromise;
  clientPromise = Innertube.create({
    cache: new UniversalCache(false),
    generate_session_locally: false,
    enable_session_cache: false,
  })
    .then((c) => {
      youtubeClient = c;
      return c;
    })
    .catch((err) => {
      clientPromise = null;
      throw err;
    });
  return clientPromise;
}

async function resolveAudioUrl(format, player) {
  if (!format) return null;
  if (format.url && typeof format.url === 'string' && format.url.startsWith('http')) {
    return format.url;
  }
  if (!player) return null;
  try {
    let url = format.decipher(player);
    if (url && typeof url.then === 'function') url = await url;
    if (url && typeof url === 'string') return url;
  } catch {
    /* */
  }
  return null;
}

const CLIENTS = ['IOS', 'ANDROID', 'TVHTML5', 'WEB'];

async function fromYoutubei(videoId) {
  const yt = await getYouTubeClient();
  let info = null;
  let lastErr = null;
  for (const client of CLIENTS) {
    try {
      info = await yt.getBasicInfo(videoId, client);
      if (info) break;
    } catch (e) {
      lastErr = e;
      info = null;
    }
  }
  if (!info) {
    const msg = lastErr?.message || 'youtubei failed';
    throw new Error(msg);
  }
  if (info.playability_status?.status && info.playability_status.status !== 'OK') {
    throw new Error(
      info.playability_status.reason || info.playability_status.status || 'Not playable',
    );
  }
  let audioFormat = null;
  try {
    audioFormat = info.chooseFormat({ type: 'audio', quality: 'best' });
  } catch {
    const adaptive = info.streaming_data?.adaptive_formats || [];
    audioFormat =
      adaptive.find((f) => f.has_audio && !f.has_video) ||
      adaptive.find((f) => String(f.mime_type || '').startsWith('audio/')) ||
      null;
  }
  if (!audioFormat) throw new Error('No audio format');
  const url = await resolveAudioUrl(audioFormat, yt.session.player);
  if (!url) throw new Error('Decipher failed');
  const basic = info.basic_info || {};
  const thumbs = basic.thumbnail;
  let thumbnail = '';
  if (Array.isArray(thumbs) && thumbs.length) {
    const sorted = [...thumbs].sort(
      (a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0),
    );
    thumbnail = sorted[0]?.url || '';
  }
  return {
    url,
    mime: (audioFormat.mime_type || 'audio/mp4').split(';')[0].trim(),
    title: basic.title || 'Unknown',
    artist: basic.author || 'Unknown',
    thumbnail,
    duration: Number(basic.duration) || 0,
    source: 'youtubei',
  };
}

const PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.private.coffee',
  'https://pipedapi.nosea.vip',
];

async function fromPiped(videoId) {
  let last = 'piped failed';
  for (const base of PIPED) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`${base}/streams/${videoId}`, {
        signal: ctrl.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timer);
      if (!res.ok) {
        last = `piped ${res.status}`;
        continue;
      }
      const data = await res.json();
      const streams = data.audioStreams || data.audio_streams || [];
      if (!streams.length) {
        last = 'no audioStreams';
        continue;
      }
      // Prefer m4a / higher bitrate
      const sorted = [...streams].sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const best = sorted[0];
      const url = best.url || best.playableUrl;
      if (!url) continue;
      return {
        url,
        mime: best.mimeType || best.mime_type || 'audio/mp4',
        title: data.title || 'Unknown',
        artist: data.uploader || data.author || 'Unknown',
        thumbnail: data.thumbnailUrl || data.thumbnail || '',
        duration: Number(data.duration) || 0,
        source: 'piped',
      };
    } catch (e) {
      last = e?.message || 'piped error';
    }
  }
  throw new Error(last);
}

const INVIDIOUS = [
  'https://yewtu.be',
  'https://invidious.nerdvpn.de',
  'https://vid.puffyan.us',
  'https://inv.nadeko.net',
];

async function fromInvidious(videoId) {
  let last = 'invidious failed';
  for (const base of INVIDIOUS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`${base}/api/v1/videos/${videoId}`, {
        signal: ctrl.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timer);
      if (!res.ok) {
        last = `invidious ${res.status}`;
        continue;
      }
      const data = await res.json();
      const formats = data.adaptiveFormats || data.adaptive_formats || [];
      const audio = formats
        .filter((f) => String(f.type || f.mimeType || '').startsWith('audio/'))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      const best = audio[0];
      if (!best?.url) {
        last = 'no audio format';
        continue;
      }
      return {
        url: best.url,
        mime: (best.type || best.mimeType || 'audio/mp4').split(';')[0].trim(),
        title: data.title || 'Unknown',
        artist: data.author || 'Unknown',
        thumbnail: data.videoThumbnails?.[0]?.url || '',
        duration: Number(data.lengthSeconds) || 0,
        source: 'invidious',
      };
    } catch (e) {
      last = e?.message || 'invidious error';
    }
  }
  throw new Error(last);
}

/**
 * @returns {Promise<{
 *  url: string,
 *  mime: string,
 *  title: string,
 *  artist: string,
 *  thumbnail: string,
 *  duration: number,
 *  source: string
 * }>}
 */
export async function resolveYouTubeAudio(videoId) {
  const errors = [];

  // 1) youtubei (often blocked on Vercel IPs)
  try {
    return await fromYoutubei(videoId);
  } catch (e) {
    errors.push(`youtubei: ${e?.message || e}`);
  }

  // 2) Piped
  try {
    return await fromPiped(videoId);
  } catch (e) {
    errors.push(`piped: ${e?.message || e}`);
  }

  // 3) Invidious
  try {
    return await fromInvidious(videoId);
  } catch (e) {
    errors.push(`invidious: ${e?.message || e}`);
  }

  throw new Error(errors.join(' | ') || 'All extractors failed');
}
