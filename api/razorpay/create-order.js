/**
 * Create Razorpay order for GMAX Premium.
 * Env: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
 */

const PLANS = {
  m1: { months: 1, amountInr: 29 },
  m2: { months: 2, amountInr: 49 },
  m3: { months: 3, amountInr: 59 },
};

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

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return res.status(500).json({
      success: false,
      error:
        'Razorpay keys missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Vercel env.',
    });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const planId = body.planId;
  const plan = PLANS[planId];
  if (!plan) {
    return res.status(400).json({ success: false, error: 'Invalid planId' });
  }

  const amountPaise = plan.amountInr * 100;
  const receipt = `gmax_${planId}_${Date.now()}`;

  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt,
        notes: {
          product: 'gmax_premium',
          planId,
          months: String(plan.months),
        },
      }),
    });

    const data = await rzpRes.json();
    if (!rzpRes.ok) {
      console.error('[razorpay order]', data);
      return res.status(502).json({
        success: false,
        error: data?.error?.description || 'Razorpay order failed',
      });
    }

    return res.status(200).json({
      success: true,
      orderId: data.id,
      amount: data.amount,
      currency: data.currency,
      keyId,
      planId,
    });
  } catch (err) {
    console.error('[razorpay create-order]', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Order creation failed',
    });
  }
}
