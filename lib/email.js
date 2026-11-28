import { sql } from './db.js';
import { product } from './products.js';

const FROM = process.env.EMAIL_FROM || 'Koko Chidozie <hello@kokochidozie.com>';
const REPLY_TO = process.env.EMAIL_REPLY_TO || 'hello@kokochidozie.com';

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
    subject: 'Lovely chatting with you today',
    html: wrap(`<p>Hi ${first(b.name)},</p><p>It was lovely chatting with you today. Thanks for making the time.</p><p>If anything else comes up as you work through it, just reply to this email. And if you'd like me to go through your ads, site and numbers properly, that's what the 1-hour consultation is for.</p>`,
      { href: `${SITE}/consultation`, label: 'See the consultation' })
  }) : ({
    subject: "Thanks for today. Here's what happens next",
    html: wrap(`<p>Hi ${first(b.name)},</p><p>It was great going through your brand with you today. Here's what happens from here:</p>
<ol style="padding-left:20px;margin:0 0 16px"><li style="margin-bottom:8px"><strong>Work through the plan in order.</strong> Start with the first fix we agreed on before moving to the next. Doing them in order is what makes them work.</li>
<li style="margin-bottom:8px"><strong>Reply if you get stuck.</strong> If something isn't clear as you go, reply to this email and I'll point you in the right direction.</li>
<li><strong>I'll check in around ${esc(day(new Date(new Date(b.call_done_at).getTime() + 30 * 864e5)))}.</strong> That's about 30 days from today. I'll ask what's changed, what's worked and where you're stuck, so we can see if the plan is moving the numbers.</li></ol>`)
  }),
  review: (b) => ({
    subject: 'A quick favour',
    html: wrap(`<p>Hi ${first(b.name)},</p><p>If our call was useful, would you leave a quick review? It's a star rating and a line or two, and it takes under a minute.</p><p>It helps other business owners decide if a call with me is right for them. No pressure if not.</p>`,
      { href: `${SITE}/review?ref=${b.id}`, label: 'Leave a review' })
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
    html: wrap(`<p>Hi ${first(b.name)},</p><p>Earlier you nearly booked ${callName(b)} about ${need(b)}. I'm guessing that problem is still there.</p><p>So talk to me. What's holding you back? The timing, the payment, or you're not sure a call is the right move?</p><p>Hit reply and tell me. One line is enough, and I read every reply myself.</p><p>Or, if you're ready:</p>`,
      { href: `${SITE}/api/resume?ref=${b.id}`, label: 'Book my call' })
  }),
  abandon_3: (b) => RECOVER.last(b, `${SITE}/api/resume?ref=${b.id}`),
  form_3: (b) => RECOVER.last(b, `${SITE}${product(b.product).page}`),
  last: (b, href) => ({
    subject: "Hi, it's Koko",
    html: wrap(`<p>Hi ${first(b.name)},</p><p>Koko here, with one last note from me.</p><p>I've spent the last few years running ads, email and SEO for brands like Mofe, Smileys and House of Coco, and the problems people bring me usually look a lot like ${need(b)}. Most of the time it's fixable once you can see where things are leaking.</p><p>If you'd like to talk it through, my calendar is open. If now isn't the time, that's completely fine. This is the last email from me about it.</p>`,
      { href, label: 'Book a call with me' })
  }),
  form_1: (b) => ({
    subject: 'You stopped halfway 👀',
    html: wrap(`<p>Hi ${first(b.name)},</p><p>You started booking a call with me and got halfway through the form.${topicsOf(b) ? ` You'd even picked what you wanted to talk about: ${need(b)}.` : ''} The hard part is done.</p><p>The rest takes about a minute, and you pick your time right after.</p>`,
      { href: `${SITE}${product(b.product).page}`, label: 'Finish my booking' })
      .replace('<p style="margin:28px 0 0">Koko</p>', '<p style="margin:0">Got a question first? Just reply.</p><p style="margin:28px 0 0">Koko</p>')
  }),
  form_2: (b) => ({
    subject: "So, what's the issue?",
    html: wrap(`<p>Hi ${first(b.name)},</p><p>Earlier you nearly booked a call with me about ${need(b)}. I'm guessing that problem is still there.</p><p>So talk to me. What's holding you back? The timing, or you're not sure a call is the right move?</p><p>Hit reply and tell me. One line is enough, and I read every reply myself.</p><p>Or, if you're ready:</p>`,
      { href: `${SITE}${product(b.product).page}`, label: 'Book my call' })
  })
};
Object.assign(TEMPLATES, { abandon_1: RECOVER.abandon_1, abandon_2: RECOVER.abandon_2, abandon_3: RECOVER.abandon_3 });

// Timing test: each person is put in group A (first email after ~5 minutes) or B (~15 minutes), fixed by their id.
export const abGroup = (key) => { let h = 0; for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 2 ? 'B' : 'A'; };
export const AB_MINUTES = { A: 5, B: 15 };

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
  abandon_1: 'Unfinished payment (5 or 15 min)', abandon_2: 'Unfinished payment (12 hours)', abandon_3: 'Personal note (2 days)', form_1: 'Unfinished form (5 or 15 min)', form_2: 'Unfinished form (12 hours)', form_3: 'Personal note (2 days)'
};

// Sends samples to any address, for checking the emails look right. kind 'all' sends every email in order.
const TEST_SET = [
  ['abandon_1', 'consult', 'Left at payment, first follow-up'], ['abandon_2', 'consult', 'Left at payment, after 12 hours'], ['abandon_3', 'consult', 'Left at payment, after 2 days'],
  ['form_1', 'chat', 'Left the form, first follow-up'], ['form_2', 'chat', 'Left the form, after 12 hours'], ['form_3', 'chat', 'Left the form, after 2 days'],
  ['paid', 'consult', 'Paid (consultation)'], ['scheduled', 'consult', 'Time picked (consultation)'], ['scheduled', 'chat', 'Time picked (chat)'],
  ['remind_day', 'consult', 'Day before the call'], ['remind_morning', 'consult', 'Morning of the call'],
  ['after_call', 'consult', 'After the call (consultation)'], ['after_call', 'chat', 'After the call (chat)'],
  ['review', 'consult', 'Review request'], ['support_ending', 'consult', '30-day check-in']
];
export async function sendTest(to, kind = 'all') {
  if (!emailsOn()) return { ok: false, error: 'RESEND_API_KEY is not set' };
  const list = kind === 'all' ? TEST_SET : [[kind, 'consult', kind]];
  let n = 0;
  for (const [k, prod, label] of list) {
    const tpl = TEMPLATES[k] || RECOVER[k];
    const fake = { id: 'kc_00000000000000000000', name: 'Test', email: to, product: prod, call_at: new Date(Date.now() + 864e5), call_done_at: new Date(),
      notes: 'Topics: Ads stopped working, Cost per sale is too high', topics: 'Pricing, Running ads' };
    const { subject, html } = tpl(fake);
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject: `[Test ${++n}/${list.length}: ${label}] ${subject}`, html })
    });
    if (!r.ok) return { ok: false, error: `Sent ${n - 1}, then Resend said: ` + (await r.text()).slice(0, 200) };
    await new Promise((res) => setTimeout(res, 700)); // Resend's free plan allows about 2 emails a second
  }
  return { ok: true, sent: n };
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

// Welcome emails for people who leave their email in the homepage popup, one per answer.
const unsubFoot = (vid) => `<p style="margin:22px 0 0;font-size:12px;color:#5A5C80">You got this because you left your email on kokochidozie.com. <a href="${SITE}/api/unsubscribe?u=${encodeURIComponent(vid)}" style="color:#5A5C80">Unsubscribe</a></p>`;
export const WELCOME = {
  brand: () => ({
    subject: 'You run a brand. Good. 👋',
    html: wrap(`<p>Hi there,</p><p>Thanks for saying hi on my site.</p><p>Since you run a brand, here's what you'll get from me now and then: what I'm testing in ads, email and SEO for brands like Mofe and Smileys, and what's actually working right now.</p><p>If your ads have gone quiet lately, my free tools are a good place to start.</p>`,
      { href: `${SITE}/#tools`, label: 'See my free tools' })
      .replace('<p style="margin:28px 0 0">Koko</p>', '<p style="margin:0">And if you ever want a second pair of eyes on your brand, just reply. I read every one.</p><p style="margin:28px 0 0">Koko</p>')
  }),
  marketer: () => ({
    subject: 'Ah, one of us 👀',
    html: wrap(`<p>Hi there,</p><p>Thanks for stopping by.</p><p>Since you do marketing too, you'll get the behind-the-scenes stuff: the tests I'm running, what moved the numbers, and what didn't.</p><p>Reply and tell me what you're working on right now. I'm always keen to compare notes.</p>`)
  }),
  building: () => ({
    subject: 'So, what are you building?',
    html: wrap(`<p>Hi there,</p><p>You said you're building something. I love that.</p><p>I build my own things too, like First Time Renter Guide, and I'll share what I learn growing them: what worked, what flopped, and what I'd do differently.</p><p>Reply and tell me what you're building. I'm genuinely curious.</p>`,
      { href: `${SITE}/#building`, label: "See what I'm building" })
  }),
  nosy: () => ({
    subject: 'Nosy is a good trait',
    html: wrap(`<p>Hi there,</p><p>You said you were just being nosy. Respect. It's how I learn most things too.</p><p>Every now and then I'll send what I'm testing, building and learning. Short, useful, no fluff.</p><p>Here's a good place to start:</p>`,
      { href: `${SITE}/#building`, label: "See what I'm building" })
  })
};
export async function sendWelcome(vid) {
  if (!emailsOn()) return false;
  const claimed = await sql`UPDATE kc_popup SET welcome_at = now() WHERE vid = ${vid} AND welcome_at IS NULL AND email IS NOT NULL AND unsubscribed_at IS NULL RETURNING *`;
  const p = claimed[0];
  if (!p) return false;
  const { subject, html } = (WELCOME[p.answer] || WELCOME.nosy)();
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [p.email], reply_to: REPLY_TO, subject, html: html.replace('</div></body>', unsubFoot(vid) + '</div></body>'),
        headers: { 'List-Unsubscribe': `<${SITE}/api/unsubscribe?u=${encodeURIComponent(vid)}>` } })
    });
    if (!r.ok) throw new Error('resend ' + r.status);
    return true;
  } catch (e) {
    console.error('welcome failed', vid, e.message);
    await sql`UPDATE kc_popup SET welcome_at = NULL WHERE vid = ${vid}`;
    return false;
  }
}
