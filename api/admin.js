import { sql, ensureTables, json } from '../lib/db.js';
import { allowed } from '../lib/auth.js';
import { emailsOn } from '../lib/email.js';
import { syncPayments } from '../lib/pay.js';
import { abGroup } from '../lib/email.js';

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
    sql`SELECT vid, email, answer, source, country, city, email_at, welcome_at, unsubscribed_at FROM kc_popup WHERE email IS NOT NULL ORDER BY email_at DESC LIMIT 2000`
  ]);
  const W = days;
  const abandonedForms = await sql`SELECT vid, created_at, updated_at, product, name, email, phone, brand, topics, source, emails FROM kc_leads l
    WHERE booking_id IS NULL AND updated_at > now() - make_interval(days => ${W})
      AND NOT EXISTS (SELECT 1 FROM kc_bookings b WHERE (lower(b.email) = lower(l.email) OR b.phone = l.phone) AND b.created_at > l.created_at - interval '1 day')
    ORDER BY updated_at DESC LIMIT 100`;
  // Timing test results: everyone who got a first follow-up, by group, and whether they went on to pay.
  const followed = await sql`
    SELECT b.id AS key, b.email, (b.emails->>'abandon_1')::timestamptz AS at FROM kc_bookings b WHERE b.emails ? 'abandon_1'
    UNION ALL SELECT l.vid, l.email, (l.emails->>'form_1')::timestamptz FROM kc_leads l WHERE l.emails ? 'form_1'`;
  const paidEmails = await sql`SELECT lower(email) AS email, paid_at FROM kc_bookings WHERE status = 'paid'`;
  const abTest = { A: { sent: 0, booked: 0 }, B: { sent: 0, booked: 0 } };
  for (const f of followed) {
    const g = abTest[abGroup(f.key)]; g.sent++;
    if (paidEmails.some((p) => p.email === String(f.email || '').toLowerCase() && new Date(p.paid_at) >= new Date(f.at))) g.booked++;
  }
  const reviews = await sql`SELECT id, created_at, name, brand, rating, body, product, status, booking_id FROM kc_reviews ORDER BY created_at DESC LIMIT 100`;
  // Email performance: one row per email group (welcome, abandon, form, booking emails).
  const emailStats = await sql`SELECT grp, kind, count(*)::int AS sent, count(delivered_at)::int AS delivered, count(opened_at)::int AS opened,
      count(clicked_at)::int AS clicked, count(bounced_at)::int AS bounced
    FROM kc_email_log WHERE sent_at > now() - make_interval(days => ${days}) GROUP BY grp, kind ORDER BY grp, kind`;
  const welcomeOpens = await sql`SELECT ref, max(opened_at) AS opened_at, max(clicked_at) AS clicked_at FROM kc_email_log WHERE grp = 'welcome' GROUP BY ref`;
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
    abandonedForms, abTest, reviews, emailStats, welcomeOpens, emailTracking: Boolean(process.env.RESEND_WEBHOOK_SECRET), engage: { ...eng[0], reach, clicks, devices, returning: returning[0], pages } });
}
