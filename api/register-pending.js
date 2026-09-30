/**
 * POST /api/register-pending
 * Body: { deviceId, profileId?, plan, amount }
 * Saves latest pending per amount (overwrite — no FIFO queue).
 */

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function durationSecFromAmount(amountRupees) {
  const a = parseInt(String(amountRupees).replace(/[^0-9]/g, ''), 10) || 0;
  if (a === 1) return 20 * 60;
  if (a === 59 || a >= 399) return 90 * 24 * 60 * 60;
  if (a === 49 || a >= 299) return 60 * 24 * 60 * 60;
  if (a === 29 || a >= 199) return 30 * 24 * 60 * 60;
  return 30 * 24 * 60 * 60;
}

function planLabelFromAmount(amountRupees) {
  const a = parseInt(String(amountRupees).replace(/[^0-9]/g, ''), 10) || 0;
  if (a === 1) return 'Test 20 min';
  if (a === 59 || a >= 399) return '3 Months';
  if (a === 49 || a >= 299) return '2 Months';
  return '1 Month';
}

function redisEnv() {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '');
  return { url, token };
}

async function redisSet(key, value, expSeconds) {
  const { url, token } = redisEnv();
  if (!url || !token) return false;
  let path =
    url +
    '/set/' +
    encodeURIComponent(key) +
    '/' +
    encodeURIComponent(JSON.stringify(value));
  if (expSeconds) path += '?EX=' + expSeconds;
  const r = await fetch(path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
  });
  return r.ok;
}

/** Static Payment Page / Payment Link URLs from env (no API keys). */
function paymentLinkForAmount(amount) {
  const a = String(amount);
  return (
    process.env['RAZORPAY_PAYMENT_PAGE_' + a] ||
    process.env['PAYMENT_PAGE_' + a] ||
    process.env['PAYMENT_LINK_' + a] ||
    process.env.RAZORPAY_PAYMENT_PAGE_URL ||
    ''
  );
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const deviceId = String(body.deviceId || '').trim();
  const profileId = String(body.profileId || 'gmax').toLowerCase() === 'edu' ? 'edu' : 'gmax';
  const amount = parseInt(String(body.amount || '').replace(/[^0-9]/g, ''), 10) || 0;
  const plan = String(body.plan || planLabelFromAmount(amount));

  if (!deviceId || deviceId.length < 6) {
    return res.status(400).json({ ok: false, error: 'deviceId required' });
  }
  if (![1, 29, 49, 59].includes(amount)) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid amount. Allowed: 1, 29, 49, 59',
    });
  }

  const durationSec = durationSecFromAmount(amount);
  const id = 'p_' + Date.now().toString(36);
  const pending = {
    id,
    deviceId,
    profileId,
    plan,
    amount,
    durationSec,
    status: 'pending',
    ts: Date.now(),
  };

  const ttl = 45 * 60;
  const redisOk = await redisSet('gmax:latest_pending:' + amount, pending, ttl);
  await redisSet(
    'gmax:plink_device:' + profileId + ':' + deviceId,
    { pendingId: id, amount, plan, status: 'pending', ts: Date.now() },
    ttl,
  );

  const paymentPageUrl = paymentLinkForAmount(amount);

  return res.status(200).json({
    ok: true,
    pendingId: id,
    amount,
    plan,
    deviceId,
    profileId,
    durationSec,
    redis: redisOk,
    paymentPageUrl: paymentPageUrl || null,
    hint: paymentPageUrl
      ? 'Redirect user to paymentPageUrl'
      : 'Set RAZORPAY_PAYMENT_PAGE_29 / _49 / _59 on Vercel to your rzp.io links',
  });
}
