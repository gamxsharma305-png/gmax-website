/**
 * Razorpay webhook — payment.captured etc.
 * Env: RAZORPAY_WEBHOOK_SECRET
 *
 * Dashboard → Settings → Webhooks →
 *   URL: https://YOUR_DOMAIN/api/razorpay/webhook
 *   Events: payment.captured, order.paid
 */
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false });
  }

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
  const signature = req.headers['x-razorpay-signature'];

  // Raw body: Vercel may parse JSON — re-stringify for HMAC when needed
  const raw =
    typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body ?? {});

  if (secret && signature) {
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    if (expected !== signature) {
      console.warn('[razorpay webhook] invalid signature');
      return res.status(400).json({ ok: false, error: 'Invalid signature' });
    }
  }

  const event = typeof req.body === 'object' ? req.body : JSON.parse(raw || '{}');
  const eventName = event?.event;
  const payment = event?.payload?.payment?.entity;

  console.log('[razorpay webhook]', eventName, {
    paymentId: payment?.id,
    orderId: payment?.order_id,
    amount: payment?.amount,
    status: payment?.status,
    notes: payment?.notes,
  });

  // TODO: persist to DB / mark user premium by email or notes.userId
  // For now we acknowledge — client already verifies via /api/razorpay/verify

  return res.status(200).json({ ok: true });
}
