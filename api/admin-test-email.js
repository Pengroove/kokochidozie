import { json } from '../lib/db.js';
import { allowed } from '../lib/auth.js';
import { sendTest } from '../lib/email.js';

// Admin-only: sends a sample email so you can check the setup works.
export async function POST(request) {
  if (!allowed(request)) return json({ error: 'Wrong password' }, 401);
  let b = {};
  try { b = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const to = String(b.to || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ error: 'Enter a valid email' }, 400);
  const r = await sendTest(to, 'paid');
  return json(r, r.ok ? 200 : 502);
}
