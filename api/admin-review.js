import { sql, ensureTables, json } from '../lib/db.js';
import { allowed } from '../lib/auth.js';

// Admin: approve or hide a review.
export async function POST(request) {
  if (!allowed(request)) return json({ error: 'Wrong password' }, 401);
  let b = {};
  try { b = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const id = parseInt(b.id, 10);
  if (!id || !['approved', 'hidden'].includes(b.status)) return json({ error: 'Bad request' }, 400);
  await ensureTables();
  await sql`UPDATE kc_reviews SET status = ${b.status}, approved_at = CASE WHEN ${b.status} = 'approved' THEN now() ELSE approved_at END WHERE id = ${id}`;
  return json({ ok: true });
}
