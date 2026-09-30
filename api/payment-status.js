/**
 * GET /api/payment-status?deviceId=XXX&profileId=gmax
 */

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function redisEnv() {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '');
  return { url, token };
}

async function redisGet(key) {
  const { url, token } = redisEnv();
  if (!url || !token) return null;
  const r = await fetch(url + '/get/' + encodeURIComponent(key), {
    headers: { Authorization: 'Bearer ' + token },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.result == null || j.result === '') return null;
  let v = j.result;
  for (let i = 0; i < 3; i++) {
    if (typeof v === 'object' && v !== null) return v;
    if (typeof v !== 'string') break;
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  return typeof v === 'object' && v ? v : null;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'GET only' });
  }

  const deviceId = String(req.query?.deviceId || '').trim();
  const profileId =
    String(req.query?.profileId || 'gmax').toLowerCase() === 'edu' ? 'edu' : 'gmax';

  if (!deviceId) {
    return res.status(400).json({ ok: false, error: 'deviceId required' });
  }

  const access = await redisGet('gmax:access:' + profileId + ':' + deviceId);
  if (access && access.until && access.until > Date.now()) {
    return res.status(200).json({
      ok: true,
      status: 'approved',
      until: access.until,
      plan: access.plan,
      profileId,
      amount: access.amount,
    });
  }

  const sub = await redisGet('sub:' + deviceId);
  if (sub && sub.until && sub.until > Date.now()) {
    return res.status(200).json({
      ok: true,
      status: 'approved',
      until: sub.until,
      plan: sub.plan,
      profileId: sub.profileId || profileId,
      amount: sub.amount,
    });
  }

  const plink = await redisGet('gmax:plink_device:' + profileId + ':' + deviceId);
  if (plink && plink.status === 'approved' && plink.until && plink.until > Date.now()) {
    return res.status(200).json({
      ok: true,
      status: 'approved',
      until: plink.until,
      plan: plink.plan,
      profileId,
    });
  }

  if (plink && plink.status === 'pending') {
    return res.status(200).json({
      ok: true,
      status: 'pending',
      plan: plink.plan,
      amount: plink.amount,
      profileId,
    });
  }

  return res.status(200).json({ ok: true, status: 'none', profileId });
}
