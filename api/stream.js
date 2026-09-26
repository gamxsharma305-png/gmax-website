import { Innertube, UniversalCache } from 'youtubei.js';

/**
 * Warm-instance singleton — avoids re-creating Innertube on every invoke.
 * Vercel may still cold-start; generate_session_locally reduces shared-IP issues.
 */
let youtubeClient = null;
let clientPromise = null;

async function getYouTubeClient() {
  if (youtubeClient) return youtubeClient;
  if (clientPromise) return clientPromise;

  clientPromise = Innertube.create({
    cache: new UniversalCache(false),
    generate_session_locally: true,
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
  // Prefer larger images for mediaSession artwork
  const sorted = [...thumbs].sort(
    (a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0),
  );
  const url = sorted[0]?.url || '';
  return typeof url === 'string' ? url : '';
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
}

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
    const info = await yt.getBasicInfo(videoId);

    // Age-restricted / unplayable
    if (info.playability_status?.status && info.playability_status.status !== 'OK') {
      const reason =
        info.playability_status.reason ||
        info.playability_status.status ||
        'Video is not playable';
      const code =
        /age|restrict/i.test(String(reason)) || info.basic_info?.is_age_restricted
          ? 403
          : 404;
      return res.status(code).json({
        success: false,
        error: reason,
      });
    }

    let audioFormat;
    try {
      audioFormat = info.chooseFormat({
        type: 'audio',
        quality: 'best',
      });
    } catch {
      audioFormat = null;
    }

    if (!audioFormat) {
      return res.status(404).json({
        success: false,
        error: 'No suitable audio stream found for this video.',
      });
    }

    // decipher may be sync or async depending on youtubei.js version
    let audioUrl = audioFormat.decipher(yt.session.player);
    if (audioUrl && typeof audioUrl.then === 'function') {
      audioUrl = await audioUrl;
    }

    if (!audioUrl || typeof audioUrl !== 'string') {
      return res.status(500).json({
        success: false,
        error: 'Failed to decipher audio stream URL.',
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
        mimeType: audioFormat.mime_type || 'audio/webm',
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
