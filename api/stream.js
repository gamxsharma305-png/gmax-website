import { Innertube, UniversalCache } from 'youtubei.js';

/**
 * Warm-instance singleton — reuses Innertube across warm serverless invokes.
 * Do NOT use generate_session_locally: true — YouTube rejects random visitor tokens (400).
 */
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
    .then((client) => {
      youtubeClient = client;
      return client;
    })
    .catch((err) => {
      clientPromise = null;
      throw err;
    });

  return clientPromise;
}

function pickThumbnail(basicInfo) {
  const thumbs = basicInfo?.thumbnail;
  if (!Array.isArray(thumbs) || !thumbs.length) return '';
  const sorted = [...thumbs].sort(
    (a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0),
  );
  const url = sorted[0]?.url || '';
  return typeof url === 'string' ? url : '';
}

async function resolveAudioUrl(format, player) {
  if (!format) return null;
  // Prefer plain URL when already present (mobile clients often skip cipher)
  if (format.url && typeof format.url === 'string' && format.url.startsWith('http')) {
    return format.url;
  }
  if (!player) return null;
  try {
    let url = format.decipher(player);
    if (url && typeof url.then === 'function') url = await url;
    if (url && typeof url === 'string') return url;
  } catch {
    /* cipher failed */
  }
  return null;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=180, stale-while-revalidate=300');
}

/** Try multiple InnerTube clients — mobile often returns playable audio URLs. */
const CLIENTS = ['IOS', 'ANDROID', 'WEB'];

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET ?videoId=...',
    });
  }

  const videoId = String(req.query?.videoId || '').trim();

  if (!videoId || !/^[\w-]{6,20}$/.test(videoId)) {
    return res.status(400).json({
      success: false,
      error: 'Missing or invalid "videoId" query parameter.',
    });
  }

  try {
    const yt = await getYouTubeClient();

    let info = null;
    let lastError = null;

    for (const client of CLIENTS) {
      try {
        info = await yt.getBasicInfo(videoId, client);
        if (info) break;
      } catch (err) {
        lastError = err;
        info = null;
      }
    }

    if (!info) {
      const msg = lastError?.message || 'Failed to load video info';
      const lower = msg.toLowerCase();
      if (lower.includes('not found') || lower.includes('unavailable')) {
        return res.status(404).json({ success: false, error: msg });
      }
      return res.status(500).json({ success: false, error: msg });
    }

    if (info.playability_status?.status && info.playability_status.status !== 'OK') {
      const reason =
        info.playability_status.reason ||
        info.playability_status.status ||
        'Video is not playable';
      const code =
        /age|restrict/i.test(String(reason)) || info.basic_info?.is_age_restricted
          ? 403
          : 404;
      return res.status(code).json({ success: false, error: reason });
    }

    let audioFormat = null;
    try {
      audioFormat = info.chooseFormat({ type: 'audio', quality: 'best' });
    } catch {
      // Fallback: first adaptive audio format
      const adaptive = info.streaming_data?.adaptive_formats || [];
      audioFormat =
        adaptive.find((f) => f.has_audio && !f.has_video) ||
        adaptive.find((f) => String(f.mime_type || '').startsWith('audio/')) ||
        null;
    }

    if (!audioFormat) {
      return res.status(404).json({
        success: false,
        error: 'No suitable audio stream found for this video.',
      });
    }

    const audioUrl = await resolveAudioUrl(audioFormat, yt.session.player);

    if (!audioUrl) {
      return res.status(500).json({
        success: false,
        error: 'Failed to resolve audio stream URL (cipher/decipher).',
      });
    }

    const basic = info.basic_info || {};

    return res.status(200).json({
      success: true,
      data: {
        url: audioUrl,
        title: basic.title || 'Unknown Title',
        artist: basic.author || 'Unknown Artist',
        thumbnail: pickThumbnail(basic),
        duration: Number(basic.duration) || 0,
        mimeType: audioFormat.mime_type || 'audio/mp4',
        videoId,
      },
    });
  } catch (error) {
    console.error('[YouTube stream error]', videoId, error?.message || error);

    const msg = String(error?.message || 'Failed to extract audio stream.');
    const lower = msg.toLowerCase();

    if (lower.includes('not found') || lower.includes('unavailable')) {
      return res.status(404).json({ success: false, error: msg });
    }
    if (lower.includes('age') || lower.includes('restrict')) {
      return res.status(403).json({ success: false, error: msg });
    }

    return res.status(500).json({
      success: false,
      error: msg,
    });
  }
}
