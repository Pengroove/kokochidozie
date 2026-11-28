import { sql, ensureTables, json } from '../lib/db.js';
import { allowed } from '../lib/auth.js';
import { emailsOn } from '../lib/email.js';
import { syncPayments } from '../lib/pay.js';

// Numbers for the admin dashboard: visits and bookings by source over the chosen days.
export async function GET(request) {
  if (!allowed(request)) return json({ error: 'Wrong password' }, 401);
  const days = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get('days') || '30', 10) || 30, 1), 90);
  await ensureTables();
  // Pull in any payments Bachs has that the site missed, so the board is always up to date.
  let sync = null;
  try { sync = await syncPayments(); } catch (e) { console.error('payment sync failed', e?.message); sync = { error: true }; }
  const [visits, bySource, booked, daily, recent, funnel, places, popStats, popAnswers, popEmails] = await Promise.all([
    sql`SELECT count(*)::int AS visits, count(DISTINCT vid)::int AS visitors FROM kc_visits WHERE ts > now() - make_interval(days => ${days})`,
    sql`SELECT source, count(*)::int AS visits, count(DISTINCT vid)::int AS visitors
        FROM kc_visits WHERE ts > now() - make_interval(days => ${days}) GROUP BY source ORDER BY visits DESC LIMIT 20`,
    sql`SELECT source, count(*)::int AS bookings, COALESCE(sum(amount),0)::float AS revenue
        FROM kc_bookings WHERE status = 'paid' AND paid_at > now() - make_interval(days => ${days}) GROUP BY source`,
    sql`SELECT to_char(date_trunc('day', ts), 'YYYY-MM-DD') AS day, count(*)::int AS visits
        FROM kc_visits WHERE ts > now() - make_interval(days => ${days}) GROUP BY 1 ORDER BY 1`,
    sql`SELECT id, created_at, paid_at, name, email, phone, brand, website, notes, source, amount, currency, status, product,
               stage, call_at, call_done_at, admin_notes, emails
        FROM kc_bookings ORDER BY created_at DESC LIMIT 100`,
    sql`SELECT kind, count(DISTINCT vid)::int AS n FROM kc_events WHERE ts > now() - make_interval(days => ${days}) GROUP BY kind`,
    sql`SELECT country, COALESCE(city, '') AS city, count(DISTINCT vid)::int AS visitors
        FROM kc_visits WHERE ts > now() - make_interval(days => ${days}) AND country IS NOT NULL
        GROUP BY country, city ORDER BY visitors DESC LIMIT 15`,
    sql`SELECT count(*)::int AS seen, count(answer)::int AS answered, count(email)::int AS emails
        FROM kc_popup WHERE seen_at > now() - make_interval(days => ${days})`,
    sql`SELECT answer, count(*)::int AS n FROM kc_popup
        WHERE answer IS NOT NULL AND seen_at > now() - make_interval(days => ${days}) GROUP BY answer ORDER BY n DESC`,
    sql`SELECT email, answer, source, country, city, email_at FROM kc_popup WHERE email IS NOT NULL ORDER BY email_at DESC LIMIT 2000`
  ]);
  const W = days;
  const abandonedForms = await sql`SELECT vid, created_at, updated_at, product, name, email, phone, brand, topics, source, emails FROM kc_leads l
    WHERE booking_id IS NULL AND updated_at > now() - make_interval(days => ${W})
      AND NOT EXISTS (SELECT 1 FROM kc_bookings b WHERE (lower(b.email) = lower(l.email) OR b.phone = l.phone) AND b.created_at > l.created_at - interval '1 day')
    ORDER BY updated_at DESC LIMIT 100`;
  const [eng, reach, clicks, devices, returning, pages] = await Promise.all([
    sql`SELECT count(*)::int AS n, COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY secs), 0)::float AS med_secs,
               COALESCE(avg(max_pct), 0)::float AS avg_pct,
               count(*) FILTER (WHERE max_pct >= 25)::int AS p25, count(*) FILTER (WHERE max_pct >= 50)::int AS p50,
               count(*) FILTER (WHERE max_pct >= 75)::int AS p75, count(*) FILTER (WHERE max_pct >= 95)::int AS p100
        FROM kc_engage WHERE path IN ('/', '/index.html') AND ts > now() - make_interval(days => ${W})`,
    sql`SELECT COALESCE(deepest, 'top') AS deepest, count(*)::int AS n FROM kc_engage
        WHERE path IN ('/', '/index.html') AND ts > now() - make_interval(days => ${W}) GROUP BY 1`,
    sql`SELECT label, section, count(*)::int AS clicks, count(DISTINCT vid)::int AS people FROM kc_clicks
        WHERE ts > now() - make_interval(days => ${W}) AND path NOT LIKE '/admin%' GROUP BY label, section ORDER BY people DESC, clicks DESC LIMIT 20`,
    sql`SELECT COALESCE(device, 'Unknown') AS device, count(DISTINCT vid)::int AS n FROM kc_visits
        WHERE ts > now() - make_interval(days => ${W}) GROUP BY 1 ORDER BY n DESC`,
    sql`SELECT count(*)::int AS visitors, count(*) FILTER (WHERE d > 1)::int AS returning FROM
        (SELECT vid, count(DISTINCT date_trunc('day', ts)) AS d FROM kc_visits WHERE ts > now() - make_interval(days => ${W}) GROUP BY vid) x`,
    sql`SELECT v.path, count(DISTINCT v.vid)::int AS visitors,
               (SELECT COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY e.secs), 0)::float FROM kc_engage e
                WHERE e.path = v.path AND e.ts > now() - make_interval(days => ${W})) AS med_secs
        FROM kc_visits v WHERE v.ts > now() - make_interval(days => ${W}) GROUP BY v.path ORDER BY visitors DESC LIMIT 8`
  ]);
  const f = Object.fromEntries(funnel.map((x) => [x.kind, x.n]));
  return json({ days, totals: visits[0], bySource, booked, daily, bookings: recent, places,
    funnel: { consult: f.consult || 0, form: f.form || 0, checkout: f.checkout || 0 }, emailsOn: emailsOn(),
    popup: { ...popStats[0], answers: popAnswers, emails: popEmails }, sync,
    abandonedForms, engage: { ...eng[0], reach, clicks, devices, returning: returning[0], pages } });
}
