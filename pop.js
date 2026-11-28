(function () {
  var KEY = 'kc_pop';
  var WAIT = 14 * 864e5;
  // Anyone who has given their email never sees it again. Everyone else can see it again after 14 days.
  try {
    var prev = localStorage.getItem(KEY) || '';
    if (prev.indexOf('email') === 0) return;
    var t = +prev.split('|')[1];
    if (t && Date.now() - t < WAIT) return;
  } catch (e) { return; }
  var css = '.kpb{position:fixed;inset:0;z-index:60;background:rgba(23,24,59,.35);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .25s}' +
    '.kpb.on{opacity:1}' +
    '.kp{position:relative;width:340px;max-width:100%;background:#fff;color:#17183B;border:2px solid #17183B;border-radius:18px;box-shadow:6px 6px 0 #17183B;padding:20px;font-family:Figtree,system-ui,sans-serif;transform:scale(.85) translateY(10px);transition:transform .45s cubic-bezier(.2,1.4,.4,1)}' +
    '.kpb.on .kp{transform:none}' +
    '.kp .kx{position:absolute;top:8px;right:8px;width:34px;height:34px;border:0;background:none;color:#17183B;font-size:22px;line-height:1;cursor:pointer;border-radius:50%}' +
    '.kp .kx:hover{background:#BFE1FF}' +
    '.kp .tg{display:inline-block;background:#DDF56B;border:2px solid #17183B;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:800;margin:0 0 10px}' +
    '.kp h3{font-size:22px;font-weight:800;line-height:1.2;margin:0 28px 4px 0}' +
    '.kp p{font-size:14px;line-height:1.5;margin:0 0 14px;color:#3B3D66}' +
    '.kp .ch{display:block;width:100%;text-align:left;background:#fff;border:2px solid #17183B;border-radius:12px;padding:10px 13px;margin:0 0 8px;font:700 15px Figtree,system-ui,sans-serif;color:#17183B;cursor:pointer;transition:transform .15s,box-shadow .15s,background .15s}' +
    '.kp .ch:hover{transform:translate(-2px,-2px);box-shadow:3px 3px 0 #17183B;background:#DDF56B}' +
    '.kp input{width:100%;box-sizing:border-box;height:46px;border:2px solid #17183B;border-radius:12px;padding:0 12px;font:16px Figtree,system-ui,sans-serif;color:#17183B;margin:0 0 6px}' +
    '.kp .er{font-size:13px;color:#C0262D;min-height:18px;margin:0 0 6px}' +
    '.kp .row{display:flex;align-items:center;gap:14px}' +
    '.kp .go{background:#FF8AD0;border:2px solid #17183B;border-radius:999px;padding:10px 20px;font:800 15px Figtree,system-ui,sans-serif;color:#17183B;cursor:pointer;box-shadow:3px 3px 0 #17183B}' +
    '.kp .sk{border:0;background:none;font:14px Figtree,system-ui,sans-serif;color:#3B3D66;text-decoration:underline;cursor:pointer;padding:6px 0}' +
    '.kp .st{display:none}.kp .st.on{display:block;animation:kpin .35s ease}' +
    '@keyframes kpin{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
    '@media (max-width:560px){.kp{width:300px;padding:16px}.kp h3{font-size:19px}.kp p{font-size:13px;margin-bottom:12px}.kp .ch{font-size:14px;padding:9px 12px;margin-bottom:7px}.kp .tg{margin-bottom:8px}}' +
    '@media (prefers-reduced-motion:reduce){.kpb,.kp,.kp .st.on{transition:none;animation:none}}';
  var R = { brand: 'Love that. Brands are my favourite people.', marketer: 'Ah, one of us.', building: "Nice. I'm always building something too.", nosy: 'Respect. Nosy is how I learn too.' };
  var shown = false, box, wrap;
  function vid() { return window.kcVid || (function () { try { return localStorage.getItem('kc_vid'); } catch (e) { return ''; } })(); }
  function src() { try { return JSON.parse(localStorage.getItem('kc_src') || '{}').s || ''; } catch (e) { return ''; } }
  function send(body) {
    body.vid = vid(); body.source = src();
    if (!body.vid) return Promise.resolve({});
    return fetch('/api/popup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).then(function (r) { return r.json(); }).catch(function () { return {}; });
  }
  function done(v) { try { if ((localStorage.getItem(KEY) || '').indexOf('email') !== 0) localStorage.setItem(KEY, v + '|' + Date.now()); } catch (e) {} }
  function step(n) { [].forEach.call(box.querySelectorAll('.st'), function (s) { s.classList.toggle('on', s.getAttribute('data-s') === n); }); }
  function close() { wrap.classList.remove('on'); removeEventListener('keydown', esc); setTimeout(function () { wrap.remove(); }, 300); }
  function esc(e) { if (e.key === 'Escape') { done('closed'); close(); } }
  function build() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    wrap = document.createElement('div'); wrap.className = 'kpb';
    box = document.createElement('div'); box.className = 'kp'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Quick question');
    box.innerHTML = '<button class="kx" aria-label="Close">&times;</button>' +
      '<div class="st on" data-s="1"><span class="tg">Quick one</span><h3>Who\'s this reading?</h3><p>I like knowing who stops by. Pick the closest one.</p>' +
      '<button class="ch" data-a="brand">I run a brand</button><button class="ch" data-a="marketer">I do marketing too</button><button class="ch" data-a="building">I\'m building something</button><button class="ch" data-a="nosy">Honestly, just being nosy</button></div>' +
      '<form class="st" data-s="2" novalidate><h3 class="rp"></h3><p>Every now and then I share what I\'m testing, building and learning. Want it in your inbox?</p>' +
      '<input type="email" name="email" autocomplete="email" placeholder="you@email.com" aria-label="Your email"><div class="er" aria-live="polite"></div>' +
      '<div class="row"><button class="go" type="submit">I\'m in</button><button class="sk" type="button">Maybe later</button></div></form>' +
      '<div class="st" data-s="3"><h3>You\'re in.</h3><p>Thanks for saying hi. Carry on looking around.</p><button class="go" type="button">Back to the site</button></div>';
    wrap.appendChild(box); document.body.appendChild(wrap);
    wrap.onclick = function (e) { if (e.target === wrap) { done('closed'); close(); } };
    addEventListener('keydown', esc);
    box.querySelector('.kx').onclick = function () { done('closed'); close(); };
    [].forEach.call(box.querySelectorAll('.ch'), function (b) {
      b.onclick = function () { var a = b.getAttribute('data-a'); done('answered'); send({ step: 'answer', answer: a }); box.querySelector('.rp').textContent = R[a]; step('2'); };
    });
    var f = box.querySelector('form'), inp = f.querySelector('input'), er = f.querySelector('.er');
    inp.oninput = function () { er.textContent = ''; };
    f.querySelector('.sk').onclick = function () { close(); };
    f.onsubmit = function (e) {
      e.preventDefault();
      var v = inp.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { er.textContent = 'Enter a valid email first'; return; }
      done('email'); send({ step: 'email', email: v }); step('3');
    };
    box.querySelector('[data-s="3"] .go').onclick = close;
    requestAnimationFrame(function () { requestAnimationFrame(function () { wrap.classList.add('on'); }); });
    done('seen'); send({ step: 'seen' });
  }
  function check() {
    if (shown) return;
    var h = document.documentElement.scrollHeight - innerHeight;
    if (h > 0 && scrollY / h >= 0.30) { shown = true; removeEventListener('scroll', check); build(); }
  }
  addEventListener('scroll', check, { passive: true });
})();
