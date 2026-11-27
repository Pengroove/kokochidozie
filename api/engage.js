import { sql, ensureTables, json, clean } from '../lib/db.js';

// Scroll depth, time on page and clicks, sent from t.js.
export async function POST(request) {
  let b = {};
  try { b = JSON.parse(await request.text()); } catch { return json({ ok: false }, 400); }
  const ua = request.headers.get('user-agent') || '';
  if (/bot|crawl|spider|preview|headless/i.test(ua)) return json({ ok: true });
  const vid = clean(b.vid, 64), path = clean(b.path, 120) || '/';
  if (!vid) return json({ ok: false }, 400);
  await ensureTables();
  if (b.click) {
    await sql`INSERT INTO kc_clicks (vid, path, label, section) VALUES (${vid}, ${path}, ${clean(b.click, 80)}, ${clean(b.section, 30)})`;
    if (Math.random() < 0.02) await sql`DELETE FROM kc_clicks WHERE ts < now() - interval '90 days'`;
    return json({ ok: true });
  }
  const max = Math.max(0, Math.min(100, parseInt(b.max, 10) || 0));
  const secs = Math.max(0, Math.min(3600, parseInt(b.secs, 10) || 0));
  const deepest = clean(b.deepest, 30) || null;
  await sql`INSERT INTO kc_engage (vid, path, max_pct, deepest, secs) VALUES (${vid}, ${path}, ${max}, ${deepest}, ${secs})
            ON CONFLICT (vid, path, day) DO UPDATE SET max_pct = GREATEST(kc_engage.max_pct, EXCLUDED.max_pct),
              deepest = COALESCE(EXCLUDED.deepest, kc_engage.deepest), secs = GREATEST(kc_engage.secs, EXCLUDED.secs), ts = now()`;
  return json({ ok: true });
}
