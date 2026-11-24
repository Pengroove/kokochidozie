import { sql } from './db.js';

const CAL = 'https://cal.com/kokochidozie/1hourconsultation';
const FROM = process.env.EMAIL_FROM || 'Koko Chidozie <hello@kokochidozie.com>';
const REPLY_TO = process.env.EMAIL_REPLY_TO || 'hello@pengroove.com';

export const emailsOn = () => Boolean(process.env.RESEND_API_KEY);

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const first = (name) => esc(String(name || '').trim().split(/\s+/)[0] || 'there');

export function lagos(d, opts) {
  return new Date(d).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', ...opts });
}
const when = (d) => lagos(d, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true });
const day = (d) => lagos(d, { weekday: 'long', day: 'numeric', month: 'long' });
const time = (d) => lagos(d, { hour: 'numeric', minute: '2-digit', hour12: true });

function wrap(body, button) {
  const btn = button
    ? `<p style="margin:26px 0"><a href="${esc(button.href)}" style="display:inline-block;background:#FF8AD0;color:#17183B;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:999px;border:2px solid #17183B">${esc(button.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#FFFFFF;color:#17183B;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6">
<div style="max-width:520px;margin:0 auto;padding:32px 22px">${body}${btn}<p style="margin:28px 0 0">Koko</p>
<p style="margin:28px 0 0;font-size:13px;color:#5A5C80">kokochidozie.com</p></div></body></html>`;
}

// Each email the system can send. Wording is plain and first person, and it never pushes.
const TEMPLATES = {
  paid: (b) => ({
    subject: 'Payment received: pick your call time',
    html: wrap(`<p>Hi ${first(b.name)},</p><p>Thanks for booking the 1-hour growth consultation. Your payment is confirmed.</p><p>Next, pick a time that works for you.</p>`,
      { href: `${CAL}?name=${encodeURIComponent(b.name || '')}&email=${encodeURIComponent(b.email || '')}&notes=${encodeURIComponent('Booking ref ' + b.id)}`, label: 'Pick your time' })
  }),
  scheduled: (b) => ({
    subject: `You're booked for ${day(b.call_at)}`,
    html: wrap(`<p>Hi ${first(b.name)},</p><p>Our call is set for <strong>${esc(when(b.call_at))}</strong> (Lagos time). The meeting link is in your calendar invite from Cal.com.</p>
<p>Before we talk, reply to this email with:</p><ol style="padding-left:20px"><li>Your website and the main pages you sell from</li><li>Roughly what you sell in a month, and what you spend on ads</li><li>What you've tried so far</li><li>What you'd most like to leave the call with</li></ol>
<p>I'll go through your ads, site and numbers before the call.</p>`)
  }),
  remind_day: (b) => ({
    subject: 'Our call is tomorrow',
    html: wrap(`<p>Hi ${first(b.name)},</p><p>A quick reminder that we talk tomorrow, ${esc(when(b.call_at))} (Lagos time).</p><p>If you haven't sent your answers yet, just reply to my last email. Need a different time? Use the reschedule link in your Cal.com email.</p>`)
  }),
  remind_morning: (b) => ({
    subject: `Today at ${time(b.call_at)}`,
    html: wrap(`<p>Hi ${first(b.name)},</p><p>See you today at ${esc(time(b.call_at))} (Lagos time). The link is in your Cal.com invite.</p>`)
  }),
  after_call: (b) => ({
    subject: 'Thanks for today',
    html: wrap(`<p>Hi ${first(b.name)},</p><p>Thanks for your time today.</p><p>Your 30 days of support run until <strong>${esc(day(new Date(new Date(b.call_done_at).getTime() + 30 * 864e5)))}</strong>. If anything comes up while you work through the plan, reply to this email.</p>`)
  }),
  review: (b) => ({
    subject: 'A quick favour',
    html: wrap(`<p>Hi ${first(b.name)},</p><p>If the call was useful, would you reply with a line or two about how it went? With your okay, I'd like to share it on my site.</p><p>No pressure if not.</p>`)
  }),
  support_ending: (b) => ({
    subject: `Your support ends on ${day(new Date(new Date(b.call_done_at).getTime() + 30 * 864e5))}`,
    html: wrap(`<p>Hi ${first(b.name)},</p><p>Your 30 days of support end on ${esc(day(new Date(new Date(b.call_done_at).getTime() + 30 * 864e5)))}. If there's anything you'd like to go through before then, reply here.</p><p>And if you'd like a hand with the work after that, just say.</p>`)
  })
};

export const EMAIL_LABELS = {
  paid: 'Payment received', scheduled: 'Booking confirmed + questions', remind_day: 'Day-before reminder',
  remind_morning: 'Morning-of reminder', after_call: 'Thanks + support dates', review: 'Review request', support_ending: 'Support ending'
};

// Sends one email to a booking, at most once per kind. Claims the slot first so two runs can't double-send.
export async function sendOnce(id, kind) {
  if (!emailsOn() || !TEMPLATES[kind]) return false;
  const claimed = await sql`UPDATE kc_bookings SET emails = emails || jsonb_build_object(${kind}::text, now())
    WHERE id = ${id} AND NOT (emails ? ${kind}) RETURNING *`;
  const b = claimed[0];
  if (!b || !b.email) return false;
  const { subject, html } = TEMPLATES[kind](b);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [b.email], reply_to: REPLY_TO, subject, html })
    });
    if (!r.ok) throw new Error('resend ' + r.status + ' ' + (await r.text()).slice(0, 200));
    return true;
  } catch (e) {
    console.error('email failed', kind, id, e.message);
    await sql`UPDATE kc_bookings SET emails = emails - ${kind}::text WHERE id = ${id}`;
    return false;
  }
}
