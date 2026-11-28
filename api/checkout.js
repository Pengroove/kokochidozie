import { Bachs } from '@bachs/sdk';
import { randomUUID } from 'node:crypto';
import { sql, ensureTables, json, clean } from '../lib/db.js';
import { PRODUCTS } from '../lib/products.js';

const CURRENCY = 'NGN';
const SITE = 'https://www.kokochidozie.com';
// Backup: Koko's fixed Bachs payment link, used if the API key is missing or Bachs's API fails.
const PAYMENT_LINK = 'https://checkout.bachs.io/pay/pl_de48d327e899';

// Saves the booking as pending, then opens a Bachs checkout for it.
export async function POST(request) {
  let b = {};
  try { b = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const name = clean(b.name, 120), email = clean(b.email, 160), phone = clean(b.phone, 30);
  const brand = clean(b.brand, 120), website = clean(b.website, 200), notes = clean(b.notes, 2000);
  const kind = PRODUCTS[b.product] ? b.product : 'consult';
  const P = PRODUCTS[kind], PRICE = P.price;
  if (!name || !brand || !notes || (kind === 'consult' && !website)) return json({ error: 'Please fill in every field.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Please check your email address.' }, 400);
  if (phone.replace(/\D/g, '').length < 10) return json({ error: 'Please check your phone number.' }, 400);

  const id = 'kc_' + randomUUID().replace(/-/g, '').slice(0, 20);
  const source = clean(b.source, 60) || 'Direct';
  const vid = clean(b.vid, 40);
  try {
    await ensureTables();
    await sql`INSERT INTO kc_bookings (id, name, email, phone, brand, website, notes, source, campaign, amount, currency, product)
              VALUES (${id}, ${name}, ${email}, ${phone}, ${brand}, ${website || ''}, ${notes},
                      ${source}, ${clean(b.campaign, 80) || null}, ${PRICE}, ${CURRENCY}, ${kind})`;
    if (vid) {
      await sql`INSERT INTO kc_events (vid, kind) VALUES (${vid}, 'checkout') ON CONFLICT DO NOTHING`;
      await sql`UPDATE kc_live SET stage = 'payment', last_seen = now() WHERE vid = ${vid}`;
    }
    // The fixed payment link is for the consultation price only, so the chat can't fall back to it.
    const fallback = () => kind === 'consult' ? json({ url: PAYMENT_LINK }) : json({ error: 'Payment is not available right now. Please try again in a few minutes.' }, 503);
    if (!process.env.BACHS_SECRET_KEY) return fallback();
    const bachs = new Bachs({ apiKey: process.env.BACHS_SECRET_KEY });
    const session = await bachs.checkoutSessions.create({
      pricing: { currency: CURRENCY, amount: PRICE },
      customer: { email, name },
      success_url: `${SITE}/booked?ref=${id}`,
      cancel_url: `${SITE}${P.page}`,
      reference: id,
      metadata: { booking_id: id, product: P.name, source }
    }, { idempotencyKey: id });
    await sql`UPDATE kc_bookings SET checkout_id = ${session.checkout_id} WHERE id = ${id}`;
    return json({ url: session.checkout_url });
  } catch (e) {
    console.error('checkout failed', e?.statusCode, e?.errorCode, e?.message);
    if (kind !== 'consult') return json({ error: 'Payment is not available right now. Please try again in a few minutes.' }, 503);
    return json({ url: PAYMENT_LINK });
  }
}
