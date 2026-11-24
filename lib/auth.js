import { timingSafeEqual, createHash } from 'node:crypto';

export function allowed(request) {
  const pw = process.env.ADMIN_PASSWORD || '';
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!pw || !given) return false;
  const a = createHash('sha256').update(pw).digest();
  const b = createHash('sha256').update(given).digest();
  return timingSafeEqual(a, b);
}
