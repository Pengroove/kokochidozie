import { sql, ensureTables, json } from '../lib/db.js';
import { sendOnce, emailsOn } from '../lib/email.js';
import { syncPayments } from '../lib/pay.js';

// Runs every hour (set in vercel.json): sends reminders and follow-ups that are due.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'unauthorized' }, 401);
  await ensureTables();
  // Close a booking once its 30-day check-in email has gone out (or a few days after it was due).
  await sql`UPDATE kc_bookings SET stage = 'closed' WHERE stage = 'support' AND (emails ? 'support_ending' OR call_done_at < now() - interval '35 days')`;
  try { await syncPayments(); } catch (e) { console.error('payment sync failed', e?.message); }
  if (!emailsOn()) return json({ ok: true, emails: 'off' });
  const due = [
    ['remind_day', sql`SELECT id FROM kc_bookings WHERE stage IN ('scheduled','audit_done') AND call_at BETWEEN now() + interval '3 hours' AND now() + interval '26 hours' AND NOT (emails ? 'remind_day')`],
    ['remind_morning', sql`SELECT id FROM kc_bookings WHERE stage IN ('scheduled','audit_done') AND call_at > now() + interval '1 hour'
        AND (call_at AT TIME ZONE 'Africa/Lagos')::date = (now() AT TIME ZONE 'Africa/Lagos')::date
        AND extract(hour FROM now() AT TIME ZONE 'Africa/Lagos') >= 7 AND NOT (emails ? 'remind_morning')`],
    ['review', sql`SELECT id FROM kc_bookings WHERE stage IN ('support','closed') AND call_done_at < now() - interval '3 days' AND call_done_at > now() - interval '20 days' AND NOT (emails ? 'review')`],
    ['support_ending', sql`SELECT id FROM kc_bookings WHERE stage IN ('support') AND call_done_at < now() - interval '30 days' AND NOT (emails ? 'support_ending')`]
  ];
  const sent = {};
  for (const [kind, q] of due) {
    for (const r of await q) if (await sendOnce(r.id, kind)) sent[kind] = (sent[kind] || 0) + 1;
  }
  return json({ ok: true, sent });
}
