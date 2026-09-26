/**
 * Verify Razorpay payment signature after checkout success.
 * Env: RAZORPAY_KEY_SECRET
 */
import crypto from 'crypto';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    return res.status(500).json({ success: false, error: 'Server misconfigured' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    planId,
  } = body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ success: false, error: 'Missing payment fields' });
  }

  const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  if (expected !== razorpay_signature) {
    return res.status(400).json({ success: false, error: 'Invalid signature' });
  }

  // Signature OK — client activates premium locally.
  // For multi-device / server-side entitlement, store payment in a DB here.
  return res.status(200).json({
    success: true,
    planId: planId || null,
    paymentId: razorpay_payment_id,
    orderId: razorpay_order_id,
  });
}
