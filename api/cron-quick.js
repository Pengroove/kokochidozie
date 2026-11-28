import { sql, ensureTables, json } from '../lib/db.js';
import { sendOnce, sendLeadOnce, sendWelcome, emailsOn, abGroup, AB_MINUTES } from '../lib/email.js';
import { syncPayments, confirmBooking } from '../lib/pay.js';

// Runs every 5 minutes: follows up people who left the booking form or the payment page.
// Email 1 after 5 or 15 minutes (a timing test, see abGroup), email 2 after 12 hours, a personal note after 2 days.
const ageMin = (t) => (Date.now() - new Date(t).getTime()) / 60000;
function nextKind(prefix, emails, minutes, group) {
  const e = emails || {};
  if (!e[prefix + '_1']) return minutes >= AB_MINUTES[group] ? prefix + '_1' : null;
  if (!e[prefix + '_2']) return minutes >= 12 * 60 ? prefix + '_2' : null;
  if (!e[prefix + '_3']) return minutes >= 48 * 60 ? prefix + '_3' : null;
  return null;
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'unauthorized' }, 401);
  if (!emailsOn()) return json({ ok: true, emails: 'off' });
  await ensureTables();
  const sent = {};
  const add = (k) => { sent[k] = (sent[k] || 0) + 1; };

  // Abandoned checkout. Checks Bachs before every send, so nobody who has actually paid gets chased.
  const pend = await sql`SELECT id, email, COALESCE(followup_from, created_at) AS t0, emails FROM kc_bookings b WHERE status <> 'paid' AND email IS NOT NULL
    AND COALESCE(followup_from, created_at) < now() - interval '5 minutes' AND COALESCE(followup_from, created_at) > now() - interval '5 days'
    AND NOT (emails ? 'abandon_3')
    AND NOT EXISTS (SELECT 1 FROM kc_bookings p WHERE p.status = 'paid' AND lower(p.email) = lower(b.email) AND p.created_at > b.created_at - interval '1 day')`;
  const due = pend.map((b) => ({ b, kind: nextKind('abandon', b.emails, ageMin(b.t0), abGroup(b.id)) })).filter((x) => x.kind);
  if (due.length) { try { await syncPayments(); } catch (e) { console.error('sync failed', e?.message); } }
  for (const { b, kind } of due) {
    const st = await confirmBooking(b.id).catch(() => null);
    if (st === 'paid') continue;
    if (await sendOnce(b.id, kind)) add(kind);
  }

  // Abandoned form: typed an email but never got to payment. Timed from their last activity on the form.
  const leads = await sql`SELECT vid, emails, COALESCE(followup_from, updated_at) AS t0 FROM kc_leads l WHERE booking_id IS NULL AND email IS NOT NULL
    AND COALESCE(followup_from, updated_at) < now() - interval '5 minutes' AND COALESCE(followup_from, created_at) > now() - interval '5 days' AND NOT (emails ? 'form_3')
    AND NOT EXISTS (SELECT 1 FROM kc_bookings b WHERE lower(b.email) = lower(l.email) AND b.created_at > l.created_at - interval '1 day')`;
  for (const l of leads) {
    const kind = nextKind('form', l.emails, ageMin(l.t0), abGroup(l.vid));
    if (kind && await sendLeadOnce(l.vid, kind)) add(kind);
  }
  // Retry the welcome email for brand-new sign-ups whose first send failed. Older sign-ups are only emailed
  // when Koko taps Send welcome in the admin.
  const fresh = await sql`SELECT vid FROM kc_popup WHERE email IS NOT NULL AND welcome_at IS NULL AND unsubscribed_at IS NULL
    AND email_at > now() - interval '1 hour' LIMIT 20`;
  for (const p of fresh) if (await sendWelcome(p.vid)) add('welcome');
  return json({ ok: true, sent });
}
