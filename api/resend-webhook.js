import { createHmac, timingSafeEqual } from 'node:crypto';
import { sql, ensureTables, json } from '../lib/db.js';

// Resend calls this when an email is delivered, opened, clicked, bounced or marked as spam.
// Signed with Svix: set RESEND_WEBHOOK_SECRET (the whsec_... value from Resend) in Vercel.
function verify(raw, h, secret) {
  const id = h.get('svix-id'), ts = h.get('svix-timestamp'), sigs = h.get('svix-signature') || '';
  if (!id || !ts || Math.abs(Date.now() / 1000 - Number(ts)) > 600) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = Buffer.from(createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest('base64'));
  return sigs.split(' ').some((s) => { const v = Buffer.from(s.split(',')[1] || ''); return v.length === expected.length && timingSafeEqual(v, expected); });
}

export async function POST(request) {
  const raw = await request.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return json({ error: 'RESEND_WEBHOOK_SECRET is not set' }, 503);
  if (!verify(raw, request.headers, secret)) return json({ error: 'invalid signature' }, 401);
  let e; try { e = JSON.parse(raw); } catch { return json({ error: 'bad json' }, 400); }
  const id = e?.data?.email_id;
  if (!id) return json({ ok: true });
  await ensureTables();
  const t = e.created_at || new Date().toISOString();
  switch (e.type) {
    case 'email.delivered': await sql`UPDATE kc_email_log SET delivered_at = COALESCE(delivered_at, ${t}::timestamptz) WHERE id = ${id}`; break;
    case 'email.opened': await sql`UPDATE kc_email_log SET opened_at = COALESCE(opened_at, ${t}::timestamptz), opens = opens + 1 WHERE id = ${id}`; break;
    case 'email.clicked': await sql`UPDATE kc_email_log SET clicked_at = COALESCE(clicked_at, ${t}::timestamptz), clicks = clicks + 1,
                                    opened_at = COALESCE(opened_at, ${t}::timestamptz) WHERE id = ${id}`; break;
    case 'email.bounced': await sql`UPDATE kc_email_log SET bounced_at = COALESCE(bounced_at, ${t}::timestamptz) WHERE id = ${id}`; break;
    case 'email.complained': await sql`UPDATE kc_email_log SET complained_at = COALESCE(complained_at, ${t}::timestamptz) WHERE id = ${id}`; break;
  }
  return json({ ok: true });
}
