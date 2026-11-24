import { createHmac, timingSafeEqual } from 'node:crypto';
import { sql, ensureTables, json } from '../lib/db.js';
import { sendOnce } from '../lib/email.js';

// Cal.com calls this when someone books, moves or cancels their call time.
export async function POST(request) {
  const raw = await request.text();
  const secret = process.env.CAL_WEBHOOK_SECRET;
  if (secret) {
    const given = Buffer.from(request.headers.get('x-cal-signature-256') || '', 'utf8');
    const expected = Buffer.from(createHmac('sha256', secret).update(raw).digest('hex'), 'utf8');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return json({ error: 'invalid signature' }, 401);
  }
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'bad json' }, 400); }
  if (body.triggerEvent === 'PING') return json({ ok: true });
  const p = body.payload || {};
  const ev = String(body.triggerEvent || '');
  await ensureTables();

  // Find the booking: the ref we put in the Cal.com notes, else the attendee's email.
  let id = (raw.match(/kc_[a-f0-9]{20}/) || [])[0] || null;
  if (id) { const r = await sql`SELECT id FROM kc_bookings WHERE id = ${id}`; if (!r.length) id = null; }
  if (!id && p.uid) { const r = await sql`SELECT id FROM kc_bookings WHERE cal_uid = ${String(p.uid)} OR cal_uid = ${String(p.rescheduleUid || '')}`; id = r[0]?.id || null; }
  const emails = (p.attendees || []).map((a) => String(a.email || '').toLowerCase()).filter(Boolean);
  if (!id && emails.length) {
    const r = await sql`SELECT id FROM kc_bookings WHERE lower(email) = ANY(${emails}) AND status = 'paid'
                        ORDER BY (call_at IS NULL) DESC, paid_at DESC LIMIT 1`;
    id = r[0]?.id || null;
  }
  if (!id) return json({ ok: true, matched: false });

  if (ev === 'BOOKING_CANCELLED') {
    await sql`UPDATE kc_bookings SET call_at = NULL, stage = 'paid', emails = emails - 'scheduled' - 'remind_day' - 'remind_morning' WHERE id = ${id}`;
    return json({ ok: true });
  }
  if ((ev === 'BOOKING_CREATED' || ev === 'BOOKING_RESCHEDULED') && p.startTime) {
    const moved = ev === 'BOOKING_RESCHEDULED';
    await sql`UPDATE kc_bookings SET call_at = ${p.startTime}::timestamptz, cal_uid = ${String(p.uid || '')},
              stage = CASE WHEN stage IS NULL OR stage = 'paid' THEN 'scheduled' ELSE stage END,
              emails = CASE WHEN ${moved} THEN emails - 'scheduled' - 'remind_day' - 'remind_morning' ELSE emails END
              WHERE id = ${id}`;
    await sendOnce(id, 'scheduled');
  }
  return json({ ok: true });
}
