import { sql, ensureTables, json, clean, geo } from '../lib/db.js';

const ANSWERS = ['brand', 'marketer', 'building', 'nosy'];

// Records the homepage popup: that it was seen, what they picked, and their email if they gave one.
export async function POST(request) {
  let b = {};
  try { b = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const vid = clean(b.vid, 64);
  if (!vid) return json({ error: 'Bad request' }, 400);
  await ensureTables();
  const g = geo(request);
  const source = clean(b.source, 40);
  if (b.step === 'seen') {
    await sql`INSERT INTO kc_popup (vid, source, country, city) VALUES (${vid}, ${source}, ${g.country}, ${g.city}) ON CONFLICT (vid) DO NOTHING`;
  } else if (b.step === 'answer') {
    if (!ANSWERS.includes(b.answer)) return json({ error: 'Bad answer' }, 400);
    await sql`INSERT INTO kc_popup (vid, answer, answered_at, source, country, city) VALUES (${vid}, ${b.answer}, now(), ${source}, ${g.country}, ${g.city})
              ON CONFLICT (vid) DO UPDATE SET answer = EXCLUDED.answer, answered_at = now()`;
  } else if (b.step === 'email') {
    const email = String(b.email || '').trim().toLowerCase().slice(0, 200);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Enter a valid email' }, 400);
    await sql`INSERT INTO kc_popup (vid, email, email_at, source, country, city) VALUES (${vid}, ${email}, now(), ${source}, ${g.country}, ${g.city})
              ON CONFLICT (vid) DO UPDATE SET email = EXCLUDED.email, email_at = now()`;
  } else return json({ error: 'Bad step' }, 400);
  return json({ ok: true });
}
