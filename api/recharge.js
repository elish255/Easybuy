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

  const apiKey = process.env.MOBILIPA_API_KEY;
  if (!apiKey) return res.status(503).json({ success: false, message: 'Mobilipa API key is not configured. Add MOBILIPA_API_KEY in Vercel Environment Variables.' });

  const maskPhone = value => {
    const p = String(value || '');
    return p.length > 4 ? `${p.slice(0, 3)}******${p.slice(-2)}` : '***';
  };
  const sanitize = value => {
    try {
      const clone = JSON.parse(JSON.stringify(value));
      const hide = obj => {
        if (!obj || typeof obj !== 'object') return;
        for (const key of Object.keys(obj)) {
          const lower = key.toLowerCase();
          if (['msisdn', 'buyer_phone', 'phone', 'mobile', 'email', 'buyer_email'].includes(lower)) {
            obj[key] = lower === 'email' || lower === 'buyer_email' ? '[redacted]' : maskPhone(obj[key]);
          } else if (typeof obj[key] === 'object') hide(obj[key]);
        }
      };
      hide(clone);
      return clone;
    } catch { return { raw: String(value) }; }
  };

  try {
    const requestPayload = {
      buyer_email: process.env.MOBILIPA_BUYER_EMAIL || 'customer@example.com',
      buyer_name: cleanUsername,
      buyer_phone: normalizedPhone,
      amount: Math.round(numericAmount),
      currency: 'TZS'
    };

    console.log('[Mobilipa create_order] Sending request', {
      amount: requestPayload.amount,
      currency: requestPayload.currency,
      buyer_name: cleanUsername,
      buyer_phone: maskPhone(normalizedPhone)
    });

    const upstream = await fetch('https://api.mobilipa.store/v1/payment/create_order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
      body: JSON.stringify(requestPayload)
    });

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    console.log('[Mobilipa create_order] HTTP status:', upstream.status);
    console.log('[Mobilipa create_order] Response:', JSON.stringify(sanitize(data)));
    console.log('[Mobilipa create_order] Provider message:', data?.message || null);

    if (!upstream.ok || data?.status !== 'success') {
      return res.status(502).json({ success: false, message: data?.message || 'Mobilipa rejected the payment request.', provider: data });
    }

    const providerStatus = String(data?.data?.payment_status || data?.data?.status || 'PENDING').toUpperCase();
    const orderId = data?.data?.order_id || null;

    console.log('[Mobilipa create_order] Order created:', {
      order_id: orderId,
      reference: data?.data?.reference || null,
      payment_status: providerStatus,
      amount: data?.data?.amount ?? numericAmount,
      currency: data?.data?.currency || 'TZS',
      channel: data?.data?.channel || null,
      msisdn: maskPhone(data?.data?.msisdn || normalizedPhone)
    });

    return res.status(200).json({
      success: true,
      message: data.message || 'Payment request sent to your phone.',
      order_id: orderId,
      reference: data?.data?.reference || null,
      payment_status: providerStatus,
      amount: data?.data?.amount ?? numericAmount,
      currency: data?.data?.currency || 'TZS',
      channel: data?.data?.channel || null,
      coins: numericCoins,
      followers: numericFollowers,
      service: selectedService,
      bonus: numericBonus,
      username: cleanUsername
    });
  } catch (error) {
    console.error('[Mobilipa create_order] Network/server error:', error?.stack || error);
    return res.status(500).json({ success: false, message: 'Could not reach Mobilipa. Please try again.' });
  }
}
