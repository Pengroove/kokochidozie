import { timingSafeEqual, createHash } from 'node:crypto';
import { sql, ensureTables, json } from '../lib/db.js';

function allowed(request) {
  const pw = process.env.ADMIN_PASSWORD || '';
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!pw || !given) return false;
  const a = createHash('sha256').update(pw).digest();
  const b = createHash('sha256').update(given).digest();
  return timingSafeEqual(a, b);
}

// Numbers for the admin dashboard: visits and bookings by source over the chosen days.
export async function GET(request) {
  if (!allowed(request)) return json({ error: 'Wrong password' }, 401);
  const days = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get('days') || '30', 10) || 30, 1), 90);
  await ensureTables();
  const [visits, bySource, booked, daily, recent] = await Promise.all([
    sql`SELECT count(*)::int AS visits, count(DISTINCT vid)::int AS visitors FROM kc_visits WHERE ts > now() - make_interval(days => ${days})`,
    sql`SELECT source, count(*)::int AS visits, count(DISTINCT vid)::int AS visitors
        FROM kc_visits WHERE ts > now() - make_interval(days => ${days}) GROUP BY source ORDER BY visits DESC LIMIT 20`,
    sql`SELECT source, count(*)::int AS bookings, COALESCE(sum(amount),0)::float AS revenue
        FROM kc_bookings WHERE status = 'paid' AND paid_at > now() - make_interval(days => ${days}) GROUP BY source`,
    sql`SELECT to_char(date_trunc('day', ts), 'YYYY-MM-DD') AS day, count(*)::int AS visits
        FROM kc_visits WHERE ts > now() - make_interval(days => ${days}) GROUP BY 1 ORDER BY 1`,
    sql`SELECT id, created_at, paid_at, name, email, brand, website, notes, source, amount, currency, status
        FROM kc_bookings ORDER BY created_at DESC LIMIT 50`
  ]);
  return json({ days, totals: visits[0], bySource, booked, daily, bookings: recent });
}
