/**
 * INSTGMAX-style: register "Pay Now" intent before opening Payment Page.
 * No Razorpay API keys required — only Upstash Redis (optional) + payment page links.
 *
 * POST { planId: 'm1'|'m2'|'m3', deviceId }
 */

const PLAN_AMOUNT = { m1: 29, m2: 49, m3: 59 };
const PLAN_MONTHS = { m1: 1, m2: 2, m3: 3 };

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'POST only' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const planId = String(body.planId || '');
  const deviceId = String(body.deviceId || '').trim() || 'web-' + Date.now();
  const amount = PLAN_AMOUNT[planId];
  if (!amount) {
    return res.status(400).json({ success: false, error: 'Invalid planId' });
  }

  const pageUrl =
    process.env[`RAZORPAY_PAYMENT_PAGE_${amount}`] ||
    process.env[`PAYMENT_PAGE_${amount}`] ||
    process.env.RAZORPAY_PAYMENT_PAGE_URL ||
    '';

  const pending = {
    deviceId,
    planId,
    amount,
    months: PLAN_MONTHS[planId],
    ts: Date.now(),
  };

  // Best-effort Redis (same as INSTGMAX). Works without Redis if you only open the link.
  try {
    await redisSet('gmax:latest_pending:' + amount, pending, 45 * 60);
    await redisSet('gmax:pending_device:' + deviceId, pending, 45 * 60);
  } catch {
    /* */
  }

  return res.status(200).json({
    success: true,
    amount,
    planId,
    deviceId,
    paymentPageUrl: pageUrl || null,
    hint: pageUrl
      ? 'Open payment page, pay within 45 min'
      : 'Set RAZORPAY_PAYMENT_PAGE_29 / _49 / _59 env to your Razorpay Payment Page links',
  });
}
