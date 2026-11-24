import { webhooks } from '@bachs/sdk';
import { sql, ensureTables, json } from '../lib/db.js';
import { confirmBooking } from '../lib/pay.js';

// Bachs calls this when a payment succeeds. The signature is checked before anything happens.
export async function POST(request) {
  const raw = new Uint8Array(await request.arrayBuffer());
  let event;
  try {
    event = webhooks.constructEvent(raw, request.headers, process.env.BACHS_WEBHOOK_SECRET || '');
  } catch {
    return json({ error: 'invalid signature' }, 400);
  }
  await ensureTables();
  const fresh = await sql`INSERT INTO kc_webhook_events (id) VALUES (${event.id}) ON CONFLICT DO NOTHING RETURNING id`;
  if (!fresh.length) return json({ ok: true, duplicate: true });

  if (event.type === 'collection.succeeded') {
    const d = event.data || {};
    const ref = d.reference || d.metadata?.booking_id || d.checkout?.reference;
    const checkoutId = d.checkout_id || d.checkout?.id || d.checkout?.checkout_id;
    try {
      let id = ref && String(ref).startsWith('kc_') ? String(ref) : null;
      if (!id && checkoutId) {
        const r = await sql`SELECT id FROM kc_bookings WHERE checkout_id = ${String(checkoutId)}`;
        id = r[0]?.id || null;
      }
      if (id) await confirmBooking(id);
      else {
        // Paid through the backup payment link: match the newest pending booking with the same email.
        const email = String(d.customer?.email || d.customer_details?.email || d.customer_email || d.email || '').toLowerCase();
        if (email) await sql`UPDATE kc_bookings SET status = 'paid', paid_at = now()
          WHERE id = (SELECT id FROM kc_bookings WHERE lower(email) = ${email} AND status = 'pending'
                      AND created_at > now() - interval '2 days' ORDER BY created_at DESC LIMIT 1)`;
      }
    } catch (e) {
      console.error('webhook confirm failed', e?.message);
      await sql`DELETE FROM kc_webhook_events WHERE id = ${event.id}`;
      return json({ error: 'retry' }, 500);
    }
  }
  return json({ ok: true });
}
