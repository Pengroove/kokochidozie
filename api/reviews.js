import { sql, ensureTables, json, clean } from '../lib/db.js';

// GET: the approved reviews shown on the homepage. POST: a client leaves a review (it waits for Koko's approval).
export async function GET() {
  await ensureTables();
  const rows = await sql`SELECT name, brand, rating, body, product, approved_at FROM kc_reviews WHERE status = 'approved' ORDER BY approved_at DESC LIMIT 50`;
  const avg = rows.length ? rows.reduce((t, r) => t + r.rating, 0) / rows.length : 0;
  return new Response(JSON.stringify({ count: rows.length, average: Math.round(avg * 10) / 10, reviews: rows }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60, s-maxage=300' }
  });
}

export async function POST(request) {
  let b = {};
  try { b = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const name = clean(b.name, 80), body = clean(b.body, 1200), brand = clean(b.brand, 80);
  const rating = parseInt(b.rating, 10);
  if (!name || !body || !(rating >= 1 && rating <= 5)) return json({ error: 'Please add a rating, your name and a few words.' }, 400);
  if (!b.consent) return json({ error: 'Please tick the box so I can show your review.' }, 400);
  await ensureTables();
  let bookingId = null, product = null;
  const ref = String(b.ref || '');
  if (/^kc_[a-f0-9]{20}$/.test(ref)) {
    const r = await sql`SELECT id, product FROM kc_bookings WHERE id = ${ref} AND status = 'paid'`;
    if (r[0]) { bookingId = r[0].id; product = r[0].product; }
  }
  await sql`INSERT INTO kc_reviews (booking_id, name, brand, rating, body, product) VALUES (${bookingId}, ${name}, ${brand || null}, ${rating}, ${body}, ${product})`;
  return json({ ok: true });
}
