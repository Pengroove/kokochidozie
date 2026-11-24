import { sql, ensureTables, json, clean, geo, classify } from '../lib/db.js';

const STAGES = new Set(['browsing', 'consultation', 'filling', 'payment', 'booked']);

// A small "still here" ping from open pages, every 30 seconds, so the admin can show who's live.
export async function POST(request) {
  let b = {};
  try { b = await request.json(); } catch { return json({ ok: false }, 400); }
  const ua = request.headers.get('user-agent') || '';
  if (/bot|crawl|spider|preview|facebookexternalhit|whatsapp|slurp/i.test(ua)) return json({ ok: true });
  const vid = clean(b.vid, 40);
  if (!vid) return json({ ok: false }, 400);
  const stage = STAGES.has(b.stage) ? b.stage : 'browsing';
  const g = geo(request);
  const source = b.source ? clean(b.source, 60) : classify(b.utm_source, b.ref);
  try {
    await ensureTables();
    // Never move someone backwards from "payment" just because they reloaded the form page.
    await sql`INSERT INTO kc_live (vid, path, stage, source, country, city)
              VALUES (${vid}, ${clean(b.path, 120)}, ${stage}, ${source}, ${g.country}, ${g.city})
              ON CONFLICT (vid) DO UPDATE SET
                last_seen = now(), path = EXCLUDED.path,
                started = CASE WHEN kc_live.last_seen < now() - interval '30 minutes' THEN now() ELSE kc_live.started END,
                stage = CASE WHEN kc_live.stage = 'payment' AND kc_live.last_seen > now() - interval '30 minutes' AND EXCLUDED.stage <> 'booked'
                             THEN 'payment' ELSE EXCLUDED.stage END,
                country = COALESCE(EXCLUDED.country, kc_live.country), city = COALESCE(EXCLUDED.city, kc_live.city)`;
    if (stage === 'filling') await sql`INSERT INTO kc_events (vid, kind) VALUES (${vid}, 'form') ON CONFLICT DO NOTHING`;
    if (stage === 'consultation') await sql`INSERT INTO kc_events (vid, kind) VALUES (${vid}, 'consult') ON CONFLICT DO NOTHING`;
  } catch (e) {
    console.error('live failed', e?.message);
    return json({ ok: false }, 500);
  }
  return json({ ok: true });
}
