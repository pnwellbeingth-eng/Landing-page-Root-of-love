// api/webhooks/stripe.js — รับ Stripe Webhook หลังลูกค้าจ่ายเงิน
// แล้วส่งต่อให้ n8n เพื่อส่ง Email + PDF อัตโนมัติ

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ⚠️ IMPORTANT: ต้องปิด bodyParser เพื่อให้ Stripe verify signature ได้
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];

  let event;
  try {
    // Verify ว่า request มาจาก Stripe จริง (ไม่ใช่ fake)
    event = stripe.webhooks.constructEvent(
      req.body,                              // raw body (Buffer)
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ─── Handle events ──────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    const customerEmail = session.customer_details?.email;
    const customerName  = session.customer_details?.name || 'คุณลูกค้า';
    const hasAddon      = session.metadata?.addon === 'true';
    const amountTotal   = session.amount_total;   // สตางค์ (หาร 100 = บาท)
    const sessionId     = session.id;

    console.log(`✅ Payment success: ${customerEmail} | addon: ${hasAddon} | ฿${amountTotal / 100}`);

    // ─── ส่ง trigger ไปให้ n8n ──────────────────────────────
    if (process.env.N8N_WEBHOOK_URL) {
      try {
        const n8nRes = await fetch(process.env.N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email:      customerEmail,
            name:       customerName,
            amount:     amountTotal / 100,
            addon:      hasAddon,
            session_id: sessionId,
            product:    'root-of-love',
            timestamp:  new Date().toISOString(),
          }),
        });
        console.log('n8n triggered:', n8nRes.status);
      } catch (n8nErr) {
        // Log แต่ไม่ return error — ไม่ให้ Stripe retry เพราะ n8n fail
        console.error('n8n trigger failed:', n8nErr.message);
      }
    }
  }

  // ─── Handle payment failed (optional logging) ──────────────
  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object;
    console.log(`❌ Payment failed: ${intent.last_payment_error?.message}`);
  }

  return res.status(200).json({ received: true });
};

// ปิด bodyParser เพื่อรับ raw body สำหรับ Stripe signature verification
module.exports.config = {
  api: { bodyParser: false },
};
