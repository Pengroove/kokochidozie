import { Bachs } from '@bachs/sdk';
import { sql } from './db.js';
import { sendOnce } from './email.js';

const PAID = new Set(['completed', 'complete', 'paid', 'succeeded', 'success', 'accepted', 'overpaid']);
const PRICE = 100000;

// Marks a booking paid (only once) and sends the "pick your time" email.
export async function markPaid(id, amount = null, currency = null) {
  const r = await sql`UPDATE kc_bookings SET status = 'paid', paid_at = COALESCE(paid_at, now()), stage = COALESCE(stage, 'paid'),
            amount = COALESCE(${amount}::numeric, amount), currency = COALESCE(${currency}, currency)
            WHERE id = ${id} AND status <> 'paid' RETURNING id, call_at`;
  if (r.length && !r[0].call_at) await sendOnce(id, 'paid');
  return 'paid';
}

// Asks Bachs directly whether a booking's checkout was paid, and marks it paid if so.
export async function confirmBooking(id) {
  const rows = await sql`SELECT id, status, checkout_id FROM kc_bookings WHERE id = ${id}`;
  const row = rows[0];
  if (!row) return null;
  if (row.status === 'paid' || !row.checkout_id || !process.env.BACHS_SECRET_KEY) return row.status;
  const bachs = new Bachs({ apiKey: process.env.BACHS_SECRET_KEY });
  const s = await bachs.checkoutSessions.get(row.checkout_id);
  const paid = PAID.has(String(s.payment_status || '').toLowerCase()) ||
               PAID.has(String(s.charge?.status || '').toLowerCase()) ||
               (String(s.status).toLowerCase() === 'completed' && s.completed_at);
  if (!paid) return row.status;
  return markPaid(id, s.amount ?? null, s.currency ?? null);
}

// Safety net: reads the latest successful payments straight from Bachs and makes sure each consultation
// payment shows in the admin, even if the webhook or the "You're booked" page never got through.
export async function syncPayments() {
  if (!process.env.BACHS_SECRET_KEY) return { checked: 0 };
  const bachs = new Bachs({ apiKey: process.env.BACHS_SECRET_KEY });
  const res = await bachs.payments.list({ limit: 50 });
  let fixed = 0, added = 0;
  for (const p of res.items || []) {
    if (!PAID.has(String(p.status || '').toLowerCase())) continue;
    const pid = String(p.id || p.reference || '');
    if (pid) {
      const seen = await sql`SELECT 1 FROM kc_bookings WHERE bachs_payment_id = ${pid}`;
      if (seen.length) continue;
    }
    const ref = String(p.reference || '');
    const email = String(p.customer_email || '').trim().toLowerCase();
    const amt = parseFloat(p.amount_paid || p.amount || '0');
    const ngn = String(p.currency || '').toUpperCase() === 'NGN';
    const isConsult = ngn && (Math.round(amt) === PRICE || Math.round(amt / 100) === PRICE);
    const paidAt = p.completed_at || p.transaction_date || null;
    let id = null;
    if (ref.startsWith('kc_')) {
      const r = await sql`SELECT id FROM kc_bookings WHERE id = ${ref}`; id = r[0]?.id || null;
    }
    if (!id && email && isConsult) {
      const r = await sql`SELECT id FROM kc_bookings WHERE lower(email) = ${email}
                          AND (status <> 'paid' OR bachs_payment_id IS NULL) ORDER BY (status = 'paid'), created_at DESC LIMIT 1`;
      id = r[0]?.id || null;
    }
    if (id) {
      const r = await sql`SELECT status FROM kc_bookings WHERE id = ${id}`;
      if (r[0]?.status !== 'paid') { await markPaid(id); fixed++; }
      if (pid) await sql`UPDATE kc_bookings SET bachs_payment_id = ${pid} WHERE id = ${id}`;
      continue;
    }
    // Paid ₦100K with no form on the site (e.g. the payment link was shared directly): add it so it still shows.
    const ageDays = paidAt ? (Date.now() - new Date(paidAt).getTime()) / 864e5 : Infinity;
    if (isConsult && email && ageDays <= 7) {
      const nid = 'kc_' + Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, '0')).join('');
      await sql`INSERT INTO kc_bookings (id, name, email, brand, website, notes, source, amount, currency, status, paid_at, stage, bachs_payment_id)
                VALUES (${nid}, ${p.customer_name || ''}, ${email}, '', '', 'Paid through the payment link (no form filled on the site)',
                        'Payment link', ${PRICE}, 'NGN', 'paid', ${paidAt ? new Date(paidAt) : new Date()}, 'paid', ${pid || null})`;
      if (ageDays <= 2) await sendOnce(nid, 'paid');
      added++;
    }
  }
  return { checked: (res.items || []).length, fixed, added };
}
