import { sql, ensureTables, json, classify, clean, geo } from '../lib/db.js';

// Records one page visit with where it came from.
export async function POST(request) {
  let b = {};
  try { b = await request.json(); } catch { return json({ ok: false }, 400); }
  const ua = request.headers.get('user-agent') || '';
  if (/bot|crawl|spider|preview|facebookexternalhit|whatsapp|slurp|vercel/i.test(ua)) return json({ ok: true, skipped: true });
  const source = classify(b.utm_source, b.ref);
  try {
    await ensureTables();
    const g = geo(request);
    const device = /iPad|Tablet/i.test(ua) ? 'Tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'Mobile' : 'Desktop';
    await sql`INSERT INTO kc_visits (vid, source, campaign, path, country, city, device)
              VALUES (${clean(b.vid, 40)}, ${source}, ${clean(b.utm_campaign, 80) || null}, ${clean(b.path, 120)}, ${g.country}, ${g.city}, ${device})`;
    if (Math.random() < 0.02) {
      await sql`DELETE FROM kc_visits WHERE ts < now() - interval '90 days'`;
      await sql`DELETE FROM kc_events WHERE ts < now() - interval '90 days'`;
      await sql`DELETE FROM kc_engage WHERE ts < now() - interval '90 days'`;
      await sql`DELETE FROM kc_live WHERE last_seen < now() - interval '1 day'`;
    }
  } catch (e) {
    console.error('track failed', e);
    return json({ ok: false, source }, 500);
  }
  return json({ ok: true, source });
}
