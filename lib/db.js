import { neon } from '@neondatabase/serverless';

export const sql = neon(process.env.DATABASE_URL || process.env.STORAGE_URL);

let ready;
export function ensureTables() {
  if (!ready) {
    ready = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS kc_visits (
        id BIGSERIAL PRIMARY KEY,
        ts TIMESTAMPTZ NOT NULL DEFAULT now(),
        vid TEXT,
        source TEXT NOT NULL,
        campaign TEXT,
        path TEXT
      )`;
      await sql`CREATE INDEX IF NOT EXISTS kc_visits_ts ON kc_visits (ts)`;
      await sql`CREATE TABLE IF NOT EXISTS kc_bookings (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        name TEXT, email TEXT, brand TEXT, website TEXT, notes TEXT,
        source TEXT, campaign TEXT,
        amount NUMERIC, currency TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        checkout_id TEXT,
        paid_at TIMESTAMPTZ
      )`;
      await sql`ALTER TABLE kc_bookings ADD COLUMN IF NOT EXISTS phone TEXT`;
      await sql`ALTER TABLE kc_bookings ADD COLUMN IF NOT EXISTS stage TEXT`;
      await sql`ALTER TABLE kc_bookings ADD COLUMN IF NOT EXISTS call_at TIMESTAMPTZ`;
      await sql`ALTER TABLE kc_bookings ADD COLUMN IF NOT EXISTS cal_uid TEXT`;
      await sql`ALTER TABLE kc_bookings ADD COLUMN IF NOT EXISTS call_done_at TIMESTAMPTZ`;
      await sql`ALTER TABLE kc_bookings ADD COLUMN IF NOT EXISTS admin_notes TEXT`;
      await sql`ALTER TABLE kc_bookings ADD COLUMN IF NOT EXISTS emails JSONB NOT NULL DEFAULT '{}'::jsonb`;
      await sql`ALTER TABLE kc_visits ADD COLUMN IF NOT EXISTS country TEXT`;
      await sql`ALTER TABLE kc_visits ADD COLUMN IF NOT EXISTS city TEXT`;
      await sql`CREATE TABLE IF NOT EXISTS kc_live (
        vid TEXT PRIMARY KEY,
        started TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
        path TEXT, stage TEXT, source TEXT, country TEXT, city TEXT
      )`;
      await sql`CREATE TABLE IF NOT EXISTS kc_events (
        vid TEXT NOT NULL, kind TEXT NOT NULL, day DATE NOT NULL DEFAULT current_date,
        ts TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (vid, kind, day)
      )`;
      await sql`ALTER TABLE kc_bookings ADD COLUMN IF NOT EXISTS bachs_payment_id TEXT`;
      await sql`ALTER TABLE kc_visits ADD COLUMN IF NOT EXISTS device TEXT`;
      await sql`CREATE TABLE IF NOT EXISTS kc_engage (
        vid TEXT NOT NULL, path TEXT NOT NULL, day DATE NOT NULL DEFAULT current_date,
        max_pct INT NOT NULL DEFAULT 0, deepest TEXT, secs INT NOT NULL DEFAULT 0,
        ts TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (vid, path, day)
      )`;
      await sql`CREATE TABLE IF NOT EXISTS kc_clicks (
        id BIGSERIAL PRIMARY KEY, ts TIMESTAMPTZ NOT NULL DEFAULT now(),
        vid TEXT, path TEXT, label TEXT, section TEXT
      )`;
      await sql`CREATE TABLE IF NOT EXISTS kc_popup (
        vid TEXT PRIMARY KEY,
        seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        answer TEXT, answered_at TIMESTAMPTZ,
        email TEXT, email_at TIMESTAMPTZ,
        source TEXT, country TEXT, city TEXT
      )`;
      await sql`CREATE TABLE IF NOT EXISTS kc_webhook_events (
        id TEXT PRIMARY KEY,
        received_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    })().catch((e) => { ready = undefined; throw e; });
  }
  return ready;
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

const MAP = [
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$|^fb\.me$/, 'Facebook'],
  [/^t\.co$|(^|\.)x\.com$|(^|\.)twitter\.com$/, 'X'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'LinkedIn'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)youtube\.com$|^youtu\.be$/, 'YouTube'],
  [/(^|\.)whatsapp\.com$|^wa\.me$/, 'WhatsApp'],
  [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$|(^|\.)perplexity\.ai$|(^|\.)claude\.ai$|(^|\.)gemini\.google\.com$/, 'AI search'],
  [/(^|\.)google\.[a-z.]+$/, 'Google'],
  [/(^|\.)bing\.com$|(^|\.)duckduckgo\.com$|(^|\.)yahoo\.com$/, 'Other search'],
  [/(^|\.)pengroove\.com$/, 'pengroove.com']
];

const UTM = {
  ig: 'Instagram', instagram: 'Instagram', facebook: 'Facebook', fb: 'Facebook', meta: 'Facebook',
  x: 'X', twitter: 'X', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube',
  whatsapp: 'WhatsApp', wa: 'WhatsApp', google: 'Google', email: 'Email', newsletter: 'Email'
};

// Work out where a visitor came from: a tagged link wins, then the referring site, else Direct.
export function classify(utmSource, referrer) {
  const u = String(utmSource || '').trim().toLowerCase().slice(0, 60);
  if (u) return UTM[u] || u.charAt(0).toUpperCase() + u.slice(1);
  let host = '';
  try { host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, ''); } catch {}
  if (!host || host === 'kokochidozie.com' || host.endsWith('.vercel.app')) return 'Direct';
  for (const [re, name] of MAP) if (re.test(host)) return name;
  return host.slice(0, 60);
}

export function clean(v, max = 300) {
  return String(v ?? '').trim().slice(0, max);
}

// Where the visitor is, from Vercel's location headers (city is URL-encoded).
export function geo(request) {
  const h = request.headers;
  let city = h.get('x-vercel-ip-city') || '';
  try { city = decodeURIComponent(city); } catch {}
  return { country: clean(h.get('x-vercel-ip-country'), 4) || null, city: clean(city, 80) || null };
}
