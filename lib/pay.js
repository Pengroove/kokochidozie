import { Bachs } from '@bachs/sdk';
import { sql } from './db.js';
import { sendOnce } from './email.js';

const PAID = new Set(['completed', 'complete', 'paid', 'succeeded', 'success']);

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
