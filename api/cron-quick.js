import { sql, ensureTables, json } from '../lib/db.js';
import { sendOnce, sendLeadOnce, emailsOn } from '../lib/email.js';
import { syncPayments, confirmBooking } from '../lib/pay.js';

// Runs every 5 minutes: follows up people who left the booking form or the payment page.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'unauthorized' }, 401);
  if (!emailsOn()) return json({ ok: true, emails: 'off' });
  await ensureTables();
  const sent = {};
  const add = (k) => { sent[k] = (sent[k] || 0) + 1; };

  // Abandoned checkout: opened payment 20+ minutes ago and still unpaid. Bank transfers can take a few minutes,
  // so it waits 20 minutes and checks Bachs first, to never chase someone who has actually paid.
  const pend = await sql`SELECT id, email, created_at, emails FROM kc_bookings b WHERE status <> 'paid' AND email IS NOT NULL
    AND created_at < now() - interval '20 minutes' AND created_at > now() - interval '4 days'
    AND (NOT (emails ? 'abandon_1') OR (NOT (emails ? 'abandon_2') AND created_at < now() - interval '24 hours'))
    AND NOT EXISTS (SELECT 1 FROM kc_bookings p WHERE p.status = 'paid' AND lower(p.email) = lower(b.email) AND p.created_at > b.created_at - interval '1 day')`;
  if (pend.length) { try { await syncPayments(); } catch (e) { console.error('sync failed', e?.message); } }
  for (const b of pend) {
    const st = await confirmBooking(b.id).catch(() => null);
    if (st === 'paid') continue;
    const kind = (b.emails || {}).abandon_1 ? 'abandon_2' : 'abandon_1';
    if (await sendOnce(b.id, kind)) add(kind);
  }

  // Abandoned form: typed an email 15+ minutes ago but never got to payment.
  const leads = await sql`SELECT vid, emails FROM kc_leads l WHERE booking_id IS NULL AND email IS NOT NULL
    AND updated_at < now() - interval '15 minutes' AND created_at > now() - interval '4 days'
    AND (NOT (emails ? 'form_1') OR (NOT (emails ? 'form_2') AND updated_at < now() - interval '24 hours'))
    AND NOT EXISTS (SELECT 1 FROM kc_bookings b WHERE lower(b.email) = lower(l.email) AND b.created_at > l.created_at - interval '1 day')`;
  for (const l of leads) {
    const kind = (l.emails || {}).form_1 ? 'form_2' : 'form_1';
    if (await sendLeadOnce(l.vid, kind)) add(kind);
  }
  return json({ ok: true, sent });
}
