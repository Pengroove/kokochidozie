import { Bachs } from '@bachs/sdk';
import { randomUUID } from 'node:crypto';
import { sql, ensureTables, json, clean } from '../lib/db.js';

const PRICE = '100000.00';
const CURRENCY = 'NGN';
const SITE = 'https://kokochidozie.com';

// Saves the booking as pending, then opens a Bachs checkout for it.
export async function POST(request) {
  let b = {};
  try { b = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const name = clean(b.name, 120), email = clean(b.email, 160);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Please add your name and a valid email.' }, 400);
  if (!process.env.BACHS_SECRET_KEY) return json({ error: 'Payments are not set up yet. Please try again later.' }, 503);

  const id = 'kc_' + randomUUID().replace(/-/g, '').slice(0, 20);
  const source = clean(b.source, 60) || 'Direct';
  try {
    await ensureTables();
    await sql`INSERT INTO kc_bookings (id, name, email, brand, website, notes, source, campaign, amount, currency)
              VALUES (${id}, ${name}, ${email}, ${clean(b.brand, 120)}, ${clean(b.website, 200)}, ${clean(b.notes, 2000)},
                      ${source}, ${clean(b.campaign, 80) || null}, ${PRICE}, ${CURRENCY})`;
    const bachs = new Bachs({ apiKey: process.env.BACHS_SECRET_KEY });
    const session = await bachs.checkoutSessions.create({
      pricing: { currency: CURRENCY, amount: PRICE },
      customer: { email, name },
      success_url: `${SITE}/booked?ref=${id}`,
      cancel_url: `${SITE}/consultation`,
      reference: id,
      metadata: { booking_id: id, product: '1-hour growth consultation', source }
    }, { idempotencyKey: id });
    await sql`UPDATE kc_bookings SET checkout_id = ${session.checkout_id} WHERE id = ${id}`;
    return json({ url: session.checkout_url });
  } catch (e) {
    console.error('checkout failed', e?.statusCode, e?.errorCode, e?.message);
    return json({ error: 'We couldn\'t open the payment page. Please try again in a minute.' }, 502);
  }
}
