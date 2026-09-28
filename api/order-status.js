export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const { order_id } = req.body || {};
  if (!order_id) return res.status(400).json({ success: false, message: 'order_id is required.' });

  const apiKey = process.env.FIMIPAY_API_KEY;
  const statusUrl = process.env.FIMIPAY_ORDER_STATUS_URL || 'https://fimipay.com/api/v1/payment/order_status';
  if (!apiKey) return res.status(503).json({ success: false, message: 'Payment service is not configured.' });

  try {
    const upstream = await fetch(statusUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ order_id: String(order_id) })
    });

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!upstream.ok || String(data?.status || '').toLowerCase() !== 'success') {
      return res.status(502).json({ success: false, message: data?.message || 'Could not retrieve payment status.' });
    }

    const providerData = data?.data && typeof data.data === 'object' ? data.data : {};
    const paymentStatus = String(
      providerData.payment_status || providerData.order_status || providerData.status || data.payment_status || data.order_status || data.status || 'PENDING'
    ).toUpperCase();

    return res.status(200).json({
      success: true,
      order_id: providerData.order_id || data.order_id || order_id,
      payment_status: paymentStatus,
      transid: providerData.transid || providerData.transaction_id || null,
      reference: providerData.reference || data.reference || null,
      amount: providerData.amount || null,
      channel: providerData.channel || null
    });
  } catch (error) {
    console.error('[payment status] Server error:', error?.stack || error);
    return res.status(500).json({ success: false, message: 'Could not retrieve payment status.' });
  }
}
