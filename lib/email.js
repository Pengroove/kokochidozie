import { sql } from './db.js';
import { product } from './products.js';

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
    html: wrap(`<p>Hi ${first(b.name)},</p><p>Thanks for booking the ${esc(product(b.product).name)}. Your payment is confirmed.</p><p>Next, pick a time that works for you.</p>`,
      { href: `${product(b.product).cal}?name=${encodeURIComponent(b.name || '')}&email=${encodeURIComponent(b.email || '')}&notes=${encodeURIComponent('Booking ref ' + b.id)}`, label: 'Pick your time' })
  }),
  scheduled: (b) => b.product === 'chat' ? ({
    subject: `You're booked for ${day(b.call_at)}`,
    html: wrap(`<p>Hi ${first(b.name)},</p><p>Our 15-minute chat is set for <strong>${esc(when(b.call_at))}</strong> (Lagos time). The meeting link is in your calendar invite from Cal.com.</p>
<p>If there's anything you'd like me to know before we talk, just reply to this email.</p>`)
  }) : ({
    subject: `You're booked for ${day(b.call_at)}`,
    html: wrap(`<p>Hi ${first(b.name)},</p><p>Our call is set for <strong>${esc(when(b.call_at))}</strong> (Lagos time). The meeting link is in your calendar invite from Cal.com.</p>
<p>Before we talk, reply to this email with:</p><ol style="padding-left:20px"><li>Your website and the main pages you sell from</li><li>Roughly what you sell in a month, and what you spend on ads</li><li>What you've tried so far</li><li>What you'd most like to leave the call with</li></ol>
<p>I'll go through your ads, site and numbers before the call.</p>`)
  }),
  remind_day: (b) => ({
    subject: 'Our call is tomorrow',
    html: wrap(`<p>Hi ${first(b.name)},</p><p>A quick reminder that we talk tomorrow, ${esc(when(b.call_at))} (Lagos time).</p><p>${b.product === 'chat' ? '' : "If you haven't sent your answers yet, just reply to my last email. "}Need a different time? Use the reschedule link in your Cal.com email.</p>`)
  }),
  remind_morning: (b) => ({
    subject: `Today at ${time(b.call_at)}`,
    html: wrap(`<p>Hi ${first(b.name)},</p><p>See you today at ${esc(time(b.call_at))} (Lagos time). The link is in your Cal.com invite.</p>`)
  }),
  after_call: (b) => b.product === 'chat' ? ({
    subject: 'Thanks for the chat',
    html: wrap(`<p>Hi ${first(b.name)},</p><p>Thanks for the chat today. If anything else comes up, just reply to this email.</p>`)
  }) : ({
    subject: 'Thanks for today',
    html: wrap(`<p>Hi ${first(b.name)},</p><p>Thanks for your time today.</p><p>I'll check in around <strong>${esc(day(new Date(new Date(b.call_done_at).getTime() + 30 * 864e5)))}</strong> to see how the plan is going.</p>`)
  }),
  review: (b) => ({
    subject: 'A quick favour',
    html: wrap(`<p>Hi ${first(b.name)},</p><p>If the call was useful, would you reply with a line or two about how it went? With your okay, I'd like to share it on my site.</p><p>No pressure if not.</p>`)
  }),
  support_ending: (b) => ({
    subject: 'Checking in: how is it going?',
    html: wrap(`<p>Hi ${first(b.name)},</p><p>It's been about a month since our call, so I wanted to check in. How is the plan going?</p><p>Reply and tell me what's worked, what hasn't, and where you're stuck. And if you'd like a hand with the work, just say.</p>`)
  })
};

const SITE = 'https://www.kokochidozie.com';

// Follow-ups for people who didn't finish. They stop as soon as the person pays.
// They lean on what the person said they needed help with (the topics they tapped), not the price.
function topicsOf(b) {
  const raw = b.topics || ((String(b.notes || '').match(/^Topics: (.+)$/m) || [])[1]) || '';
  const PHRASE = { 'ads stopped working': 'ads that stopped working', 'cost per sale is too high': "a cost per sale that's too high",
    'not sure what to spend': 'working out what to spend', "website isn't converting": "a website that isn't converting",
    'growing my business': 'growing your business', 'seo': 'SEO', 'something else': '' };
  const list = raw.split(',').map((t) => t.trim().toLowerCase()).map((t) => (t in PHRASE ? PHRASE[t] : t)).filter(Boolean).slice(0, 3);
  if (!list.length) return '';
  return list.length === 1 ? list[0] : list.slice(0, -1).join(', ') + ' and ' + list.at(-1);
}
const need = (b) => topicsOf(b) ? `<strong>${esc(topicsOf(b))}</strong>` : 'growing your brand';
const callName = (b) => b.product === 'chat' ? 'our chat' : 'your consultation';

const RECOVER = {
  abandon_1: (b) => ({
    subject: 'Almost there 👀',
    html: wrap(`<p>Hi ${first(b.name)},</p><p>You started booking a call with me and got right to the payment step.${topicsOf(b) ? ` You'd even picked what you wanted to talk about: ${need(b)}.` : ''} The hard part is done.</p><p>Your details are saved, so the rest takes about a minute, and you pick your time right after.</p>`,
      { href: `${SITE}/api/resume?ref=${b.id}`, label: 'Finish my booking' })
      .replace('<p style="margin:28px 0 0">Koko</p>', '<p style="margin:0">Got a question first, or did the payment give you trouble? Just reply.</p><p style="margin:28px 0 0">Koko</p>')
  }),
  abandon_2: (b) => ({
    subject: "Talk to me. What's the issue?",
    html: wrap(`<p>Hi ${first(b.name)},</p><p>Yesterday you nearly booked ${callName(b)} about ${need(b)}. I'm guessing that problem is still there.</p><p>So talk to me. What's holding you back? The timing, the payment, or you're not sure a call is the right move?</p><p>Hit reply and tell me. One line is enough, and I read every reply myself.</p><p>Or, if you're ready:</p>`,
      { href: `${SITE}/api/resume?ref=${b.id}`, label: 'Book my call' })
  }),
  form_1: (b) => ({
    subject: 'You stopped halfway 👀',
    html: wrap(`<p>Hi ${first(b.name)},</p><p>You started booking a call with me and got halfway through the form.${topicsOf(b) ? ` You'd even picked what you wanted to talk about: ${need(b)}.` : ''} The hard part is done.</p><p>The rest takes about a minute, and you pick your time right after.</p>`,
      { href: `${SITE}${product(b.product).page}`, label: 'Finish my booking' })
      .replace('<p style="margin:28px 0 0">Koko</p>', '<p style="margin:0">Got a question first? Just reply.</p><p style="margin:28px 0 0">Koko</p>')
  }),
  form_2: (b) => ({
    subject: "So, what's the issue?",
    html: wrap(`<p>Hi ${first(b.name)},</p><p>Yesterday you nearly booked a call with me about ${need(b)}. I'm guessing that problem is still there.</p><p>So talk to me. What's holding you back? The timing, or you're not sure a call is the right move?</p><p>Hit reply and tell me. One line is enough, and I read every reply myself.</p><p>Or, if you're ready:</p>`,
      { href: `${SITE}${product(b.product).page}`, label: 'Book my call' })
  })
};
Object.assign(TEMPLATES, { abandon_1: RECOVER.abandon_1, abandon_2: RECOVER.abandon_2 });

// Same once-only sending, for people who left the form before paying (kept in kc_leads).
export async function sendLeadOnce(vid, kind) {
  if (!emailsOn() || !RECOVER[kind]) return false;
  const claimed = await sql`UPDATE kc_leads SET emails = emails || jsonb_build_object(${kind}::text, now())
    WHERE vid = ${vid} AND NOT (emails ? ${kind}) RETURNING *`;
  const b = claimed[0];
  if (!b || !b.email) return false;
  const { subject, html } = RECOVER[kind](b);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [b.email], reply_to: REPLY_TO, subject, html })
    });
    if (!r.ok) throw new Error('resend ' + r.status);
    return true;
  } catch (e) {
    console.error('lead email failed', kind, vid, e.message);
    await sql`UPDATE kc_leads SET emails = emails - ${kind}::text WHERE vid = ${vid}`;
    return false;
  }
}

export const EMAIL_LABELS = {
  paid: 'Payment received', scheduled: 'Booking confirmed + questions', remind_day: 'Day-before reminder',
  remind_morning: 'Morning-of reminder', after_call: 'Thanks + check-in date', review: 'Review request', support_ending: '30-day check-in',
  abandon_1: 'Unfinished payment (20 min)', abandon_2: 'Unfinished payment (next day)', form_1: 'Unfinished form (15 min)', form_2: 'Unfinished form (next day)'
};

// Sends a sample of one template to any address, for checking Resend works.
export async function sendTest(to, kind = 'paid') {
  if (!emailsOn()) return { ok: false, error: 'RESEND_API_KEY is not set' };
  const fake = { id: 'kc_test', name: 'Test', email: to, call_at: new Date(Date.now() + 864e5), call_done_at: new Date() };
  const { subject, html } = TEMPLATES[kind](fake);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject: '[Test] ' + subject, html })
  });
  if (!r.ok) return { ok: false, error: 'Resend said: ' + (await r.text()).slice(0, 200) };
  return { ok: true };
}

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
