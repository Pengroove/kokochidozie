(function () {
  try {
    var ls = window.localStorage, k = 'kc_vid', v = ls.getItem(k);
    if (!v) { v = Math.random().toString(36).slice(2) + Date.now().toString(36); ls.setItem(k, v); }
    var p = new URLSearchParams(location.search);
    var body = { vid: v, path: location.pathname, ref: document.referrer, utm_source: p.get('utm_source'), utm_campaign: p.get('utm_campaign') };
    fetch('/api/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: true })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.source) return;
        // Credit the latest real source; a later direct visit doesn't wipe out where they first came from.
        if (d.source !== 'Direct' || !ls.getItem('kc_src')) ls.setItem('kc_src', JSON.stringify({ s: d.source, c: p.get('utm_campaign') || '' }));
      }).catch(function () {});
  } catch (e) {}
})();
