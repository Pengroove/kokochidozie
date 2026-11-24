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
})();
