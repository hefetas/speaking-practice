(function () {
  'use strict';

  var L = window.Logic;
  var P = window.Progress;
  var A = window.Analysis;
  var C = window.Content;
  var screen = document.getElementById('screen');
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var synth = window.speechSynthesis || null;
  var CAN_RECORD = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
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
  function getJSON(k) {
    try { var v = store.get(k); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function setJSON(k, v) { store.set(k, JSON.stringify(v)); }

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
  function sign(n) { return n > 0 ? '▲ +' + n : (n < 0 ? '▼ ' + n : '＝ 0'); }
  function cls(n) { return n > 0 ? 'up' : (n < 0 ? 'down' : ''); }
  var LEVEL_TR = { easy: 'Kolay', medium: 'Orta', hard: 'Zor' };
  var DAY_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  var STAMPS = {
    free: ['🗣️', 'Serbest'], describe: ['🖼️', 'Betimleme'], opinion: ['⚖️', 'Görüş'],
    story: ['📖', 'Hikâye'], targets: ['🎯', 'Kelimeler'], roleplay: ['🎭', 'Rol'],
    repeat: ['🔁', 'Tekrar'], rapid: ['⚡', 'Hız'], shadow: ['👥', 'Gölge']
  };

  // ---------- state ----------
  var today = new Date();
  var daily = L.pickDaily(C.DAILY, today);
  var level = store.get('level');
  if (C.LEVELS.indexOf(level) === -1) level = 'medium';
  var mode = store.get('mode') === 'ielts' ? 'ielts' : 'daily';
  var testId = null;
  var ictx = null;
  var run = null;
  var cdTimer = null;
  var audioUrl = null;

  function tests() { return mode === 'ielts' ? C.IELTS_TESTS : C.TESTS; }
  function testIds() { return tests().map(function (t) { return t.id; }); }
  function pickIelts() {
    var n = C.IELTS.length;
    var last = parseInt(store.get('lastCard') || '-1', 10);
    var i = Math.floor(Math.random() * n);
    if (n > 1 && i === last) i = (i + 1) % n;
    store.set('lastCard', i);
    return { card: C.IELTS[i], i: Math.floor(Math.random() * 3) };
  }
  function pickNext() {
    testId = L.pickTest(testIds(), store.get('lastTest'));
    store.set('lastTest', testId);
    ictx = mode === 'ielts' ? pickIelts() : null;
  }
  function currentTest() {
    var t = tests().filter(function (x) { return x.id === testId; })[0];
    if (!t) { pickNext(); t = tests().filter(function (x) { return x.id === testId; })[0]; }
    return t;
  }
  function currentBuild() { return currentTest().build(daily, level, ictx); }
  pickNext();

  // ---------- progress state ----------
  function getStreak() { return { last: store.get('streakLast'), streak: num('streak'), freeze: num('freeze') }; }
  function stampList() { return (store.get('stamps') || '').split(',').filter(Boolean); }
  function getState() {
    return { done: num('done'), words: num('words'), bestStreak: num('bestStreak'), stamps: stampList(), weeksDone: num('weeksDone') };
  }
  function todayCount() {
    var tc = store.get('tc');
    if (!tc) return 0;
    var p = tc.split(':');
    return p[0] === L.dateKey(new Date()) ? (parseInt(p[1], 10) || 0) : 0;
  }
  function weekKey() { return L.weekKeys(new Date())[0]; }
  function currentWeek() {
    var wk = getJSON('wk');
    return wk && wk.key === weekKey() ? wk : P.emptyWeek(weekKey());
  }

  function paintPill() {
    var el = $('streakPill');
    if (!el) return;
    var s = getStreak();
    var n = P.streakAlive(s, L.dateKey(new Date()));
    el.textContent = '🔥 ' + n + (s.freeze > 0 ? '  ❄️ ' + s.freeze : '');
    el.setAttribute('aria-label', n + ' günlük seri' + (s.freeze > 0 ? ', ' + s.freeze + ' seri dondurma hakkı' : ''));
  }

  // Records a finished test and returns what to celebrate.
  function commit(r) {
    var info = { xp: 0, bonus: 0, newBadges: [], usedFreeze: false, rankUp: null, challenge: null };
    if (!(r.words > 0)) return info;
    var now = new Date();
    var key = L.dateKey(now);
    var xpBefore = num('xp');
    var earnedBefore = {};
    P.badgesFor(getState()).forEach(function (b) { if (b.earned) earnedBefore[b.id] = true; });

    var st = P.nextStreak(getStreak(), key);
    store.set('streak', st.streak);
    store.set('streakLast', st.last);
    store.set('freeze', st.freeze);
    if (st.streak > num('bestStreak')) store.set('bestStreak', st.streak);
    info.usedFreeze = st.used;

    var stamps = stampList();
    if (stamps.indexOf(testId) === -1) { stamps.push(testId); store.set('stamps', stamps.join(',')); }
    store.set('days', L.addDay(store.get('days'), key));
    store.set('tc', key + ':' + (todayCount() + 1));
    store.set('words', num('words') + r.words);
    store.set('done', num('done') + 1);

    var wk = P.updateWeek(getJSON('wk'), weekKey(), { type: testId, words: r.words, dayKey: key });
    var ch = P.challengeFor(weekKey());
    var claim = P.claimWeek(ch, wk);
    if (claim.bonus) {
      info.bonus = claim.bonus;
      info.challenge = ch;
      store.set('weeksDone', num('weeksDone') + 1);
    }
    setJSON('wk', claim.wk);

    info.xp = P.xpFor({ words: r.words, hits: r.hitCount });
    var total = xpBefore + info.xp + info.bonus;
    store.set('xp', total);
    if (P.rankFor(total).index > P.rankFor(xpBefore).index) info.rankUp = P.rankFor(total).title;

    info.newBadges = P.badgesFor(getState()).filter(function (b) { return b.earned && !earnedBefore[b.id]; });
    return info;
  }

  // ---------- small renderers ----------
  function weekHtml() {
    var keys = L.weekKeys(new Date());
    var done = (store.get('days') || '').split(',');
    var tk = L.dateKey(new Date());
    return '<div class="week">' + keys.map(function (k, i) {
      var isDone = done.indexOf(k) !== -1;
      var c = isDone ? 'done' : (k === tk ? 'today' : (k > tk ? 'future' : ''));
      if (k === tk && isDone) c = 'done today';
      return '<div><div class="day">' + DAY_TR[i] + '</div><div class="dot ' + c + '">' + (isDone ? '✓' : '') + '</div></div>';
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
  function rankHtml() {
    var xp = num('xp');
    var r = P.rankFor(xp);
    var hint = r.next ? 'Sonraki rütbe: ' + esc(r.next) + ' · ' + (r.xpNeeded - r.xpInto) + ' XP kaldı' : 'En yüksek rütbedesin 👑';
    return '<section class="card"><h2>Rütben</h2>' +
      '<div class="rankrow"><b>' + esc(r.title) + '</b><span>' + xp + ' XP</span></div>' +
      '<div class="bar slim gold"><i style="width:' + Math.round(r.frac * 100) + '%"></i></div>' +
      '<p class="hint" style="margin-top:8px">' + hint + '</p></section>';
  }
  function challengeHtml() {
    var wk = currentWeek();
    var ch = P.challengeFor(weekKey());
    var n = P.challengeProgress(ch, wk);
    var done = wk.claimed || n >= ch.target;
    return '<section class="card"><h2>Haftanın görevi</h2>' +
      '<p class="chal-title">' + esc(ch.titleTr) + '</p>' +
      '<div class="bar slim mint"><i style="width:' + Math.round((n / ch.target) * 100) + '%"></i></div>' +
      '<p class="hint" style="margin-top:8px">' + (done ? 'Tamamlandı ✓ (+50 XP)' : n + '/' + ch.target) + '</p></section>';
  }

  // ---------- cleanup ----------
  function discardAudio(r) {
    var a = r && r.audio;
    if (!a) return;
    a.state = 'cancelled';
    try { if (a.mr && a.mr.state !== 'inactive') { a.mr.onstop = null; a.mr.stop(); } } catch (e) {}
    try { if (a.stream) a.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
  }
  function stopAll() {
    if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
    if (run) {
      run.done = true;
      if (run.timer) clearInterval(run.timer);
      if (run.rec) { try { run.rec.onend = null; run.rec.abort(); } catch (e) {} }
      discardAudio(run);
      run = null;
    }
    if (synth) { try { synth.cancel(); } catch (e) {} }
    if (audioUrl) { try { URL.revokeObjectURL(audioUrl); } catch (e) {} audioUrl = null; }
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
    var isI = mode === 'ielts';
    var chips = daily.words.map(function (w) { return '<span class="chip">' + esc(w) + '</span>'; }).join('');
    var levels = C.LEVELS.map(function (l) {
      return '<button data-level="' + l + '" class="' + (l === level ? 'on' : '') + '" aria-pressed="' + (l === level) + '">' + LEVEL_TR[l] + '</button>';
    }).join('');
    var n = todayCount();
    var goalText = n >= GOAL ? 'Hedef tamam! 🎉' : (GOAL - n) + ' test daha yap';
    var notice = SR ? '' :
      '<div class="notice">Tarayıcın konuşma tanımayı desteklemiyor. Chrome veya Edge ile konuşarak pratik yapabilirsin. Şimdilik cevabını yazarak verebilirsin.</div>';
    var hero = isI
      ? '<p class="eyebrow">Sınav modu</p><span class="emoji" aria-hidden="true">🎓</span><h1>IELTS Speaking</h1>' +
        '<p class="sub">Part 1, 2 ve 3 tarzı sorular · her seferinde farklı kart</p>' +
        '<button class="btn-sun" id="go">IELTS testi başlat</button>'
      : '<p class="eyebrow">Günün konusu · ' + esc(dateLabel(today)) + '</p><span class="emoji" aria-hidden="true">' + daily.emoji + '</span>' +
        '<h1>' + esc(daily.themeTr) + '</h1><p class="sub">' + esc(daily.theme) + '</p>' +
        '<button class="btn-sun" id="go">Bugünkü testi başlat</button>';
    show(
      '<section class="hero">' + hero + '</section>' +
      '<div class="seg two" role="group" aria-label="Mod" style="margin-top:14px">' +
        '<button data-mode="daily" class="' + (!isI ? 'on' : '') + '" aria-pressed="' + (!isI) + '">Günlük pratik</button>' +
        '<button data-mode="ielts" class="' + (isI ? 'on' : '') + '" aria-pressed="' + isI + '">IELTS Speaking</button>' +
      '</div>' +
      notice +
      '<section class="card goal">' + ringHtml(n, GOAL) +
        '<div><b>Günlük hedef</b><span>' + goalText + '</span></div></section>' +
      rankHtml() +
      challengeHtml() +
      '<section class="card"><h2>Bu hafta</h2>' + weekHtml() + '</section>' +
      (isI ? '' :
        '<section class="card"><h2>Bugünün hedef kelimeleri</h2><div class="chips">' + chips + '</div></section>' +
        '<section class="card"><h2>Seviye</h2><div class="seg" role="group" aria-label="Seviye">' + levels + '</div></section>')
    );
    var btns = screen.querySelectorAll('[data-level]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function (e) {
        level = e.currentTarget.getAttribute('data-level');
        store.set('level', level);
        home();
      });
    }
    var mbs = screen.querySelectorAll('[data-mode]');
    for (var j = 0; j < mbs.length; j++) {
      mbs[j].addEventListener('click', function (e) {
        mode = e.currentTarget.getAttribute('data-mode');
        store.set('mode', mode);
        pickNext();
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
    var got = stampList();
    var st = getStreak();
    var stamps = P.PASSPORT_IDS.map(function (id) {
      var s = STAMPS[id];
      return '<div class="stamp ' + (got.indexOf(id) !== -1 ? 'got' : '') + '"><span class="ico">' + s[0] + '</span>' + s[1] + '</div>';
    }).join('');
    var badges = P.badgesFor(getState()).map(function (b) {
      return '<div class="badge ' + (b.earned ? 'got' : 'lock') + '"><span class="ico">' + (b.earned ? b.emoji : '🔒') + '</span><div><b>' + esc(b.title) + '</b><span>' + esc(b.desc) + '</span></div></div>';
    }).join('');
    show(
      '<h1>İlerleme</h1><p class="sub">Küçük adımlar, büyük fark.</p>' +
      '<div class="stats">' +
        '<div class="stat"><b>' + P.streakAlive(st, L.dateKey(new Date())) + '</b><span>gün seri</span></div>' +
        '<div class="stat"><b>' + num('done') + '</b><span>tamamlanan test</span></div>' +
        '<div class="stat"><b>' + num('words') + '</b><span>söylenen kelime</span></div>' +
        '<div class="stat"><b>' + num('xp') + '</b><span>toplam XP</span></div>' +
      '</div>' +
      '<p class="hint">❄️ Seri dondurma hakkın: ' + st.freeze + ' · Her 7 günlük seride 1 hak kazanırsın (en fazla 2). Bir gün kaçırırsan otomatik kullanılır.</p>' +
      rankHtml() +
      challengeHtml() +
      '<section class="card"><h2>Konuşma pasaportu (' + P.PASSPORT_IDS.filter(function (id) { return got.indexOf(id) !== -1; }).length + '/9)</h2><div class="stamps">' + stamps + '</div></section>' +
      '<section class="card"><h2>Rozetler</h2><div class="badges">' + badges + '</div></section>' +
      '<section class="card"><h2>Bu hafta</h2>' + weekHtml() + '</section>'
    );
  }

  function card() {
    stopAll();
    flow(true);
    var t = currentTest();
    var b = currentBuild();
    var pts = b.points ? '<ul class="points">' + b.points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' : '';
    var extra = b.prepSeconds ? ' · ' + b.prepSeconds + ' sn hazırlık' : '';
    show(
      '<p class="eyebrow">' + (mode === 'ielts' ? 'IELTS Speaking' : 'Bugünkü test') + '</p>' +
      '<h1>' + esc(t.titleTr) + '</h1>' +
      '<p class="meta">' + (mode === 'ielts' ? '' : LEVEL_TR[level] + ' · ') + b.seconds + ' sn' + extra + '</p>' +
      '<section class="card">' +
        '<p class="prompt">' + esc(b.promptEn) + '</p>' + pts +
        '<p class="hint" style="margin-top:10px">💡 ' + esc(b.hintTr) + '</p>' +
      '</section>' +
      (CAN_RECORD
        ? '<label class="toggle"><input type="checkbox" id="audioToggle"' + (store.get('audio') === '1' ? ' checked' : '') + '> <span>🎧 Sesimi kaydet ve geri dinle <small>(deneysel)</small></span></label>'
        : '') +
      '<button class="primary" id="start">Başla</button>' +
      '<div class="row"><button class="ghost" id="other">Başka test</button><button class="ghost" id="back">Geri</button></div>'
    );
    var at = $('audioToggle');
    if (at) at.addEventListener('change', function () { store.set('audio', at.checked ? '1' : '0'); });
    on('start', countdown);
    on('other', function () { pickNext(); card(); });
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
        if (b.speakText) listen(b);
        else if (b.prepSeconds) prep(b);
        else record(b);
      } else {
        var el = $('cnt');
        if (el) el.textContent = n;
      }
    }, 1000);
  }

  function prep(b) {
    var started = Date.now();
    var went = false;
    var pts = (b.points || []).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('');
    show(
      '<p class="eyebrow">Hazırlık</p>' +
      '<div class="timer" id="ptime">' + mmss(b.prepSeconds) + '</div>' +
      '<section class="card"><p class="prompt">' + esc(b.promptEn) + '</p><p class="hint">You should say:</p><ul class="points">' + pts + '</ul></section>' +
      '<button class="primary" id="prepgo">Hazırım, konuşmaya başla</button>'
    );
    function go() {
      if (went) return;
      went = true;
      if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
      record(b);
    }
    on('prepgo', go);
    cdTimer = setInterval(function () {
      var left = b.prepSeconds - (Date.now() - started) / 1000;
      var el = $('ptime');
      if (el) el.textContent = mmss(left);
      if (left <= 0) go();
    }, 250);
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
      build: b,
      audio: null,
      ridx: -1,
      widx: -1,
      pspans: null
    };
    var body = SR
      ? '<div class="transcript" id="tr" aria-live="polite"><span class="ghost">Konuşmaya başla, söylediklerin burada yazılır…</span></div>'
      : '<textarea id="typed" placeholder="Cevabını İngilizce yaz…" aria-label="Cevabın"></textarea>';
    var top;
    if (b.prompts) {
      top = '<section class="card"><p class="rcount" id="rcount">1/' + b.prompts.length + '</p><p class="rapid-prompt" id="rprompt">' + esc(b.prompts[0]) + '</p></section>';
    } else if (b.passage) {
      top = '<section class="card"><p class="passage" id="passage">' +
        b.passage.split(/\s+/).map(function (w) { return '<span>' + esc(w) + '</span>'; }).join(' ') + '</p></section>';
    } else {
      var pts = b.points ? '<ul class="points">' + b.points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' : '';
      top = '<p class="hint" style="margin-top:12px">' + esc(b.promptEn) + '</p>' + pts;
    }
    show(
      '<p class="eyebrow">' + esc(currentTest().titleTr) + '</p>' +
      '<div class="timer" id="time">' + mmss(b.seconds) + '</div>' +
      '<div class="bar"><i id="fill"></i></div>' +
      top +
      '<div id="note"></div>' +
      '<div id="body">' + body + '</div>' +
      '<button class="primary" id="finish">Bitir</button>'
    );
    if (b.passage) run.pspans = screen.querySelectorAll('#passage span');
    on('finish', finish);
    if (SR) startRec();
    startAudio();
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

  // Optional on-device audio capture for playback (never uploaded).
  function startAudio() {
    if (store.get('audio') !== '1' || !CAN_RECORD || !run) return;
    var r = run;
    r.audio = { chunks: [], mr: null, stream: null, state: 'pending' };
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      if (run !== r || r.done || r.typed || r.audio.state === 'cancelled') {
        stream.getTracks().forEach(function (t) { t.stop(); });
        return;
      }
      var mr;
      try { mr = new window.MediaRecorder(stream); }
      catch (e) { stream.getTracks().forEach(function (t) { t.stop(); }); r.audio.state = 'failed'; return; }
      r.audio.stream = stream;
      r.audio.mr = mr;
      r.audio.state = 'recording';
      mr.ondataavailable = function (ev) { if (ev.data && ev.data.size) r.audio.chunks.push(ev.data); };
      mr.start();
    }).catch(function () { r.audio.state = 'failed'; });
  }

  function stopAudio(r, cb) {
    var a = r.audio;
    if (!a || a.state !== 'recording' || !a.mr) { if (a) a.state = 'cancelled'; cb(null); return; }
    var finished = false;
    function done(blob) {
      if (finished) return;
      finished = true;
      try { a.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      cb(blob);
    }
    a.mr.onstop = function () {
      done(a.chunks.length ? new Blob(a.chunks, { type: a.mr.mimeType || 'audio/webm' }) : null);
    };
    try { a.mr.stop(); } catch (e) { done(null); }
    setTimeout(function () { done(null); }, 1500);
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
    discardAudio(run);
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
    var b = run.build;
    if (b.prompts) {
      var ri = Math.min(b.prompts.length - 1, Math.floor(elapsed / b.roundSeconds));
      if (ri !== run.ridx) {
        run.ridx = ri;
        var rp = $('rprompt');
        var rc = $('rcount');
        if (rp) rp.textContent = b.prompts[ri];
        if (rc) rc.textContent = (ri + 1) + '/' + b.prompts.length;
      }
    }
    if (b.passage && run.pspans) {
      var wi = Math.floor(elapsed * b.passageWpm / 60);
      if (wi !== run.widx) {
        run.widx = wi;
        for (var k = 0; k < run.pspans.length; k++) {
          run.pspans[k].className = k < wi ? 'read' : (k === wi ? 'cur' : '');
        }
      }
    }
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
    run = null;
    stopAudio(r, function (blob) { finalize(r, text.trim(), seconds, blob); });
  }

  function finalize(r, text, seconds, blob) {
    var words = L.countWords(text);
    var an = A.analyze(text);
    var hits = r.build.targets ? L.targetHits(text, r.build.targets) : null;
    var wpm = r.typed ? null : L.wordsPerMinute(words, seconds);
    var cur = { words: words, wpm: wpm, unique: an.unique };
    var prev = getJSON('prev_' + testId);
    var cmp = words > 0 ? A.compare(prev, cur) : null;
    var info = commit({ words: words, hitCount: hits ? hits.hit.length : 0 });
    if (words > 0) setJSON('prev_' + testId, cur);
    if (blob) { try { audioUrl = URL.createObjectURL(blob); } catch (e) { audioUrl = null; } }
    result({
      text: text, seconds: seconds, words: words, wpm: wpm, typed: r.typed, hits: hits,
      an: an, cmp: cmp, hadPrev: !!prev, info: info, audioUrl: audioUrl,
      cov: r.build.passage ? A.coverage(text, r.build.passage) : null,
      title: currentTest().titleTr
    });
  }

  // ---------- share card ----------
  function siteUrl() { return window.location.href.split(/[?#]/)[0]; }
  function shareText(s) {
    return 'Bugün İngilizce konuşma pratiğinde ' + s.words + ' kelime konuştum 🎙️ Serim: ' +
      P.streakAlive(getStreak(), L.dateKey(new Date())) + ' gün. Sen de dene: ' + siteUrl();
  }
  function rrect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function drawCard(s) {
    var c = document.createElement('canvas');
    c.width = 1080;
    c.height = 1350;
    var g = c.getContext('2d');
    var bg = g.createLinearGradient(0, 0, 1080, 1350);
    bg.addColorStop(0, '#6d4cc9');
    bg.addColorStop(1, '#3b3fa8');
    g.fillStyle = bg;
    g.fillRect(0, 0, 1080, 1350);
    g.fillStyle = '#ff6b57';
    g.beginPath();
    g.arc(980, 100, 220, 0, Math.PI * 2);
    g.fill();
    var font = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    g.fillStyle = '#ffffff';
    g.font = '800 64px ' + font;
    g.fillText('🎙️ Konuş', 80, 150);
    g.font = '600 40px ' + font;
    g.fillStyle = '#e4e1ff';
    g.fillText('İngilizce Speaking Pratik', 80, 215);
    g.fillStyle = '#ffffff';
    g.font = '800 300px ' + font;
    g.fillText(String(s.words), 70, 640);
    g.font = '700 70px ' + font;
    g.fillText('kelime konuştum', 80, 735);
    var streak = P.streakAlive(getStreak(), L.dateKey(new Date()));
    var items = [
      [s.wpm == null ? '–' : String(s.wpm), 'kelime/dk'],
      ['🔥 ' + streak, 'gün seri'],
      [P.rankFor(num('xp')).title, 'rütbe']
    ];
    items.forEach(function (it, i) {
      var x = 80 + i * 300;
      g.fillStyle = 'rgba(255,255,255,0.16)';
      rrect(g, x, 820, 280, 190, 36);
      g.fill();
      g.fillStyle = '#ffffff';
      g.font = '800 54px ' + font;
      g.fillText(it[0], x + 24, 905);
      g.font = '600 32px ' + font;
      g.fillStyle = '#e4e1ff';
      g.fillText(it[1], x + 24, 965);
    });
    g.fillStyle = '#ffffff';
    g.font = '700 46px ' + font;
    g.fillText(s.title, 80, 1120);
    g.font = '500 36px ' + font;
    g.fillStyle = '#e4e1ff';
    g.fillText(siteUrl().replace(/^https?:\/\//, ''), 80, 1260);
    return c;
  }
  function cardBlob(s, cb) {
    try { drawCard(s).toBlob(function (b) { cb(b); }, 'image/png'); } catch (e) { cb(null); }
  }
  function note(msg) { var el = $('shareNote'); if (el) el.textContent = msg; }

  function wireShare(s) {
    on('copy', function () {
      var t = shareText(s);
      try {
        navigator.clipboard.writeText(t).then(function () { note('Metin kopyalandı ✓'); }, function () { note('Kopyalanamadı. Metni elle seçip kopyalayabilirsin: ' + t); });
      } catch (e) { note('Kopyalanamadı. Metni elle seçip kopyalayabilirsin: ' + t); }
    });
    on('dl', function () {
      cardBlob(s, function (blob) {
        if (!blob) { note('Resim oluşturulamadı.'); return; }
        try {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'konus-sonuc.png';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
          note('Resim indirildi ✓');
        } catch (e) { note('Bu ortamda indirme çalışmıyor. Metni kopyalamayı dene.'); }
      });
    });
    on('share', function () {
      cardBlob(s, function (blob) {
        try {
          if (blob && navigator.canShare && window.File) {
            var f = new File([blob], 'konus-sonuc.png', { type: 'image/png' });
            if (navigator.canShare({ files: [f] })) { navigator.share({ files: [f], text: shareText(s) }).catch(function () {}); return; }
          }
          if (navigator.share) { navigator.share({ text: shareText(s) }).catch(function () {}); return; }
        } catch (e) {}
        note('Bu tarayıcı paylaşımı desteklemiyor. Resmi indirebilir veya metni kopyalayabilirsin.');
      });
    });
  }

  function confetti() {
    var wrap = document.createElement('div');
    wrap.className = 'confetti';
    wrap.setAttribute('aria-hidden', 'true');
    var bits = ['🎉', '⭐', '✨', '🟠', '🟣', '🟡'];
    for (var i = 0; i < 16; i++) {
      var sp = document.createElement('span');
      sp.textContent = bits[i % bits.length];
      sp.style.left = (Math.random() * 96) + '%';
      sp.style.animationDelay = (Math.random() * 0.8) + 's';
      wrap.appendChild(sp);
    }
    document.body.appendChild(wrap);
    setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 4000);
  }

  // ---------- result ----------
  function analysisHtml(s) {
    var an = s.an;
    var f = an.fillers;
    var foundTxt = Object.keys(f.found).map(function (k) { return esc(k) + ' ×' + f.found[k]; }).join(', ');
    var pace = !s.typed && s.words >= 10 ? A.paceLabel(s.wpm) : null;
    var rep = an.repeated.map(function (x) { return esc(x.word) + ' ×' + x.n; }).join(', ');
    return '<section class="card analysis"><h2>Konuşma analizi</h2>' +
      '<p>🔤 <b>Farklı kelime:</b> ' + an.unique + ' / ' + an.words + ' (%' + an.ratio + ')</p>' +
      '<p>🧩 <b>Dolgu ifadeler:</b> ' + (f.count ? f.count + ' (' + foundTxt + ')' : 'Yok 👏') + '</p>' +
      (rep ? '<p>🔁 <b>Sık tekrar eden:</b> ' + rep + '</p>' : '') +
      (pace ? '<p>⏱️ <b>Tempo:</b> ' + pace + ' (' + s.wpm + ' kelime/dk)</p>' : '') +
      (s.cov != null ? '<p>🎯 <b>Okuma doğruluğu:</b> %' + s.cov + '</p>' : '') +
      '<small>Konuşma tanıma "um", "uh" gibi sesleri bazen yazıya dökmez; sonuçlar yaklaşıktır.</small></section>';
  }
  function compareHtml(s) {
    if (!s.cmp) {
      return '<section class="card"><h2>Geçen denemeyle kıyas</h2><p class="empty">İlk denemen! Aynı testi bir daha yaptığında burada farkı göreceksin.</p></section>';
    }
    var c = s.cmp;
    var chips = '<span class="chip"><span class="delta ' + cls(c.words) + '">' + sign(c.words) + '</span> kelime</span>' +
      '<span class="chip"><span class="delta ' + cls(c.unique) + '">' + sign(c.unique) + '</span> farklı kelime</span>';
    if (c.wpm !== null) chips += '<span class="chip"><span class="delta ' + cls(c.wpm) + '">' + sign(c.wpm) + '</span> kelime/dk</span>';
    return '<section class="card"><h2>Geçen denemeyle kıyas</h2><div class="chips">' + chips + '</div></section>';
  }
  function rewardsHtml(s) {
    var i = s.info;
    var h = '<div class="xp-banner"><b>+' + (i.xp + i.bonus) + ' XP</b><span>' + esc(P.rankFor(num('xp')).title) + ' · ' + num('xp') + ' XP</span></div>';
    if (i.rankUp) h += '<div class="alert">🎖️ Yeni rütbe: ' + esc(i.rankUp) + '</div>';
    i.newBadges.forEach(function (b) { h += '<div class="alert">' + b.emoji + ' Yeni rozet: ' + esc(b.title) + '</div>'; });
    if (i.challenge) h += '<div class="alert">⭐ Haftalık görev tamamlandı: ' + esc(i.challenge.titleTr) + ' (+50 XP)</div>';
    if (i.usedFreeze) h += '<div class="alert">❄️ Bir günü kaçırdın ama seri dondurma hakkın seriyi korudu.</div>';
    return h;
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
        rewardsHtml(s) +
        '<div class="result-grid">' +
          '<div class="stat"><b>' + Math.round(s.seconds) + '</b><span>saniye</span></div>' +
          '<div class="stat"><b>' + s.words + '</b><span>kelime</span></div>' +
          '<div class="stat"><b>' + (s.wpm === null ? '–' : s.wpm) + '</b><span>kelime/dk</span></div>' +
        '</div>' +
        analysisHtml(s) +
        compareHtml(s) +
        hitsHtml +
        '<section class="card"><h2>' + (s.typed ? 'Yazdığın' : 'Duyduğumuz') + '</h2><p>' + esc(s.text) + '</p>' +
          (s.audioUrl ? '<audio class="audio" id="replayAudio" controls src="' + esc(s.audioUrl) + '"></audio>' : '') +
        '</section>' +
        '<section class="card"><h2>Paylaş</h2>' +
          '<div class="row" style="margin-top:0"><button id="share">📤 Paylaş</button><button id="dl">🖼️ Resmi indir</button></div>' +
          '<div class="row"><button class="ghost" id="copy">📋 Metni kopyala</button></div>' +
          '<p class="hint" id="shareNote" style="margin-top:8px"></p></section>';
    }
    show(
      '<p class="eyebrow">Sonuç · ' + esc(s.title) + '</p>' +
      '<h1>' + (s.words === 0 ? 'Bu sefer olmadı' : 'Aferin, bitirdin!') + '</h1>' +
      body +
      '<button class="primary" id="again">Tekrar dene</button>' +
      '<div class="row"><button id="next">Başka test</button><button class="ghost" id="home">Ana sayfa</button></div>'
    );
    if (s.words > 0) { confetti(); wireShare(s); }
    on('again', card);
    on('next', function () { pickNext(); card(); });
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
