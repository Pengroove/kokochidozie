import { Bachs } from '@bachs/sdk';
import { sql, ensureTables } from '../lib/db.js';
import { product } from '../lib/products.js';

const SITE = 'https://www.kokochidozie.com';
const go = (url) => new Response(null, { status: 302, headers: { location: url } });

// The "Finish booking" button in abandoned-checkout emails: opens a fresh Bachs checkout for the same booking.
export async function GET(request) {
  const id = new URL(request.url).searchParams.get('ref') || '';
  if (!/^kc_[a-f0-9]{20}$/.test(id)) return go(SITE + '/consultation');
  await ensureTables();
  const r = await sql`SELECT * FROM kc_bookings WHERE id = ${id}`;
  const b = r[0];
  if (!b) return go(SITE + '/consultation');
  const P = product(b.product);
  if (b.status === 'paid') return go(`${SITE}/booked?ref=${id}`);
  if (!process.env.BACHS_SECRET_KEY) return go(SITE + P.page);
  try {
    const bachs = new Bachs({ apiKey: process.env.BACHS_SECRET_KEY });
    const session = await bachs.checkoutSessions.create({
      pricing: { currency: 'NGN', amount: P.price },
      customer: { email: b.email, name: b.name },
      success_url: `${SITE}/booked?ref=${id}`,
      cancel_url: `${SITE}${P.page}`,
      reference: id,
      metadata: { booking_id: id, product: P.name, source: b.source || 'Email', resumed: 'yes' }
    }, { idempotencyKey: id + '-resume-' + Math.floor(Date.now() / 36e5) });
    await sql`UPDATE kc_bookings SET checkout_id = ${session.checkout_id} WHERE id = ${id}`;
    return go(session.checkout_url);
  } catch (e) {
    console.error('resume failed', e?.message);
    return go(SITE + P.page);
  }
}
