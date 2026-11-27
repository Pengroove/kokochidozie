(function () {
  var ls, v, p = new URLSearchParams(location.search);
  try {
    ls = window.localStorage; v = ls.getItem('kc_vid');
    if (!v) { v = Math.random().toString(36).slice(2) + Date.now().toString(36); ls.setItem('kc_vid', v); }
  } catch (e) { v = 'nv' + Math.random().toString(36).slice(2); }
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: true });
  }
  function src() { try { return JSON.parse(ls.getItem('kc_src') || '{}').s || ''; } catch (e) { return ''; } }

  // One visit record per page load, with where it came from.
  post('/api/track', { vid: v, path: location.pathname, ref: document.referrer, utm_source: p.get('utm_source'), utm_campaign: p.get('utm_campaign') })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || !d.source) return;
      // Credit the latest real source; a later direct visit doesn't wipe out where they first came from.
      try { if (d.source !== 'Direct' || !ls.getItem('kc_src')) ls.setItem('kc_src', JSON.stringify({ s: d.source, c: p.get('utm_campaign') || '' })); } catch (e) {}
    }).catch(function () {});

  // "Still here" pings so the admin can show who's live and what they're doing.
  var stage = window.KC_STAGE || 'browsing';
  function ping() {
    if (document.visibilityState !== 'visible') return;
    post('/api/live', { vid: v, path: location.pathname, stage: stage, source: src(), ref: document.referrer, utm_source: p.get('utm_source') }).catch(function () {});
  }
  window.kcStage = function (s) { if (s !== stage) { stage = s; ping(); } };
  window.kcVid = v;
  setTimeout(ping, 800);
  setInterval(ping, 30000);
  document.addEventListener('visibilitychange', ping);

  // How far they read, how long they stay, and what they click.
  if (location.pathname.indexOf('/admin') === 0) return;
  var maxPct = 0, deepest = '', secs = 0, order = [];
  function beacon(body) {
    body.vid = v; body.path = location.pathname;
    var s = JSON.stringify(body);
    try { if (navigator.sendBeacon && navigator.sendBeacon('/api/engage', s)) return; } catch (e) {}
    fetch('/api/engage', { method: 'POST', body: s, keepalive: true }).catch(function () {});
  }
  function measure() {
    var h = document.documentElement.scrollHeight - innerHeight;
    var pct = h > 0 ? Math.round(Math.min(1, Math.max(0, scrollY / h)) * 100) : 100;
    if (pct > maxPct) maxPct = pct;
  }
  addEventListener('scroll', measure, { passive: true });
  function watch() {
    order = [].slice.call(document.querySelectorAll('section[id], footer'));
    if (!('IntersectionObserver' in window) || !order.length) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var i = order.indexOf(e.target), cur = deepest ? order.findIndex(function (x) { return (x.id || 'footer') === deepest; }) : -1;
        if (i > cur) deepest = e.target.id || 'footer';
      });
    }, { threshold: 0.25 });
    order.forEach(function (el) { io.observe(el); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
  setInterval(function () { if (document.visibilityState === 'visible') secs += 5; }, 5000);
  var lastSent = '';
  function flush() {
    measure();
    var k = maxPct + '|' + deepest + '|' + secs;
    if (k === lastSent) return;
    lastSent = k;
    beacon({ max: maxPct, deepest: deepest, secs: secs });
  }
  setInterval(flush, 20000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
  addEventListener('pagehide', flush);
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('a, button');
    if (!t) return;
    var label = (t.getAttribute('aria-label') || t.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    var href = t.getAttribute('href') || '';
    if (href && /^https?:/.test(href) && t.host !== location.host) label += ' → ' + t.host.replace(/^www\./, '');
    if (!label) return;
    var sec = t.closest('.kp') ? 'popup' : (t.closest('section[id]') || {}).id || (t.closest('footer') ? 'footer' : (t.closest('header, nav') ? 'nav' : 'top'));
    beacon({ click: label, section: sec });
  }, true);
})();
