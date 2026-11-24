import { sql, ensureTables, json } from '../lib/db.js';
import { allowed } from '../lib/auth.js';
import { emailsOn } from '../lib/email.js';

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
    sql`SELECT id, created_at, paid_at, name, email, phone, brand, website, notes, source, amount, currency, status,
               stage, call_at, call_done_at, admin_notes, emails
        FROM kc_bookings ORDER BY created_at DESC LIMIT 100`
  ]);
  return json({ days, totals: visits[0], bySource, booked, daily, bookings: recent, emailsOn: emailsOn() });
}
