// api/checkout.js — สร้าง Stripe Checkout Session
// Vercel serverless function (Node.js)

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { addAddon = false } = req.body || {};

    // ─── Line items ───────────────────────────────────────────
    // ไม่ติ๊ก → Root of Love อย่างเดียว (596 บาท)
    // ติ๊ก     → Bundle 2 เล่ม (695 บาท) — เป็น 1 product ใน Stripe
    const lineItems = [
      {
        price: addAddon
          ? process.env.STRIPE_PRICE_ID_BUNDLE   // Bundle 2 เล่ม
          : process.env.STRIPE_PRICE_ID_EBOOK,   // Root of Love อย่างเดียว
        quantity: 1,
      },
    ];

    // ─── สร้าง Stripe Checkout Session ─────────────────────────
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'promptpay'],
      line_items: lineItems,
      mode: 'payment',

      // หน้าที่ redirect ไปหลังจ่ายเงินสำเร็จ
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/thank-you.html?session_id={CHECKOUT_SESSION_ID}`,
      // หน้าที่ redirect ไปถ้า user กด cancel
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/?cancelled=true`,

      // ให้ Stripe เก็บ email ลูกค้า (สำคัญมาก — n8n จะดึง email นี้ส่ง PDF)
      customer_creation: 'always',

      // Metadata สำหรับ webhook → n8n
      metadata: {
        addon: addAddon ? 'true' : 'false',
        product: 'root-of-love',
      },

      // ภาษาไทย
      locale: 'th',

      // Custom text ใน checkout page
      custom_text: {
        submit: {
          message: 'คุณจะได้รับ E-Book ทาง Email ทันทีหลังชำระเงินเสร็จค่ะ 📧',
        },
      },
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
};
