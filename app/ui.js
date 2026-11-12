(function () {
  'use strict';

  var L = window.Logic;
  var C = window.Content;
  var screen = document.getElementById('screen');
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var synth = window.speechSynthesis || null;
  var GOAL = 2; // tests per day

  // ---------- storage (always try/catch, in-memory fallback) ----------
  var mem = {};
  var store = {
    get: function (k) {
      try {
        var v = window.localStorage.getItem('spk_' + k);
        if (v !== null) return v;
      } catch (e) {}
      return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
    },
    set: function (k, v) {
      mem[k] = String(v);
      try { window.localStorage.setItem('spk_' + k, String(v)); } catch (e) {}
    }
  };
  function num(k) { return parseInt(store.get(k) || '0', 10) || 0; }

  // ---------- helpers ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function on(id, fn) { var el = $(id); if (el) el.addEventListener('click', fn); }
  function show(html) { screen.innerHTML = html; window.scrollTo(0, 0); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateLabel(d) {
    try { return d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }); }
    catch (e) { return L.dateKey(d); }
  }
  function mmss(sec) {
    sec = Math.max(0, Math.ceil(sec));
    return Math.floor(sec / 60) + ':' + pad(sec % 60);
  }
  function flow(on_) { document.body.classList.toggle('in-flow', !!on_); }
  var LEVEL_TR = { easy: 'Kolay', medium: 'Orta', hard: 'Zor' };
  var DAY_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

  // ---------- state ----------
  var today = new Date();
  var daily = L.pickDaily(C.DAILY, today);
  var ids = C.TESTS.map(function (t) { return t.id; });
  var level = store.get('level');
  if (C.LEVELS.indexOf(level) === -1) level = 'medium';
  var testId = L.pickTest(ids, store.get('lastTest'));
  store.set('lastTest', testId);

  var run = null;
  var cdTimer = null;

  function currentTest() {
    return C.TESTS.filter(function (t) { return t.id === testId; })[0];
  }
  function currentBuild() { return currentTest().build(daily, level); }

  // ---------- progress ----------
  function streakInfo() {
    var last = store.get('streakLast');
    var n = num('streak');
    var now = new Date();
    var y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (last === L.dateKey(now) || last === L.dateKey(y)) return n;
    return 0;
  }
  function todayCount() {
    var tc = store.get('tc');
    if (!tc) return 0;
    var p = tc.split(':');
    return p[0] === L.dateKey(new Date()) ? (parseInt(p[1], 10) || 0) : 0;
  }
  function recordDone(words) {
    var now = new Date();
    var key = L.dateKey(now);
    var last = store.get('streakLast');
    var n = num('streak');
    if (last !== key) {
      var y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      n = last === L.dateKey(y) ? n + 1 : 1;
      store.set('streak', n);
      store.set('streakLast', key);
    }
    store.set('days', L.addDay(store.get('days'), key));
    store.set('tc', key + ':' + (todayCount() + 1));
    store.set('words', num('words') + words);
    store.set('done', num('done') + 1);
  }
  function paintPill() {
    var el = $('streakPill');
    if (!el) return;
    var n = streakInfo();
    el.textContent = '🔥 ' + n;
    el.setAttribute('aria-label', n + ' günlük seri');
  }
  function weekHtml() {
    var keys = L.weekKeys(new Date());
    var done = (store.get('days') || '').split(',');
    var tk = L.dateKey(new Date());
    return '<div class="week">' + keys.map(function (k, i) {
      var cls = done.indexOf(k) !== -1 ? 'done' : (k === tk ? 'today' : (k > tk ? 'future' : ''));
      if (k === tk && cls === 'done') cls = 'done today';
      return '<div><div class="day">' + DAY_TR[i] + '</div><div class="dot ' + cls + '">' + (done.indexOf(k) !== -1 ? '✓' : '') + '</div></div>';
    }).join('') + '</div>';
  }
  function ringHtml(n, goal) {
    var r = 36;
    var c = 2 * Math.PI * r;
    var frac = Math.min(1, n / goal);
    return '<svg class="ring" viewBox="0 0 90 90" role="img" aria-label="Günlük hedef ' + Math.min(n, goal) + '/' + goal + '">' +
      '<circle class="bg" cx="45" cy="45" r="' + r + '" fill="none" stroke-width="10"></circle>' +
      '<circle class="fg" cx="45" cy="45" r="' + r + '" fill="none" stroke-width="10" stroke-linecap="round" ' +
      'stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - frac)).toFixed(1) + '" transform="rotate(-90 45 45)"></circle>' +
      '<text x="45" y="53" text-anchor="middle">' + Math.min(n, goal) + '/' + goal + '</text></svg>';
  }

  // ---------- cleanup ----------
  function stopAll() {
    if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
    if (run) {
      run.done = true;
      if (run.timer) clearInterval(run.timer);
      if (run.rec) { try { run.rec.onend = null; run.rec.abort(); } catch (e) {} }
      run = null;
    }
    if (synth) { try { synth.cancel(); } catch (e) {} }
  }

  function setTab(name) {
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('on', tabs[i].getAttribute('data-tab') === name);
    }
  }

  // ---------- screens ----------
  function home() {
    stopAll();
    flow(false);
    setTab('today');
    paintPill();
    var chips = daily.words.map(function (w) { return '<span class="chip">' + esc(w) + '</span>'; }).join('');
    var levels = C.LEVELS.map(function (l) {
      return '<button data-level="' + l + '" class="' + (l === level ? 'on' : '') + '" aria-pressed="' + (l === level) + '">' + LEVEL_TR[l] + '</button>';
    }).join('');
    var n = todayCount();
    var goalText = n >= GOAL ? 'Hedef tamam! 🎉' : (GOAL - n) + ' test daha yap';
    var notice = SR ? '' :
      '<div class="notice">Tarayıcın konuşma tanımayı desteklemiyor. Chrome veya Edge ile konuşarak pratik yapabilirsin. Şimdilik cevabını yazarak verebilirsin.</div>';
    show(
      '<section class="hero">' +
        '<p class="eyebrow">Günün konusu · ' + esc(dateLabel(today)) + '</p>' +
        '<span class="emoji" aria-hidden="true">' + daily.emoji + '</span>' +
        '<h1>' + esc(daily.themeTr) + '</h1>' +
        '<p class="sub">' + esc(daily.theme) + '</p>' +
        '<button class="btn-sun" id="go">Bugünkü testi başlat</button>' +
      '</section>' +
      notice +
      '<section class="card goal">' + ringHtml(n, GOAL) +
        '<div><b>Günlük hedef</b><span>' + goalText + '</span></div></section>' +
      '<section class="card"><h2>Bu hafta</h2>' + weekHtml() + '</section>' +
      '<section class="card"><h2>Bugünün hedef kelimeleri</h2><div class="chips">' + chips + '</div></section>' +
      '<section class="card"><h2>Seviye</h2><div class="seg" role="group" aria-label="Seviye">' + levels + '</div></section>'
    );
    var btns = screen.querySelectorAll('[data-level]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function (e) {
        level = e.currentTarget.getAttribute('data-level');
        store.set('level', level);
        home();
      });
    }
    on('go', card);
  }

  function progress() {
    stopAll();
    flow(false);
    setTab('progress');
    paintPill();
    show(
      '<h1>İlerleme</h1><p class="sub">Küçük adımlar, büyük fark.</p>' +
      '<div class="stats">' +
        '<div class="stat"><b>' + streakInfo() + '</b><span>gün seri</span></div>' +
        '<div class="stat"><b>' + num('done') + '</b><span>tamamlanan test</span></div>' +
        '<div class="stat"><b>' + num('words') + '</b><span>söylenen kelime</span></div>' +
        '<div class="stat"><b>' + todayCount() + '/' + GOAL + '</b><span>bugünkü hedef</span></div>' +
      '</div>' +
      '<section class="card"><h2>Bu hafta</h2>' + weekHtml() + '</section>'
    );
  }

  function card() {
    stopAll();
    flow(true);
    var t = currentTest();
    var b = currentBuild();
    show(
      '<p class="eyebrow">Bugünkü test</p>' +
      '<h1>' + esc(t.titleTr) + '</h1>' +
      '<p class="meta">' + LEVEL_TR[level] + ' · ' + b.seconds + ' sn</p>' +
      '<section class="card">' +
        '<p class="prompt">' + esc(b.promptEn) + '</p>' +
        '<p class="hint">💡 ' + esc(b.hintTr) + '</p>' +
      '</section>' +
      '<button class="primary" id="start">Başla</button>' +
      '<div class="row"><button class="ghost" id="other">Başka test</button><button class="ghost" id="back">Geri</button></div>'
    );
    on('start', countdown);
    on('other', function () {
      testId = L.pickTest(ids, testId);
      store.set('lastTest', testId);
      card();
    });
    on('back', home);
  }

  function countdown() {
    stopAll();
    flow(true);
    var n = 3;
    show('<div class="center"><p class="eyebrow">Hazır ol</p><div class="count" id="cnt">' + n + '</div></div>');
    cdTimer = setInterval(function () {
      n--;
      if (n <= 0) {
        clearInterval(cdTimer);
        cdTimer = null;
        var b = currentBuild();
        if (b.speakText) listen(b); else record(b);
      } else {
        var el = $('cnt');
        if (el) el.textContent = n;
      }
    }, 1000);
  }

  function listen(b) {
    show(
      '<p class="eyebrow">Dinle</p>' +
      '<h1>Cümleyi dinle</h1>' +
      '<section class="card"><p class="prompt">' + esc(b.speakText) + '</p></section>' +
      '<div class="row"><button id="replay">🔊 Tekrar dinle</button></div>' +
      '<button class="primary" id="speak">Konuşmaya başla</button>'
    );
    function say() {
      if (!synth || !window.SpeechSynthesisUtterance) return;
      try {
        synth.cancel();
        var u = new window.SpeechSynthesisUtterance(b.speakText);
        u.lang = 'en-US';
        u.rate = 0.9;
        synth.speak(u);
      } catch (e) {}
    }
    on('replay', say);
    on('speak', function () { if (synth) { try { synth.cancel(); } catch (e) {} } record(b); });
    say();
  }

  function record(b) {
    run = {
      limit: b.seconds,
      startedAt: Date.now(),
      typed: !SR,
      base: '',
      final: '',
      interim: '',
      done: false,
      rec: null,
      timer: null,
      build: b
    };
    var body = SR
      ? '<div class="transcript" id="tr" aria-live="polite"><span class="ghost">Konuşmaya başla, söylediklerin burada yazılır…</span></div>'
      : '<textarea id="typed" placeholder="Cevabını İngilizce yaz…" aria-label="Cevabın"></textarea>';
    show(
      '<p class="eyebrow">' + esc(currentTest().titleTr) + '</p>' +
      '<div class="timer" id="time">' + mmss(b.seconds) + '</div>' +
      '<div class="bar"><i id="fill"></i></div>' +
      '<p class="hint" style="margin-top:12px">' + esc(b.promptEn) + '</p>' +
      '<div id="note"></div>' +
      '<div id="body">' + body + '</div>' +
      '<button class="primary" id="finish">Bitir</button>'
    );
    on('finish', finish);
    if (SR) startRec();
    run.timer = setInterval(tick, 250);
  }

  function startRec() {
    var rec;
    try { rec = new SR(); } catch (e) { switchToTyped(); return; }
    run.rec = rec;
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = function (e) {
      var f = '';
      var i = '';
      for (var k = 0; k < e.results.length; k++) {
        var r = e.results[k];
        if (r.isFinal) f += r[0].transcript + ' '; else i += r[0].transcript;
      }
      if (run) { run.final = f; run.interim = i; paintTranscript(); }
    };
    rec.onerror = function (e) {
      if (!run) return;
      var code = e && e.error;
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture' || code === 'network') {
        switchToTyped(code);
      }
    };
    rec.onend = function () {
      if (!run || run.done || run.typed) return;
      run.base += run.final;
      run.final = '';
      run.interim = '';
      try { rec.start(); } catch (e) {}
    };
    try { rec.start(); } catch (e) { switchToTyped(); }
  }

  function liveText() {
    if (!run) return '';
    return (run.base + run.final + run.interim).trim();
  }

  function paintTranscript() {
    var el = $('tr');
    if (!el || !run) return;
    var t = liveText();
    el.textContent = t || 'Konuşmaya başla, söylediklerin burada yazılır…';
  }

  function switchToTyped(code) {
    if (!run || run.typed) return;
    var text = liveText();
    run.typed = true;
    if (run.rec) { try { run.rec.onend = null; run.rec.abort(); } catch (e) {} }
    var msg = code === 'not-allowed' || code === 'service-not-allowed'
      ? 'Mikrofon izni verilmedi. Cevabını yazarak verebilirsin.'
      : code === 'network'
        ? 'Konuşma tanıma için internet bağlantısı gerekiyor. Cevabını yazarak verebilirsin.'
        : 'Mikrofon kullanılamıyor. Cevabını yazarak verebilirsin.';
    var note = $('note');
    if (note) note.innerHTML = '<div class="notice">' + esc(msg) + '</div>';
    var body = $('body');
    if (body) {
      body.innerHTML = '<textarea id="typed" aria-label="Cevabın"></textarea>';
      var ta = $('typed');
      if (ta) ta.value = text;
    }
  }

  function tick() {
    if (!run || run.done) return;
    var elapsed = (Date.now() - run.startedAt) / 1000;
    var left = run.limit - elapsed;
    var t = $('time');
    var f = $('fill');
    if (t) t.textContent = mmss(left);
    if (f) f.style.width = Math.max(0, (left / run.limit) * 100) + '%';
    if (left <= 0) finish();
  }

  function finish() {
    if (!run || run.done) return;
    var r = run;
    r.done = true;
    if (r.timer) clearInterval(r.timer);
    var text;
    if (r.typed) {
      var ta = $('typed');
      text = ta ? ta.value : '';
    } else {
      text = liveText();
    }
    if (r.rec) { try { r.rec.onend = null; r.rec.abort(); } catch (e) {} }
    if (synth) { try { synth.cancel(); } catch (e) {} }
    var seconds = Math.min(r.limit, (Date.now() - r.startedAt) / 1000);
    var words = L.countWords(text);
    var hits = r.build.targets ? L.targetHits(text, r.build.targets) : null;
    run = null;
    if (words > 0) recordDone(words);
    result({
      text: text.trim(),
      seconds: seconds,
      words: words,
      wpm: r.typed ? null : L.wordsPerMinute(words, seconds),
      typed: r.typed,
      hits: hits
    });
  }

  function confetti() {
    var wrap = document.createElement('div');
    wrap.className = 'confetti';
    wrap.setAttribute('aria-hidden', 'true');
    var bits = ['🎉', '⭐', '✨', '🟠', '🟣', '🟡'];
    for (var i = 0; i < 16; i++) {
      var s = document.createElement('span');
      s.textContent = bits[i % bits.length];
      s.style.left = (Math.random() * 96) + '%';
      s.style.animationDelay = (Math.random() * 0.8) + 's';
      wrap.appendChild(s);
    }
    document.body.appendChild(wrap);
    setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 4000);
  }

  function result(s) {
    flow(true);
    paintPill();
    var hitsHtml = '';
    if (s.hits) {
      hitsHtml = '<section class="card"><h2>Hedef kelimeler (' + s.hits.hit.length + '/' + (s.hits.hit.length + s.hits.missed.length) + ')</h2><div class="chips">' +
        s.hits.hit.map(function (w) { return '<span class="chip hit">✓ ' + esc(w) + '</span>'; }).join('') +
        s.hits.missed.map(function (w) { return '<span class="chip miss">✗ ' + esc(w) + '</span>'; }).join('') +
        '</div></section>';
    }
    var body;
    if (s.words === 0) {
      body =
        '<section class="card"><p class="empty">Hiç konuşma algılanmadı. Mikrofona biraz yaklaşıp tekrar dene; istersen cevabını yazarak da verebilirsin.</p></section>';
    } else {
      body =
        '<div class="result-grid">' +
          '<div class="stat"><b>' + Math.round(s.seconds) + '</b><span>saniye</span></div>' +
          '<div class="stat"><b>' + s.words + '</b><span>kelime</span></div>' +
          '<div class="stat"><b>' + (s.wpm === null ? '–' : s.wpm) + '</b><span>kelime/dk</span></div>' +
        '</div>' +
        hitsHtml +
        '<section class="card"><h2>' + (s.typed ? 'Yazdığın' : 'Duyduğumuz') + '</h2><p>' + esc(s.text) + '</p></section>';
    }
    show(
      '<p class="eyebrow">Sonuç</p>' +
      '<h1>' + (s.words === 0 ? 'Bu sefer olmadı' : 'Aferin, bitirdin!') + '</h1>' +
      body +
      '<button class="primary" id="again">Tekrar dene</button>' +
      '<div class="row"><button id="next">Başka test</button><button class="ghost" id="home">Ana sayfa</button></div>'
    );
    if (s.words > 0) confetti();
    on('again', card);
    on('next', function () {
      testId = L.pickTest(ids, testId);
      store.set('lastTest', testId);
      card();
    });
    on('home', home);
  }

  // ---------- tabs ----------
  var tabBtns = document.querySelectorAll('.tab');
  for (var ti = 0; ti < tabBtns.length; ti++) {
    tabBtns[ti].addEventListener('click', function (e) {
      var name = e.currentTarget.getAttribute('data-tab');
      if (name === 'progress') progress(); else home();
    });
  }

  home();
})();
