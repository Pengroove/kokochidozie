import { sql, ensureTables, json, clean } from '../lib/db.js';

// Saves what someone has typed into the booking form so far, so an abandoned form can be followed up.
export async function POST(request) {
  let b = {};
  try { b = JSON.parse(await request.text()); } catch { return json({ ok: false }, 400); }
  const vid = clean(b.vid, 64);
  if (!vid) return json({ ok: false }, 400);
  const email = clean(b.email, 160).toLowerCase();
  const phone = clean(b.phone, 30);
  const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!okEmail && phone.replace(/\D/g, '').length < 10) return json({ ok: true, saved: false });
  await ensureTables();
  const product = b.product === 'chat' ? 'chat' : 'consult';
  await sql`INSERT INTO kc_leads (vid, product, name, email, phone, brand, topics, source)
            VALUES (${vid}, ${product}, ${clean(b.name, 120) || null}, ${okEmail ? email : null}, ${phone || null},
                    ${clean(b.brand, 120) || null}, ${clean(b.topics, 300) || null}, ${clean(b.source, 60) || null})
            ON CONFLICT (vid) DO UPDATE SET updated_at = now(), product = EXCLUDED.product,
              name = COALESCE(EXCLUDED.name, kc_leads.name), email = COALESCE(EXCLUDED.email, kc_leads.email),
              phone = COALESCE(EXCLUDED.phone, kc_leads.phone), brand = COALESCE(EXCLUDED.brand, kc_leads.brand),
              topics = COALESCE(EXCLUDED.topics, kc_leads.topics), source = COALESCE(kc_leads.source, EXCLUDED.source)`;
  return json({ ok: true, saved: true });
}
