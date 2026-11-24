import { sql, ensureTables, json, clean } from '../lib/db.js';
import { allowed } from '../lib/auth.js';
import { sendOnce } from '../lib/email.js';

const STAGES = ['paid', 'scheduled', 'audit_done', 'support', 'closed'];

// Lets the admin move a booking to a new stage or save notes.
export async function POST(request) {
  if (!allowed(request)) return json({ error: 'Wrong password' }, 401);
  let b = {};
  try { b = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const id = String(b.id || '');
  if (!/^kc_[a-f0-9]{20}$/.test(id)) return json({ error: 'Bad id' }, 400);
  await ensureTables();
  if (typeof b.admin_notes === 'string') await sql`UPDATE kc_bookings SET admin_notes = ${clean(b.admin_notes, 5000)} WHERE id = ${id}`;
  if (b.stage) {
    if (!STAGES.includes(b.stage)) return json({ error: 'Bad stage' }, 400);
    await sql`UPDATE kc_bookings SET stage = ${b.stage},
              call_done_at = CASE WHEN ${b.stage} IN ('support','closed') THEN COALESCE(call_done_at, now()) ELSE call_done_at END
              WHERE id = ${id}`;
    if (b.stage === 'support') await sendOnce(id, 'after_call');
  }
  const r = await sql`SELECT id, stage, admin_notes, call_done_at, emails FROM kc_bookings WHERE id = ${id}`;
  return json({ ok: true, booking: r[0] || null });
}
