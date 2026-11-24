import { sql, ensureTables, json } from '../lib/db.js';
import { allowed } from '../lib/auth.js';

// Who's on the site right now (seen in the last 75 seconds).
export async function GET(request) {
  if (!allowed(request)) return json({ error: 'Wrong password' }, 401);
  await ensureTables();
  const now = await sql`SELECT vid, started, last_seen, path, stage, source, country, city
                        FROM kc_live WHERE last_seen > now() - interval '75 seconds' ORDER BY started DESC LIMIT 100`;
  const today = await sql`SELECT count(DISTINCT vid)::int AS n FROM kc_visits WHERE ts > date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos'`;
  return json({ live: now, todayVisitors: today[0].n, at: new Date().toISOString() });
}
