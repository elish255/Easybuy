export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const { phone, amount, coins, followers, bonus, service, username } = req.body || {};
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  const numericAmount = Number(amount);
  const numericCoins = Number(coins || 0);
  const numericFollowers = Number(followers || 0);
  const selectedService = service === 'followers' ? 'followers' : 'coins';
  const numericBonus = Number(bonus || 0);
  const cleanUsername = String(username || '').trim().replace(/^@/, '');

  if (!cleanUsername) return res.status(400).json({ success: false, message: 'TikTok username is required.' });
  if (!/^255(6|7|8)\d{8}$/.test(normalizedPhone)) return res.status(400).json({ success: false, message: 'Enter a valid Tanzania phone number.' });
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return res.status(400).json({ success: false, message: 'Invalid payment amount.' });
  if (selectedService === 'coins' && (!Number.isFinite(numericCoins) || numericCoins <= 0)) return res.status(400).json({ success: false, message: 'Invalid coin amount.' });
  if (selectedService === 'followers' && (!Number.isFinite(numericFollowers) || numericFollowers <= 0)) return res.status(400).json({ success: false, message: 'Invalid follower amount.' });

  const apiKey = process.env.FIMIPAY_API_KEY;
  const createUrl = process.env.FIMIPAY_CREATE_PAYMENT_URL || 'https://fimipay.com/api/v1/payment/create_order';
  if (!apiKey) return res.status(503).json({ success: false, message: 'Payment service is not configured. Please contact support.' });

  const maskPhone = value => {
    const p = String(value || '');
    return p.length > 4 ? `${p.slice(0, 3)}******${p.slice(-2)}` : '***';
  };

  const firstString = (...values) => {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number') return String(value);
    }
    return undefined;
  };

  const dataObject = payload => payload && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data : {};
  const extractOrderId = payload => {
    const data = dataObject(payload);
    return firstString(payload.order_id, payload.orderId, data.order_id, data.orderId, data.reference, data.transaction_id);
  };
  const extractStatus = payload => {
    const data = dataObject(payload);
    return firstString(data.payment_status, data.order_status, data.status, payload.payment_status, payload.order_status, payload.status)?.toLowerCase();
  };

  try {
    const requestPayload = {
      buyer_email: process.env.FIMIPAY_BUYER_EMAIL || 'customer@example.com',
      buyer_name: cleanUsername,
      buyer_phone: normalizedPhone,
      amount: Math.round(numericAmount),
      currency: process.env.FIMIPAY_CURRENCY || 'TZS',
      payment_method: 'mobile'
    };

    const upstream = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestPayload)
    });

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!upstream.ok || String(data?.status || '').toLowerCase() !== 'success') {
      return res.status(502).json({ success: false, message: data?.message || 'Unable to start payment. Please try again.' });
    }

    const providerData = dataObject(data);
    const orderId = extractOrderId(data);
    if (!orderId) return res.status(502).json({ success: false, message: 'Payment request was created without an order reference.' });

    const paymentStatus = extractStatus(data) || 'pending';
    return res.status(200).json({
      success: true,
      message: 'Payment request sent to your phone. Please approve it.',
      order_id: orderId,
      reference: firstString(data.reference, providerData.reference),
      payment_status: paymentStatus,
      amount: providerData.amount ?? numericAmount,
      currency: providerData.currency || requestPayload.currency,
      channel: providerData.channel || null,
      coins: numericCoins,
      followers: numericFollowers,
      service: selectedService,
      bonus: numericBonus,
      username: cleanUsername
    });
  } catch (error) {
    console.error('[payment create] Server error:', error?.stack || error);
    return res.status(500).json({ success: false, message: 'Unable to start payment. Please try again.' });
  }
}
