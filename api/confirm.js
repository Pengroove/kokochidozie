import { ensureTables, json, sql } from '../lib/db.js';
import { confirmBooking } from '../lib/pay.js';

// The "You're booked" page asks this whether payment has gone through.
export async function GET(request) {
  const id = new URL(request.url).searchParams.get('ref') || '';
  if (!/^kc_[a-f0-9]{20}$/.test(id)) return json({ status: 'unknown' }, 400);
  try {
    await ensureTables();
    const status = await confirmBooking(id);
    if (!status) return json({ status: 'unknown' }, 404);
    const r = await sql`SELECT name, email, product FROM kc_bookings WHERE id = ${id}`;
    return json({ status, name: r[0]?.name || '', email: r[0]?.email || '', product: r[0]?.product || 'consult' });
  } catch (e) {
    console.error('confirm failed', e?.message);
    return json({ status: 'pending' });
  }
}
