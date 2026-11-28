import { sql, ensureTables } from '../lib/db.js';

// One-click unsubscribe from the popup emails.
export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }
async function handle(request) {
  const u = new URL(request.url).searchParams.get('u') || '';
  if (u) { await ensureTables(); await sql`UPDATE kc_popup SET unsubscribed_at = COALESCE(unsubscribed_at, now()) WHERE vid = ${u}`; }
  return new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#BFE1FF;font-family:system-ui,sans-serif;color:#17183B;display:grid;place-items:center;min-height:100vh"><div style="background:#fff;border:2px solid #17183B;border-radius:20px;padding:28px;max-width:420px;box-shadow:5px 5px 0 #17183B"><h1 style="margin:0 0 8px;font-size:26px">You're unsubscribed</h1><p style="margin:0">You won't get these emails from me any more. <a href="/" style="color:#2E45F5">Back to the site</a></p></div></body>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
