import { Bachs } from '@bachs/sdk';
import { sql } from './db.js';

const PAID = new Set(['completed', 'complete', 'paid', 'succeeded', 'success']);

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
  await sql`UPDATE kc_bookings SET status = 'paid', paid_at = COALESCE(paid_at, now()),
            amount = COALESCE(${s.amount ?? null}::numeric, amount), currency = COALESCE(${s.currency ?? null}, currency)
            WHERE id = ${id}`;
  return 'paid';
}
