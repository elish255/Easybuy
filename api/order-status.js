export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const { order_id } = req.body || {};
  if (!order_id) return res.status(400).json({ success: false, message: 'order_id is required.' });

  const apiKey = process.env.MOBILIPA_API_KEY;
  if (!apiKey) return res.status(503).json({ success: false, message: 'Mobilipa API key is not configured.' });

  try {
    console.log('[Mobilipa order_status] Checking order:', String(order_id));
    const upstream = await fetch('https://api.mobilipa.store/v1/payment/order_status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
      body: JSON.stringify({ order_id: String(order_id) })
    });

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    console.log('[Mobilipa order_status] HTTP status:', upstream.status);
    // Log the provider response for debugging, but never log the API key.
    console.log('[Mobilipa order_status] Response:', JSON.stringify(data));

    if (!upstream.ok || data?.status !== 'success') {
      return res.status(502).json({ success: false, message: data?.message || 'Could not retrieve payment status.', provider: data });
    }

    const paymentStatus = String(data?.data?.payment_status || data?.data?.status || 'PENDING').toUpperCase();
    const providerData = data?.data || {};
    console.log('[Mobilipa order_status] Parsed status:', {
      order_id: providerData?.order_id || order_id,
      payment_status: paymentStatus,
      transid: providerData?.transid || null,
      reference: providerData?.reference || null,
      amount: providerData?.amount || null,
      channel: providerData?.channel || null,
      message: data?.message || null
    });

    return res.status(200).json({
      success: true,
      order_id: data?.data?.order_id || order_id,
      payment_status: paymentStatus,
      transid: data?.data?.transid || null,
      reference: data?.data?.reference || null,
      amount: data?.data?.amount || null,
      channel: data?.data?.channel || null,
      provider_message: data?.message || null
    });
  } catch (error) {
    console.error('[Mobilipa order_status] Network/server error:', error?.stack || error);
    return res.status(500).json({ success: false, message: 'Could not reach Mobilipa.' });
  }
}
