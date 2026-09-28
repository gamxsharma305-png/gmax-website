import { resolveYouTubeAudio } from './yt-resolve.js';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const videoId = String(req.query?.videoId || '').trim();
  if (!videoId || !/^[\w-]{6,20}$/.test(videoId)) {
    return res.status(400).json({
      success: false,
      error: 'Missing or invalid "videoId" query parameter.',
    });
  }

  try {
    const data = await resolveYouTubeAudio(videoId);
    return res.status(200).json({
      success: true,
      data: {
        url: data.url,
        title: data.title,
        artist: data.artist,
        thumbnail: data.thumbnail,
        duration: data.duration,
        mimeType: data.mime,
        videoId,
        source: data.source,
      },
    });
  } catch (error) {
    console.error('[stream]', videoId, error?.message || error);
    const msg = String(error?.message || 'Failed to extract audio');
    if (/bot|sign in/i.test(msg)) {
      return res.status(503).json({
        success: false,
        error: 'YouTube is blocking this server right now. Try again in a minute.',
      });
    }
    return res.status(500).json({ success: false, error: msg });
  }
}
