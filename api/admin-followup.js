import { sql, ensureTables, json } from '../lib/db.js';
import { allowed } from '../lib/auth.js';
import { sendOnce, sendLeadOnce, emailsOn } from '../lib/email.js';
import { confirmBooking } from '../lib/pay.js';

// Admin: start the follow-up emails for someone now (sends the first one straight away; the rest follow
// on the usual timing: 12 hours, then 2 days). With all: true, does it for everyone who hasn't had one.
export async function POST(request) {
  if (!allowed(request)) return json({ error: 'Wrong password' }, 401);
  if (!emailsOn()) return json({ error: 'Emails are off (RESEND_API_KEY is missing).' }, 400);
  let b = {};
  try { b = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  await ensureTables();
  let bookings = [], leads = [];
  if (b.all) {
    bookings = (await sql`SELECT id FROM kc_bookings x WHERE status <> 'paid' AND email IS NOT NULL AND NOT (emails ? 'abandon_1')
      AND NOT EXISTS (SELECT 1 FROM kc_bookings p WHERE p.status = 'paid' AND lower(p.email) = lower(x.email))`).map((r) => r.id);
    leads = (await sql`SELECT vid FROM kc_leads l WHERE booking_id IS NULL AND email IS NOT NULL AND NOT (emails ? 'form_1')
      AND NOT EXISTS (SELECT 1 FROM kc_bookings p WHERE lower(p.email) = lower(l.email))`).map((r) => r.vid);
  } else if (b.type === 'booking' && b.id) bookings = [String(b.id)];
  else if (b.type === 'lead' && b.id) leads = [String(b.id)];
  else return json({ error: 'Bad request' }, 400);
  let sent = 0, skipped = 0;
  for (const id of bookings) {
    const st = await confirmBooking(id).catch(() => null);
    if (st === 'paid') { skipped++; continue; }
    await sql`UPDATE kc_bookings SET followup_from = now() WHERE id = ${id}`;
    const r = (await sql`SELECT emails FROM kc_bookings WHERE id = ${id}`)[0];
    const e = (r && r.emails) || {};
    const kind = !e.abandon_1 ? 'abandon_1' : !e.abandon_2 ? 'abandon_2' : !e.abandon_3 ? 'abandon_3' : null;
    if (kind && await sendOnce(id, kind)) sent++; else skipped++;
  }
  for (const vid of leads) {
    await sql`UPDATE kc_leads SET followup_from = now() WHERE vid = ${vid}`;
    const r = (await sql`SELECT emails FROM kc_leads WHERE vid = ${vid}`)[0];
    const e = (r && r.emails) || {};
    const kind = !e.form_1 ? 'form_1' : !e.form_2 ? 'form_2' : !e.form_3 ? 'form_3' : null;
    if (kind && await sendLeadOnce(vid, kind)) sent++; else skipped++;
    await new Promise((res) => setTimeout(res, 400));
  }
  return json({ ok: true, sent, skipped });
}
