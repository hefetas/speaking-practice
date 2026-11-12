(function () {
  'use strict';

  var L = window.Logic;
  var C = window.Content;
  var screen = document.getElementById('screen');
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var synth = window.speechSynthesis || null;

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
  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dateLabel(d) {
    try { return d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }); }
    catch (e) { return dateKey(d); }
  }
  function mmss(sec) {
    sec = Math.max(0, Math.ceil(sec));
    return Math.floor(sec / 60) + ':' + pad(sec % 60);
  }
  var LEVEL_TR = { easy: 'Kolay', medium: 'Orta', hard: 'Zor' };

  // ---------- state ----------
  var today = new Date();
  var daily = L.pickDaily(C.DAILY, today);
  var ids = C.TESTS.map(function (t) { return t.id; });
  var level = store.get('level');
  if (C.LEVELS.indexOf(level) === -1) level = 'medium';
  var testId = L.pickTest(ids, store.get('lastTest'));
  store.set('lastTest', testId);

  var run = null;       // active recording session
  var cdTimer = null;   // countdown timer

  function currentTest() {
    return C.TESTS.filter(function (t) { return t.id === testId; })[0];
  }
  function currentBuild() { return currentTest().build(daily, level); }

  // ---------- streak and totals ----------
  function streakInfo() {
    var last = store.get('streakLast');
    var n = parseInt(store.get('streak') || '0', 10) || 0;
    var y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    if (last === dateKey(new Date()) || last === dateKey(y)) return n;
    return 0;
  }
  function recordDone() {
    var now = new Date();
    var key = dateKey(now);
    var last = store.get('streakLast');
    var n = parseInt(store.get('streak') || '0', 10) || 0;
    if (last !== key) {
      var y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      n = last === dateKey(y) ? n + 1 : 1;
      store.set('streak', n);
      store.set('streakLast', key);
    }
    store.set('done', (parseInt(store.get('done') || '0', 10) || 0) + 1);
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

  // ---------- screens ----------
  function home() {
    stopAll();
    var chips = daily.words.map(function (w) { return '<span class="chip">' + esc(w) + '</span>'; }).join('');
    var levels = C.LEVELS.map(function (l) {
      return '<button data-level="' + l + '" class="' + (l === level ? 'on' : '') + '" aria-pressed="' + (l === level) + '">' + LEVEL_TR[l] + '</button>';
    }).join('');
    var notice = SR ? '' :
      '<div class="notice">Tarayıcın konuşma tanımayı desteklemiyor. Chrome veya Edge ile konuşarak pratik yapabilirsin. Şimdilik cevabını yazarak verebilirsin.</div>';
    show(
      '<header>' +
        '<p class="eyebrow">Günün konusu · ' + esc(dateLabel(today)) + '</p>' +
        '<h1><span class="big">' + daily.emoji + '</span> ' + esc(daily.themeTr) + '</h1>' +
        '<p class="sub">' + esc(daily.theme) + '</p>' +
      '</header>' +
      '<section class="card"><h2>Bugünün hedef kelimeleri</h2><div class="chips">' + chips + '</div></section>' +
      '<section class="card"><h2>Seviye</h2><div class="seg" role="group" aria-label="Seviye">' + levels + '</div></section>' +
      '<div class="stats">' +
        '<div class="stat"><b>' + streakInfo() + '</b><span>gün seri</span></div>' +
        '<div class="stat"><b>' + (parseInt(store.get('done') || '0', 10) || 0) + '</b><span>tamamlanan test</span></div>' +
      '</div>' +
      notice +
      '<button class="primary" id="go">Bugünkü testi başlat</button>'
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

  function card() {
    stopAll();
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
    if (words > 0) recordDone();
    result({
      text: text.trim(),
      seconds: seconds,
      words: words,
      wpm: r.typed ? null : L.wordsPerMinute(words, seconds),
      typed: r.typed,
      hits: hits,
      speakText: r.build.speakText || null
    });
  }

  function result(s) {
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
    on('again', card);
    on('next', function () {
      testId = L.pickTest(ids, testId);
      store.set('lastTest', testId);
      card();
    });
    on('home', home);
  }

  home();
})();
