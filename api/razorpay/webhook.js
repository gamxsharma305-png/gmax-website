/**
 * INSTGMAX Payment Page webhook — no checkout API keys needed.
 * Razorpay Dashboard → Webhooks → payment.captured / payment_link.paid
 * URL: https://YOUR_DOMAIN/api/razorpay/webhook
 */

const PLAN_BY_AMOUNT = {
  29: { planId: 'm1', months: 1 },
  49: { planId: 'm2', months: 2 },
  59: { planId: 'm3', months: 3 },
};

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
  try {
    if (typeof v === 'string') v = JSON.parse(v);
  } catch {
    return null;
  }
  return typeof v === 'object' && v ? v : null;
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

async function redisDel(key) {
  const { url, token } = redisEnv();
  if (!url || !token) return;
  try {
    await fetch(url + '/del/' + encodeURIComponent(key), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
    });
  } catch {
    /* */
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(200).send('OK');

  let event = {};
  try {
    event =
      typeof req.body === 'object' && req.body
        ? req.body
        : JSON.parse(typeof req.body === 'string' ? req.body : '{}');
  } catch {
    event = {};
  }

  const eventName = String(event.event || '');
  const payload = event.payload || {};
  let amountPaise = 0;
  let paymentId = '';

  if (eventName === 'payment_link.paid' || payload.payment_link) {
    const pl = (payload.payment_link && payload.payment_link.entity) || {};
    const pay = (payload.payment && payload.payment.entity) || {};
    amountPaise = parseInt(pl.amount_paid || pl.amount || pay.amount || 0, 10) || 0;
    paymentId = String(pay.id || '');
  } else if (
    eventName === 'payment.captured' ||
    eventName === 'payment.authorized' ||
    payload.payment
  ) {
    const pay = (payload.payment && payload.payment.entity) || payload.payment || {};
    amountPaise = parseInt(pay.amount || 0, 10) || 0;
    paymentId = String(pay.id || '');
  } else {
    return res.status(200).json({ ok: true, ignored: eventName || 'unknown' });
  }

  const amountRupees = Math.round(amountPaise / 100);
  const plan = PLAN_BY_AMOUNT[amountRupees];
  if (!plan) {
    return res.status(200).json({ ok: true, ignored: 'amount', amountRupees });
  }

  if (paymentId) {
    const seen = await redisGet('gmax:rzp_paid:' + paymentId).catch(() => null);
    if (seen) {
      return res.status(200).json({ ok: true, duplicate: true });
    }
  }

  const pending = await redisGet('gmax:latest_pending:' + amountRupees).catch(() => null);
  if (pending && pending.deviceId) {
    const age = Date.now() - (pending.ts || 0);
    if (age < 45 * 60 * 1000) {
      const months = plan.months;
      const until = Date.now() + months * 30 * 24 * 60 * 60 * 1000;
      const expSec = months * 30 * 24 * 60 * 60 + 86400;
      const rec = {
        until,
        planId: plan.planId,
        amount: amountRupees,
        paymentId,
        method: 'payment_page',
        deviceId: pending.deviceId,
      };
      await redisSet('sub:' + pending.deviceId, rec, expSec);
      await redisSet('gmax:premium:' + pending.deviceId, rec, expSec);
      if (paymentId) {
        await redisSet('gmax:rzp_paid:' + paymentId, rec, 30 * 24 * 60 * 60);
      }
      await redisDel('gmax:latest_pending:' + amountRupees);
      return res.status(200).json({ ok: true, activated: true, deviceId: pending.deviceId, until });
    }
  }

  // Store claimable payment if no pending device
  if (paymentId) {
    await redisSet(
      'gmax:rzp_claim:' + paymentId,
      { amount: amountRupees, planId: plan.planId, paymentId, ts: Date.now() },
      7 * 24 * 60 * 60,
    );
  }

  return res.status(200).json({
    ok: true,
    noPending: true,
    paymentId,
    amountRupees,
    hint: 'User should tap Pay on site first, then complete payment within 45 min',
  });
}
