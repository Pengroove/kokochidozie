import { sql, ensureTables, json } from '../lib/db.js';
import { allowed } from '../lib/auth.js';
import { sendWelcome, emailsOn } from '../lib/email.js';

// Admin: send the welcome email to one subscriber, or to everyone who hasn't had it yet.
export async function POST(request) {
  if (!allowed(request)) return json({ error: 'Wrong password' }, 401);
  if (!emailsOn()) return json({ error: 'Emails are off (RESEND_API_KEY is missing).' }, 400);
  let b = {};
  try { b = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  await ensureTables();
  const vids = b.all
    ? (await sql`SELECT vid FROM kc_popup WHERE email IS NOT NULL AND welcome_at IS NULL AND unsubscribed_at IS NULL`).map((r) => r.vid)
    : b.vid ? [String(b.vid)] : [];
  if (!vids.length) return json({ ok: true, sent: 0 });
  let sent = 0;
  for (const v of vids) { if (await sendWelcome(v)) sent++; await new Promise((r) => setTimeout(r, 400)); }
  return json({ ok: true, sent, skipped: vids.length - sent });
}
