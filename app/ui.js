(function () {
  'use strict';

  var L = window.Logic;
  var P = window.Progress;
  var A = window.Analysis;
  var C = window.Content;
  var Ch = window.Challenge;
  var B = window.Backup;
  var N = window.Notebook;
  var ICS = window.Ics;
  var I = window.I18N;
  var Se = window.Series;
  var St = window.Stage;
  var G = window.Legal;
  var CFG = window.CONFIG || {};
  var screen = document.getElementById('screen');
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var synth = window.speechSynthesis || null;
  var CAN_RECORD = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  var GOAL = 2;
  var PREFIX = 'spk_';

  // ---------- storage (try/catch everywhere, in-memory fallback, nothing persisted before consent) ----------
  var mem = {};
  var persist = false;
  var store = {
    get: function (k) {
      try {
        var v = window.localStorage.getItem(PREFIX + k);
        if (v !== null) return v;
      } catch (e) {}
      return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
    },
    set: function (k, v) {
      mem[k] = String(v);
      if (!persist && k !== 'consent') return;
      try { window.localStorage.setItem(PREFIX + k, String(v)); } catch (e) {}
    },
    keys: function () {
      var out = Object.keys(mem);
      try {
        for (var i = 0; i < window.localStorage.length; i++) {
          var k = window.localStorage.key(i);
          if (k && k.indexOf(PREFIX) === 0 && out.indexOf(k.slice(PREFIX.length)) === -1) out.push(k.slice(PREFIX.length));
        }
      } catch (e) {}
      return out;
    },
    clear: function () {
      var ks = store.keys();
      mem = {};
      try { ks.forEach(function (k) { window.localStorage.removeItem(PREFIX + k); }); } catch (e) {}
    },
    flush: function () {
      Object.keys(mem).forEach(function (k) { try { window.localStorage.setItem(PREFIX + k, mem[k]); } catch (e) {} });
    }
  };
  function num(k) { return parseInt(store.get(k) || '0', 10) || 0; }
  function getJSON(k) {
    try { var v = store.get(k); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function setJSON(k, v) { store.set(k, JSON.stringify(v)); }

  // ---------- language ----------
  var lang = store.get('lang');
  if (lang !== 'tr' && lang !== 'en') lang = /^tr/i.test(navigator.language || '') ? 'tr' : 'en';
  function t(key, vars) { return I.t(lang, key, vars); }

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
  function dateFromKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function dateLabel(d) {
    try { return d.toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' }); }
    catch (e) { return L.dateKey(d); }
  }
  function mmss(sec) {
    sec = Math.max(0, Math.ceil(sec));
    return Math.floor(sec / 60) + ':' + pad(sec % 60);
  }
  function flow(v) {
    document.body.classList.toggle('in-flow', !!v);
    document.body.classList.remove('no-tabs');
  }
  function noTabs() { document.body.classList.add('no-tabs'); }
  function sign(n) { return n > 0 ? '▲ +' + n : (n < 0 ? '▼ ' + n : '＝ 0'); }
  function cls(n) { return n > 0 ? 'up' : (n < 0 ? 'down' : ''); }
  function rint(n) { return Math.floor(Math.random() * n); }
  function siteUrl() { return window.location.href.split(/[?#]/)[0]; }
  function lvlName(l) { return t('lvl_' + l); }
  function testTitle(id) { return I.testTitle(lang, id); }
  function hintFor(b, id) { return lang === 'tr' ? b.hintTr : I.testHint('en', id); }
  function themeMain(d) { return lang === 'tr' ? d.themeTr : d.theme; }

  var STAMP_EMOJI = {
    free: '🗣️', describe: '🖼️', opinion: '⚖️', story: '📖', targets: '🎯', roleplay: '🎭', repeat: '🔁',
    rapid: '⚡', shadow: '👥', twister: '🌀', pitch: '💼', scene: '🎬', pairs: '👂'
  };

  // ---------- state ----------
  var today = new Date();
  var daily = L.pickDaily(C.DAILY, today);
  var activeDaily = daily;
  var level = store.get('level');
  if (C.LEVELS.indexOf(level) === -1) level = 'medium';
  var mode = store.get('mode') === 'ielts' ? 'ielts' : 'daily';
  var testId = null;
  var seeds = { i: 0, j: 0 };
  var ictx = null;
  var run = null;
  var cdTimer = null;
  var audioUrl = null;
  var chalState = null; // { ch, joined }
  var view = null;
  var sc = null; // running series episode
  var consented = false;

  function tests() { return mode === 'ielts' ? C.IELTS_TESTS : C.TESTS; }
  function testIds() { return tests().map(function (x) { return x.id; }); }
  function ctxFor(m, i, j) {
    return m === 'ielts' ? { card: C.IELTS[i % C.IELTS.length], i: j % 3, j: j } : { i: i, j: j };
  }
  function pickNext() {
    testId = L.pickTest(testIds(), store.get('lastTest'));
    store.set('lastTest', testId);
    seeds = { i: rint(10000), j: rint(10000) };
    if (mode === 'ielts') {
      var last = parseInt(store.get('lastCard') || '-1', 10);
      if (C.IELTS.length > 1 && seeds.i % C.IELTS.length === last) seeds.i += 1;
      store.set('lastCard', seeds.i % C.IELTS.length);
    }
    ictx = ctxFor(mode, seeds.i, seeds.j);
  }
  function currentTest() {
    var x = tests().filter(function (y) { return y.id === testId; })[0];
    if (!x) { pickNext(); x = tests().filter(function (y) { return y.id === testId; })[0]; }
    return x;
  }
  function currentBuild() { return currentTest().build(activeDaily, level, ictx); }
  function restoreEnv() {
    mode = store.get('mode') === 'ielts' ? 'ielts' : 'daily';
    level = store.get('level');
    if (C.LEVELS.indexOf(level) === -1) level = 'medium';
    activeDaily = daily;
    chalState = null;
  }

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
  function vocabList() { return N.parse(store.get('vocab')); }

  function paintPill() {
    var el = $('streakPill');
    if (!el) return;
    var s = getStreak();
    var n = P.streakAlive(s, L.dateKey(new Date()));
    el.textContent = '🔥 ' + n + (s.freeze > 0 ? '  ❄️ ' + s.freeze : '');
    el.setAttribute('aria-label', s.freeze > 0 ? t('pill_aria_freeze', { n: n, f: s.freeze }) : t('pill_aria', { n: n }));
  }

  function paintChrome() {
    document.documentElement.setAttribute('lang', lang);
    var a = $('tabToday'); if (a) a.textContent = t('tab_today');
    var b = $('tabProg'); if (b) b.textContent = t('tab_progress');
    var tabs = $('tabs'); if (tabs) tabs.setAttribute('aria-label', t('tabs_label'));
    var foot = $('foot'); if (foot) foot.textContent = t('foot');
    var fl = $('flinks');
    if (fl) {
      fl.innerHTML = '<button data-legal="privacy">' + esc(t('link_privacy')) + '</button>' +
        '<button data-legal="terms">' + esc(t('link_terms')) + '</button>' +
        '<button data-legal="about">' + esc(t('link_about')) + '</button>' +
        '<button id="langBtn">' + esc(t('lang_other')) + '</button>';
      var bs = fl.querySelectorAll('[data-legal]');
      for (var i = 0; i < bs.length; i++) {
        bs[i].addEventListener('click', function (e) {
          var kind = e.currentTarget.getAttribute('data-legal');
          var back = view;
          legal(kind, back);
        });
      }
      on('langBtn', function () {
        lang = lang === 'tr' ? 'en' : 'tr';
        store.set('lang', lang);
        paintChrome();
        if (view) view();
      });
    }
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
    if (P.rankFor(total).index > P.rankFor(xpBefore).index) info.rankUp = P.rankFor(total).index;

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
      return '<div><div class="day">' + esc(t('day' + i)) + '</div><div class="dot ' + c + '">' + (isDone ? '✓' : '') + '</div></div>';
    }).join('') + '</div>';
  }
  function ringHtml(n, goal) {
    var r = 36;
    var c = 2 * Math.PI * r;
    var frac = Math.min(1, n / goal);
    return '<svg class="ring" viewBox="0 0 90 90" role="img" aria-label="' + esc(t('goal_aria', { a: Math.min(n, goal), b: goal })) + '">' +
      '<circle class="bg" cx="45" cy="45" r="' + r + '" fill="none" stroke-width="10"></circle>' +
      '<circle class="fg" cx="45" cy="45" r="' + r + '" fill="none" stroke-width="10" stroke-linecap="round" ' +
      'stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - frac)).toFixed(1) + '" transform="rotate(-90 45 45)"></circle>' +
      '<text x="45" y="53" text-anchor="middle">' + Math.min(n, goal) + '/' + goal + '</text></svg>';
  }
  function rankHtml() {
    var xp = num('xp');
    var r = P.rankFor(xp);
    var hint = r.next ? t('rank_next', { r: t('rank_' + (r.index + 1)), n: r.xpNeeded - r.xpInto }) : t('rank_max');
    return '<section class="card"><h2>' + esc(t('rank_title')) + '</h2>' +
      '<div class="rankrow"><b>' + esc(t('rank_' + r.index)) + '</b><span>' + xp + ' XP</span></div>' +
      '<div class="bar slim gold"><i style="width:' + Math.round(r.frac * 100) + '%"></i></div>' +
      '<p class="hint" style="margin-top:8px">' + esc(hint) + '</p></section>';
  }
  function challengeHtml() {
    var wk = currentWeek();
    var ch = P.challengeFor(weekKey());
    var n = P.challengeProgress(ch, wk);
    var done = wk.claimed || n >= ch.target;
    return '<section class="card"><h2>' + esc(t('chal_title')) + '</h2>' +
      '<p class="chal-title">' + esc(t('chal_' + ch.id)) + '</p>' +
      '<div class="bar slim mint"><i style="width:' + Math.round((n / ch.target) * 100) + '%"></i></div>' +
      '<p class="hint" style="margin-top:8px">' + esc(done ? t('chal_done') : n + '/' + ch.target) + '</p></section>';
  }
  function nickField() {
    return '<label class="field"><span>' + esc(t('ch_nick_label')) + '</span>' +
      '<input id="nick" type="text" maxlength="16" autocomplete="off" placeholder="' + esc(t('ch_nick_ph')) + '" value="' + esc(store.get('nick') || '') + '">' +
      '<small>' + esc(t('ch_nick_help')) + '</small></label>';
  }
  function readNick() {
    var el = $('nick');
    var v = Ch.cleanNick(el ? el.value : '');
    if (v) store.set('nick', v);
    return v || Ch.cleanNick(store.get('nick')) || '';
  }
  function standingsHtml(rounds, mineIdx) {
    if (!rounds.length) return '<p class="empty">' + esc(t('ch_nobody')) + '</p>';
    var st = Ch.standings(rounds);
    return '<ol class="standings">' + st.map(function (x) {
      return '<li class="' + (x.idx === mineIdx ? 'me' : '') + '"><span class="rk">' + x.rank + '</span><span class="nm">' + esc(x.n) + '</span>' +
        '<span class="sc">' + x.score + ' ' + esc(t('ch_score')) + '</span><small>' + x.w + ' · ' + x.u + (x.p == null ? '' : ' · ' + x.p + '/' + esc(t('stat_wpm'))) + '</small></li>';
    }).join('') + '</ol>';
  }

  // ---------- helpers: files, clipboard, sharing ----------
  function saveBlob(blob, name) {
    try {
      var a = document.createElement('a');
      var u = URL.createObjectURL(blob);
      a.href = u;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
      return true;
    } catch (e) { return false; }
  }
  function setNote(id, msg) { var el = $(id); if (el) el.textContent = msg; }
  function copyText(text, noteId, okMsg) {
    try {
      navigator.clipboard.writeText(text).then(
        function () { setNote(noteId, okMsg); },
        function () { setNote(noteId, t('share_copy_fail', { t: text })); }
      );
    } catch (e) { setNote(noteId, t('share_copy_fail', { t: text })); }
  }
  function shareOrCopy(text, url, noteId) {
    try {
      if (navigator.share) { navigator.share({ text: text, url: url }).catch(function () {}); return; }
    } catch (e) {}
    copyText(text + ' ' + url, noteId, t('ch_link_copied'));
  }

  // ---------- cleanup ----------
  function discardAudio(r) {
    var a = r && r.audio;
    if (!a) return;
    a.state = 'cancelled';
    try { if (a.mr && a.mr.state !== 'inactive') { a.mr.onstop = null; a.mr.stop(); } } catch (e) {}
    try { if (a.stream) a.stream.getTracks().forEach(function (x) { x.stop(); }); } catch (e) {}
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
    sceneStop();
    if (synth) { try { synth.cancel(); } catch (e) {} }
    if (audioUrl) { try { URL.revokeObjectURL(audioUrl); } catch (e) {} audioUrl = null; }
  }
  function setTab(name) {
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('on', tabs[i].getAttribute('data-tab') === name);
  }
  // ---------- consent and legal ----------
  function consent() {
    stopAll();
    view = consent;
    flow(false);
    noTabs();
    paintChrome();
    show(
      '<h1>' + esc(t('consent_title')) + '</h1><p class="sub">' + esc(t('consent_intro')) + '</p>' +
      '<section class="card"><ul class="bullets"><li>' + esc(t('consent_b1')) + '</li><li>' + esc(t('consent_b2')) + '</li>' +
      '<li>' + esc(t('consent_b3')) + '</li><li>' + esc(t('consent_b4')) + '</li></ul></section>' +
      '<div class="row legal-row"><button class="ghost" data-legal="privacy">' + esc(t('link_privacy')) + '</button>' +
      '<button class="ghost" data-legal="terms">' + esc(t('link_terms')) + '</button></div>' +
      '<label class="check"><input type="checkbox" id="cAgree"><span>' + esc(t('consent_check')) + '</span></label>' +
      '<p class="alert-soft" id="cNeed" hidden>' + esc(t('consent_need')) + '</p>' +
      '<button class="primary" id="cAccept">' + esc(t('consent_accept')) + '</button>' +
      '<div class="row"><button class="ghost" id="cDecline">' + esc(t('consent_decline')) + '</button></div>'
    );
    var lb = screen.querySelectorAll('[data-legal]');
    for (var i = 0; i < lb.length; i++) {
      lb[i].addEventListener('click', function (e) { legal(e.currentTarget.getAttribute('data-legal'), consent); });
    }
    on('cAccept', function () {
      var cb = $('cAgree');
      if (!cb || !cb.checked) { var n = $('cNeed'); if (n) n.hidden = false; return; }
      persist = true;
      consented = true;
      store.set('consent', String(CFG.consentVersion));
      store.flush();
      boot2();
    });
    on('cDecline', declined);
  }
  function declined() {
    view = declined;
    flow(false);
    noTabs();
    show('<h1>' + esc(t('consent_declined_title')) + '</h1><section class="card"><p>' + esc(t('consent_declined_msg')) + '</p></section>' +
      '<button class="primary" id="cBack">' + esc(t('consent_back')) + '</button>');
    on('cBack', consent);
  }
  function fill(s) {
    var miss = t('legal_missing');
    return String(s)
      .replace(/\{operator\}/g, CFG.operator || miss)
      .replace(/\{contact\}/g, CFG.contact || miss)
      .replace(/\{date\}/g, CFG.date || '');
  }
  function legal(kind, back) {
    stopAll();
    var l = lang;
    view = function () { legal(kind, back); };
    flow(false);
    if (!consented) noTabs();
    var secs = G[l][kind].map(function (s) {
      return '<section class="card legal"><h2>' + esc(s.h) + '</h2>' + s.p.map(function (p) { return '<p>' + esc(fill(p)) + '</p>'; }).join('') + '</section>';
    }).join('');
    show('<h1>' + esc(t('legal_title_' + kind)) + '</h1><p class="hint">' + esc(t('legal_updated', { d: CFG.date || '' })) + '</p>' +
      (CFG.launch ? '' : '<div class="notice">' + esc(t('legal_draft')) + '</div>') + secs +
      '<button class="primary" id="lBack">' + esc(t('legal_back')) + '</button>');
    on('lBack', function () { if (back) back(); else home(); });
    paintChrome();
  }

  // ---------- screens ----------
  function home() {
    stopAll();
    restoreEnv();
    view = home;
    flow(false);
    setTab('today');
    paintChrome();
    paintPill();
    var isI = mode === 'ielts';
    var chips = daily.words.map(function (w) { return '<span class="chip">' + esc(w) + '</span>'; }).join('');
    var levels = C.LEVELS.map(function (l) {
      return '<button data-level="' + l + '" class="' + (l === level ? 'on' : '') + '" aria-pressed="' + (l === level) + '">' + esc(lvlName(l)) + '</button>';
    }).join('');
    var n = todayCount();
    var goalText = n >= GOAL ? t('goal_done') : t('home_goal_left', { n: GOAL - n });
    var notice = SR ? '' : '<div class="notice">' + esc(t('notice_nosr')) + '</div>';
    var sub = lang === 'tr' ? '<p class="sub">' + esc(daily.theme) + '</p>' : '';
    var hero = isI
      ? '<p class="eyebrow">' + esc(t('eyebrow_exam')) + '</p><span class="emoji" aria-hidden="true">🎓</span><h1>' + esc(t('ielts_title')) + '</h1>' +
        '<p class="sub">' + esc(t('ielts_sub')) + '</p><button class="btn-sun" id="go">' + esc(t('ielts_start')) + '</button>'
      : '<p class="eyebrow">' + esc(t('eyebrow_today', { d: dateLabel(today) })) + '</p><span class="emoji" aria-hidden="true">' + daily.emoji + '</span>' +
        '<h1>' + esc(themeMain(daily)) + '</h1>' + sub + '<button class="btn-sun" id="go">' + esc(t('hero_start')) + '</button>';
    var vc = vocabList().length;
    show(
      '<section class="hero">' + hero + '</section>' +
      (isI ? '' : '<section class="card seriescard"><span class="big" aria-hidden="true">🕵️</span><div><h2>' + esc(t('series_card_h')) + '</h2><p>' + esc(t('series_card_p')) + '</p>' +
        '<button class="primary small" id="seriesGo">' + esc(t('series_play')) + '</button></div></section>') +
      '<div class="seg two" role="group" aria-label="' + esc(t('mode_label')) + '" style="margin-top:14px">' +
        '<button data-mode="daily" class="' + (!isI ? 'on' : '') + '" aria-pressed="' + (!isI) + '">' + esc(t('mode_daily')) + '</button>' +
        '<button data-mode="ielts" class="' + (isI ? 'on' : '') + '" aria-pressed="' + isI + '">' + esc(t('mode_ielts')) + '</button>' +
      '</div>' +
      notice +
      '<section class="card invite"><h2>' + esc(t('invite_title')) + '</h2><p>' + esc(t('invite_sub')) + '</p>' +
        '<button class="primary small" id="invite">' + esc(t('invite_btn')) + '</button></section>' +
      '<section class="card goal">' + ringHtml(n, GOAL) + '<div><b>' + esc(t('goal_title')) + '</b><span>' + esc(goalText) + '</span></div></section>' +
      (vc ? '<section class="card vocabcard"><h2>' + esc(t('vocab_card_title')) + '</h2><p>' + esc(t('vocab_card_count', { n: vc })) + '</p>' +
        '<button class="ghost" id="vocabOpen">' + esc(t('vocab_open')) + '</button></section>' : '') +
      rankHtml() + challengeHtml() +
      '<section class="card"><h2>' + esc(t('week_title')) + '</h2>' + weekHtml() + '</section>' +
      (isI ? '' :
        '<section class="card"><h2>' + esc(t('words_title')) + '</h2><div class="chips">' + chips + '</div></section>' +
        '<section class="card"><h2>' + esc(t('level_title')) + '</h2><div class="seg" role="group" aria-label="' + esc(t('level_title')) + '">' + levels + '</div></section>')
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
    on('go', function () { if (!testId || tests().every(function (x) { return x.id !== testId; })) pickNext(); card(); });
    on('invite', invite);
    on('vocabOpen', vocab);
    on('seriesGo', function () { sceneIntro(Se.episodeFor(L.dateKey(new Date()))); });
  }

  function progress() {
    stopAll();
    restoreEnv();
    view = progress;
    flow(false);
    setTab('progress');
    paintChrome();
    paintPill();
    var got = stampList();
    var st = getStreak();
    var ids = P.PASSPORT_IDS;
    var stamps = ids.map(function (id) {
      return '<div class="stamp ' + (got.indexOf(id) !== -1 ? 'got' : '') + '"><span class="ico">' + STAMP_EMOJI[id] + '</span>' + esc(t('stamp_' + id)) + '</div>';
    }).join('');
    var badges = P.badgesFor(getState()).map(function (b) {
      return '<div class="badge ' + (b.earned ? 'got' : 'lock') + '"><span class="ico">' + (b.earned ? b.emoji : '🔒') + '</span><div><b>' +
        esc(t('badge_' + b.id + '_t')) + '</b><span>' + esc(t('badge_' + b.id + '_d')) + '</span></div></div>';
    }).join('');
    var gotCount = ids.filter(function (id) { return got.indexOf(id) !== -1; }).length;
    show(
      '<h1>' + esc(t('prog_title')) + '</h1><p class="sub">' + esc(t('prog_sub')) + '</p>' +
      '<div class="stats">' +
        '<div class="stat"><b>' + P.streakAlive(st, L.dateKey(new Date())) + '</b><span>' + esc(t('stat_streak')) + '</span></div>' +
        '<div class="stat"><b>' + num('done') + '</b><span>' + esc(t('stat_tests')) + '</span></div>' +
        '<div class="stat"><b>' + num('words') + '</b><span>' + esc(t('stat_wordsum')) + '</span></div>' +
        '<div class="stat"><b>' + num('xp') + '</b><span>' + esc(t('stat_xp')) + '</span></div>' +
      '</div>' +
      '<p class="hint">' + esc(t('freeze_info', { n: st.freeze })) + '</p>' +
      rankHtml() + challengeHtml() +
      '<section class="card"><h2>' + esc(t('passport_title', { n: gotCount, m: ids.length })) + '</h2><div class="stamps">' + stamps + '</div></section>' +
      '<section class="card"><h2>' + esc(t('badges_title')) + '</h2><div class="badges">' + badges + '</div></section>' +
      '<section class="card"><h2>' + esc(t('week_title')) + '</h2>' + weekHtml() + '</section>' +
      '<section class="card"><h2>' + esc(t('profile_title')) + '</h2>' + nickField() +
        '<div class="row"><button id="nickSave">' + esc(t('nick_save')) + '</button></div><p class="hint" id="nickNote"></p></section>' +
      '<section class="card"><h2>' + esc(t('remind_title')) + '</h2><p class="hint">' + esc(t('remind_help')) + '</p>' +
        '<label class="field"><input id="remindTime" type="time" value="' + esc(store.get('remind') || '20:00') + '"></label>' +
        '<div class="row"><button id="remindBtn">' + esc(t('remind_btn')) + '</button></div><p class="hint" id="remindNote"></p></section>' +
      '<section class="card"><h2>' + esc(t('backup_title')) + '</h2><p class="hint">' + esc(t('backup_help')) + '</p>' +
        '<div class="row"><button id="bkMake">' + esc(t('backup_make')) + '</button></div>' +
        '<textarea id="bkCode" class="code" rows="3" placeholder="' + esc(t('backup_ph')) + '" aria-label="' + esc(t('backup_title')) + '"></textarea>' +
        '<div class="row"><button class="ghost" id="bkCopy">' + esc(t('backup_copy')) + '</button><button id="bkRestore">' + esc(t('backup_restore')) + '</button></div>' +
        '<p class="hint" id="bkNote"></p></section>' +
      '<section class="card danger"><h2>' + esc(t('delete_title')) + '</h2><p class="hint">' + esc(t('delete_help')) + '</p>' +
        '<div id="delBox"><button class="ghost" id="delBtn">' + esc(t('delete_btn')) + '</button></div></section>'
    );
    on('nickSave', function () { readNick(); setNote('nickNote', t('nick_saved')); });
    on('remindBtn', function () {
      var el = $('remindTime');
      var time = ICS.validTime(el && el.value) ? el.value : '20:00';
      store.set('remind', time);
      var start = L.dateKey(new Date());
      var body = ICS.make({ time: time, startKey: start, summary: t('remind_summary') });
      setNote('remindNote', saveBlob(new Blob([body], { type: 'text/calendar' }), 'konus-reminder.ics') ? t('remind_ok') : t('remind_fail'));
    });
    on('bkMake', function () {
      var o = {};
      store.keys().forEach(function (k) { if (B.allowedKey(k)) o[k] = store.get(k); });
      var code = B.pack(o);
      var ta = $('bkCode');
      if (ta) { ta.value = code; try { ta.focus(); ta.select(); } catch (e) {} }
    });
    on('bkCopy', function () { var ta = $('bkCode'); if (ta && ta.value) copyText(ta.value, 'bkNote', t('backup_copied')); });
    on('bkRestore', function () {
      var ta = $('bkCode');
      var o = B.unpack(ta ? ta.value : '');
      if (!o) { setNote('bkNote', t('backup_bad')); return; }
      Object.keys(o).forEach(function (k) { store.set(k, o[k]); });
      var l2 = store.get('lang');
      if (l2 === 'tr' || l2 === 'en') lang = l2;
      restoreEnv();
      paintChrome();
      progress();
      setNote('bkNote', t('backup_ok'));
    });
    on('delBtn', function () {
      var box = $('delBox');
      if (!box) return;
      box.innerHTML = '<p><b>' + esc(t('delete_confirm')) + '</b></p><div class="row"><button class="dangerbtn" id="delYes">' + esc(t('delete_yes')) +
        '</button><button class="ghost" id="delNo">' + esc(t('delete_cancel')) + '</button></div>';
      on('delYes', function () {
        store.clear();
        persist = false;
        consented = false;
        lang = /^tr/i.test(navigator.language || '') ? 'tr' : 'en';
        level = 'medium';
        mode = 'daily';
        chalState = null;
        testId = null;
        consent();
      });
      on('delNo', progress);
    });
  }

  // ---------- vocabulary notebook ----------
  function say(text) {
    if (!synth || !window.SpeechSynthesisUtterance) return;
    try {
      synth.cancel();
      var u = new window.SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.9;
      synth.speak(u);
    } catch (e) {}
  }
  function vocab() {
    stopAll();
    view = vocab;
    flow(false);
    setTab('today');
    paintChrome();
    var list = vocabList();
    var rows = list.map(function (w, i) {
      return '<li><span class="w">' + esc(w) + '</span><button class="mini" data-say="' + i + '" aria-label="' + esc(t('vocab_say')) + ' ' + esc(w) + '">🔊</button>' +
        '<button class="mini ghost" data-rm="' + i + '">' + esc(t('vocab_done')) + '</button></li>';
    }).join('');
    show('<h1>' + esc(t('vocab_h')) + '</h1><p class="sub">' + esc(t('vocab_hint')) + '</p>' +
      (list.length ? '<section class="card"><ul class="vlist">' + rows + '</ul></section>' +
        '<button class="primary" id="vDrill">' + esc(t('vocab_drill')) + '</button>' :
        '<section class="card"><p class="empty">' + esc(t('vocab_empty')) + '</p></section>') +
      '<div class="row"><button class="ghost" id="vBack">' + esc(t('btn_back')) + '</button></div>');
    var sb = screen.querySelectorAll('[data-say]');
    for (var i = 0; i < sb.length; i++) sb[i].addEventListener('click', function (e) { say(list[+e.currentTarget.getAttribute('data-say')]); });
    var rb = screen.querySelectorAll('[data-rm]');
    for (var j = 0; j < rb.length; j++) {
      rb[j].addEventListener('click', function (e) {
        store.set('vocab', N.serialize(N.remove(list, list[+e.currentTarget.getAttribute('data-rm')])));
        vocab();
      });
    }
    on('vDrill', function () {
      var words = list.slice(0, 5);
      daily.words.forEach(function (w) { if (words.length < 5 && words.indexOf(w.toLowerCase()) === -1) words.push(w); });
      activeDaily = { theme: 'My word notebook', themeTr: 'Kelime defterim', emoji: '📒', words: words, questions: daily.questions };
      mode = 'daily';
      testId = 'rapid';
      seeds = { i: rint(10000), j: rint(10000) };
      ictx = ctxFor('daily', seeds.i, seeds.j);
      card();
    });
    on('vBack', home);
  }

  // ---------- challenges ----------
  function chalText(ch, rounds) {
    var d = L.pickDaily(C.DAILY, dateFromKey(ch.d));
    return t('ch_text_invite', { t: ch.m === 'ielts' ? t('mode_ielts') : themeMain(d), u: '' }).trim();
  }
  function invite() {
    stopAll();
    view = invite;
    flow(false);
    setTab('today');
    paintChrome();
    show('<h1>' + esc(t('ch_invite_title')) + '</h1><p class="sub">' + esc(t('ch_invite_sub')) + '</p>' +
      '<section class="card">' + nickField() + '</section>' +
      '<section class="card"><p class="hint">' + esc(t('ch_privacy_note')) + '</p><p class="hint">' + esc(t('ch_fun_note')) + '</p></section>' +
      '<button class="primary" id="iSend">' + esc(t('ch_make_link')) + '</button>' +
      '<div class="row"><button id="iCopy">' + esc(t('ch_copy_link')) + '</button><button class="ghost" id="iBack">' + esc(t('btn_back')) + '</button></div>' +
      '<p class="hint" id="iNote"></p>');
    function build() {
      readNick();
      var key = L.dateKey(new Date());
      var ids = testIds();
      var ch = { d: key, m: mode, t: Ch.dailyTestId(ids, key), lv: level, i: rint(10000), j: rint(10000), r: [] };
      var url = Ch.link(siteUrl(), ch);
      return { ch: ch, url: url, text: chalText(ch) };
    }
    on('iSend', function () { var o = build(); shareOrCopy(o.text, o.url, 'iNote'); });
    on('iCopy', function () { var o = build(); copyText(o.text + ' ' + o.url, 'iNote', t('ch_link_copied')); });
    on('iBack', home);
  }

  function challengeIntro(ch) {
    stopAll();
    view = function () { challengeIntro(ch); };
    flow(false);
    paintChrome();
    var list = ch.m === 'ielts' ? C.IELTS_TESTS : C.TESTS;
    var ok = list.some(function (x) { return x.id === ch.t; });
    if (!ok) { show('<section class="card"><p class="empty">' + esc(t('ch_invalid')) + '</p></section><button class="primary" id="cHome">' + esc(t('btn_home')) + '</button>'); on('cHome', home); return; }
    var d = L.pickDaily(C.DAILY, dateFromKey(ch.d));
    show('<p class="eyebrow">' + esc(t('ch_intro_title')) + '</p>' +
      '<h1>' + esc(ch.m === 'ielts' ? t('ielts_title') : themeMain(d)) + '</h1>' +
      '<section class="card"><p><b>' + esc(t('ch_test')) + ':</b> ' + esc(I.testTitle(lang, ch.t)) + ' · ' + esc(lvlName(ch.lv)) + '</p>' +
      '<h2 style="margin-top:14px">' + esc(t('ch_standings')) + '</h2>' + standingsHtml(ch.r, -1) + '</section>' +
      '<section class="card">' + nickField() + '<p class="hint">' + esc(t('ch_privacy_note')) + '</p></section>' +
      '<button class="primary" id="cGo">' + esc(t('ch_start')) + '</button>' +
      '<div class="row"><button class="ghost" id="cSkip">' + esc(t('ch_skip')) + '</button></div>');
    on('cGo', function () {
      readNick();
      mode = ch.m;
      level = ch.lv;
      testId = ch.t;
      seeds = { i: ch.i, j: ch.j };
      ictx = ctxFor(ch.m, ch.i, ch.j);
      activeDaily = d;
      chalState = { ch: ch, joined: false };
      card();
    });
    on('cSkip', function () { try { history.replaceState(null, '', siteUrl()); } catch (e) {} home(); });
  }

  // ---------- test flow ----------
  function card() {
    stopAll();
    flow(true);
    var t0 = currentTest();
    var b = currentBuild();
    var pts = b.points ? '<ul class="points">' + b.points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' : '';
    var extra = b.prepSeconds ? t('meta_prep', { n: b.prepSeconds }) : '';
    var scene = b.scene ? '<p class="scene" aria-hidden="true">' + esc(b.scene) + '</p>' : '';
    var pass = b.passage ? '<p class="passage" style="margin-top:10px">' + esc(b.passage) + '</p>' : '';
    show(
      '<p class="eyebrow">' + esc(mode === 'ielts' ? t('eyebrow_ielts') : t('eyebrow_test')) + '</p>' +
      '<h1>' + esc(testTitle(t0.id)) + '</h1>' +
      '<p class="meta">' + (mode === 'ielts' ? '' : esc(lvlName(level)) + ' · ') + esc(t('meta_sec', { n: b.seconds })) + esc(extra) + '</p>' +
      '<section class="card">' + scene + '<p class="prompt">' + esc(b.promptEn) + '</p>' + pts + pass +
        '<p class="hint" style="margin-top:10px">💡 ' + esc(hintFor(b, t0.id)) + '</p></section>' +
      (CAN_RECORD ? '<label class="toggle"><input type="checkbox" id="audioToggle"' + (store.get('audio') === '1' ? ' checked' : '') + '> <span>' +
        esc(t('audio_toggle')) + ' <small>' + esc(t('audio_exp')) + '</small></span></label>' : '') +
      '<button class="primary" id="start">' + esc(t('btn_start')) + '</button>' +
      '<div class="row"><button class="ghost" id="other">' + esc(t('btn_other')) + '</button><button class="ghost" id="back">' + esc(t('btn_back')) + '</button></div>'
    );
    var at = $('audioToggle');
    if (at) at.addEventListener('change', function () { store.set('audio', at.checked ? '1' : '0'); });
    on('start', countdown);
    on('other', function () {
      if (chalState) { chalState = null; restoreEnv(); }
      pickNext();
      card();
    });
    on('back', home);
  }

  function countdown() {
    stopAll();
    flow(true);
    var n = 3;
    show('<div class="center"><p class="eyebrow">' + esc(t('get_ready')) + '</p><div class="count" id="cnt">' + n + '</div></div>');
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
      '<p class="eyebrow">' + esc(t('prep_title')) + '</p>' +
      '<div class="timer" id="ptime">' + mmss(b.prepSeconds) + '</div>' +
      '<section class="card"><p class="prompt">' + esc(b.promptEn) + '</p><p class="hint">You should say:</p><ul class="points">' + pts + '</ul></section>' +
      '<button class="primary" id="prepgo">' + esc(t('prep_go')) + '</button>'
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
      '<p class="eyebrow">' + esc(t('listen_title')) + '</p><h1>' + esc(t('listen_h')) + '</h1>' +
      '<section class="card"><p class="prompt">' + esc(b.speakText) + '</p></section>' +
      '<div class="row"><button id="replay">' + esc(t('replay')) + '</button></div>' +
      '<button class="primary" id="speak">' + esc(t('speak_go')) + '</button>'
    );
    on('replay', function () { say(b.speakText); });
    on('speak', function () { if (synth) { try { synth.cancel(); } catch (e) {} } record(b); });
    say(b.speakText);
  }

  function record(b) {
    run = {
      limit: b.seconds, startedAt: Date.now(), typed: !SR, base: '', final: '', interim: '', done: false,
      rec: null, timer: null, build: b, audio: null, ridx: -1, widx: -1, pspans: null
    };
    var body = SR
      ? '<div class="transcript" id="tr" aria-live="polite"><span class="ghost">' + esc(t('tr_placeholder')) + '</span></div>'
      : '<textarea id="typed" placeholder="' + esc(t('typed_placeholder')) + '" aria-label="' + esc(t('typed_label')) + '"></textarea>';
    var top;
    if (b.prompts) {
      top = '<section class="card"><p class="rcount" id="rcount">1/' + b.prompts.length + '</p><p class="rapid-prompt" id="rprompt">' + esc(b.prompts[0]) + '</p></section>';
    } else if (b.passage) {
      var spans = b.passage.split(/\s+/).map(function (w) { return '<span>' + esc(w) + '</span>'; }).join(' ');
      top = '<p class="hint" style="margin-top:12px">' + esc(b.promptEn) + '</p><section class="card"><p class="passage" id="passage">' + spans + '</p></section>';
    } else {
      var pts = b.points ? '<ul class="points">' + b.points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' : '';
      top = (b.scene ? '<p class="scene" aria-hidden="true">' + esc(b.scene) + '</p>' : '') +
        '<p class="hint" style="margin-top:12px">' + esc(b.promptEn) + '</p>' + pts;
    }
    show(
      '<p class="eyebrow">' + esc(testTitle(testId)) + '</p>' +
      '<div class="timer" id="time">' + mmss(b.seconds) + '</div>' +
      '<div class="bar"><i id="fill"></i></div>' + top +
      '<div id="note"></div><div id="body">' + body + '</div>' +
      '<button class="primary" id="finish">' + esc(t('btn_finish')) + '</button>'
    );
    if (b.passage && b.passageWpm) run.pspans = screen.querySelectorAll('#passage span');
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
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture' || code === 'network') switchToTyped(code);
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
        stream.getTracks().forEach(function (x) { x.stop(); });
        return;
      }
      var mr;
      try { mr = new window.MediaRecorder(stream); }
      catch (e) { stream.getTracks().forEach(function (x) { x.stop(); }); r.audio.state = 'failed'; return; }
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
      try { a.stream.getTracks().forEach(function (x) { x.stop(); }); } catch (e) {}
      cb(blob);
    }
    a.mr.onstop = function () { done(a.chunks.length ? new Blob(a.chunks, { type: a.mr.mimeType || 'audio/webm' }) : null); };
    try { a.mr.stop(); } catch (e) { done(null); }
    setTimeout(function () { done(null); }, 1500);
  }

  function liveText() { return run ? (run.base + run.final + run.interim).trim() : ''; }
  function paintTranscript() {
    var el = $('tr');
    if (!el || !run) return;
    el.textContent = liveText() || t('tr_placeholder');
  }

  function switchToTyped(code) {
    if (!run || run.typed) return;
    var text = liveText();
    run.typed = true;
    if (run.rec) { try { run.rec.onend = null; run.rec.abort(); } catch (e) {} }
    discardAudio(run);
    var msg = code === 'not-allowed' || code === 'service-not-allowed' ? t('mic_denied') : (code === 'network' ? t('mic_network') : t('mic_unavailable'));
    var note = $('note');
    if (note) note.innerHTML = '<div class="notice">' + esc(msg) + '</div>';
    var body = $('body');
    if (body) {
      body.innerHTML = '<textarea id="typed" aria-label="' + esc(t('typed_label')) + '"></textarea>';
      var ta = $('typed');
      if (ta) ta.value = text;
    }
  }

  function tick() {
    if (!run || run.done) return;
    var elapsed = (Date.now() - run.startedAt) / 1000;
    var left = run.limit - elapsed;
    var el = $('time');
    var f = $('fill');
    if (el) el.textContent = mmss(left);
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
    if (b.passageWpm && run.pspans) {
      var wi = Math.floor(elapsed * b.passageWpm / 60);
      if (wi !== run.widx) {
        run.widx = wi;
        for (var k = 0; k < run.pspans.length; k++) run.pspans[k].className = k < wi ? 'read' : (k === wi ? 'cur' : '');
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
    if (r.typed) { var ta = $('typed'); text = ta ? ta.value : ''; } else { text = liveText(); }
    if (r.rec) { try { r.rec.onend = null; r.rec.abort(); } catch (e) {} }
    if (synth) { try { synth.cancel(); } catch (e) {} }
    var seconds = Math.min(r.limit, (Date.now() - r.startedAt) / 1000);
    run = null;
    stopAudio(r, function (blob) { finalize(r, text.trim(), seconds, blob); });
  }

  function finalize(r, text, seconds, blob) {
    var words = L.countWords(text);
    var an = A.analyze(text);
    var b = r.build;
    var hits = b.targets ? L.targetHits(text, b.targets) : null;
    var wpm = r.typed ? null : L.wordsPerMinute(words, seconds);
    var cur = { words: words, wpm: wpm, unique: an.unique };
    var prev = getJSON('prev_' + testId);
    var cmp = words > 0 ? A.compare(prev, cur) : null;
    var info = commit({ words: words, hitCount: hits ? hits.hit.length : 0 });
    if (words > 0) setJSON('prev_' + testId, cur);

    var added = 0;
    if (hits && words > 0) {
      var before = vocabList();
      var kept = hits.hit.reduce(function (l, w) { return N.remove(l, w); }, before);
      var after = N.add(kept, hits.missed);
      added = after.filter(function (w) { return before.indexOf(w) === -1; }).length;
      store.set('vocab', N.serialize(after));
    }

    var myRound = Ch.makeRound({ n: store.get('nick'), w: words, u: an.unique, p: wpm, f: an.fillers.count });
    var chal = null;
    if (words > 0) {
      if (chalState && !chalState.joined) {
        chalState = { ch: Ch.addRound(chalState.ch, myRound), joined: true };
      }
      chal = chalState;
    }
    if (blob) { try { audioUrl = URL.createObjectURL(blob); } catch (e) { audioUrl = null; } }
    var band = mode === 'ielts' && words > 0
      ? A.bandEstimate({ words: words, seconds: Math.max(5, seconds), wpm: wpm, unique: an.unique, fillers: an.fillers.count })
      : null;
    result({
      text: text, seconds: seconds, words: words, wpm: wpm, typed: r.typed, hits: hits, an: an, cmp: cmp, info: info,
      audioUrl: audioUrl, cov: b.passage ? A.coverage(text, b.passage) : null, title: testTitle(testId),
      tips: words > 0 ? A.tips(text) : [], band: band, vocabAdded: added, round: myRound, chal: chal
    });
  }

  // ---------- share card ----------
  function shareText(s) {
    return t('share_text', { w: s.words, s: P.streakAlive(getStreak(), L.dateKey(new Date())), u: siteUrl() });
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
    g.fillText(t('share_card_sub'), 80, 215);
    g.fillStyle = '#ffffff';
    g.font = '800 300px ' + font;
    g.fillText(String(s.words), 70, 640);
    g.font = '700 70px ' + font;
    g.fillText(t('share_card_title'), 80, 735);
    var streak = P.streakAlive(getStreak(), L.dateKey(new Date()));
    var items = [
      [s.wpm == null ? '–' : String(s.wpm), t('share_card_wpm')],
      ['🔥 ' + streak, t('share_card_streak')],
      [t('rank_' + P.rankFor(num('xp')).index), t('share_card_rank')]
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
  function wireShare(s) {
    on('copy', function () { copyText(shareText(s), 'shareNote', t('share_copied')); });
    on('dl', function () {
      cardBlob(s, function (blob) {
        if (!blob) { setNote('shareNote', t('share_img_fail')); return; }
        setNote('shareNote', saveBlob(blob, 'konus-sonuc.png') ? t('share_dl_ok') : t('share_dl_fail'));
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
        setNote('shareNote', t('share_unsupported'));
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
    var pk = !s.typed && s.words >= 10 ? A.paceKey(s.wpm) : null;
    var rep = an.repeated.map(function (x) { return esc(x.word) + ' ×' + x.n; }).join(', ');
    return '<section class="card analysis"><h2>' + esc(t('analysis_title')) + '</h2>' +
      '<p>🔤 <b>' + esc(t('an_unique')) + ':</b> ' + an.unique + ' / ' + an.words + ' (%' + an.ratio + ')</p>' +
      '<p>🧩 <b>' + esc(t('an_fillers')) + ':</b> ' + (f.count ? f.count + ' (' + foundTxt + ')' : esc(t('an_none'))) + '</p>' +
      (rep ? '<p>🔁 <b>' + esc(t('an_repeated')) + ':</b> ' + rep + '</p>' : '') +
      (pk ? '<p>⏱️ <b>' + esc(t('an_pace')) + ':</b> ' + esc(t('pace_' + pk)) + ' (' + s.wpm + ' ' + esc(t('stat_wpm')) + ')</p>' : '') +
      (s.cov != null ? '<p>🎯 <b>' + esc(t('an_cov')) + ':</b> %' + s.cov + '</p>' : '') +
      '<small>' + esc(t('an_note')) + '</small></section>';
  }
  function tipsHtml(s) {
    if (!s.tips.length) return '';
    return '<section class="card"><h2>' + esc(t('tips_title')) + '</h2><ul class="tips">' + s.tips.map(function (x) {
      return '<li><span class="bad">' + esc(x.bad) + '</span> → <span class="good">' + esc(x.good) + '</span><small>' + esc(x[lang]) + '</small></li>';
    }).join('') + '</ul><small>' + esc(t('tips_note')) + '</small></section>';
  }
  function bandHtml(s) {
    if (s.band == null) return '';
    return '<section class="card band"><h2>' + esc(t('band_title')) + '</h2><p class="bandnum">' + s.band.toFixed(1) + '</p><small>' + esc(t('band_note')) + '</small></section>';
  }
  function compareHtml(s) {
    if (!s.cmp) return '<section class="card"><h2>' + esc(t('cmp_title')) + '</h2><p class="empty">' + esc(t('cmp_first')) + '</p></section>';
    var c = s.cmp;
    var chips = '<span class="chip"><span class="delta ' + cls(c.words) + '">' + sign(c.words) + '</span> ' + esc(t('cmp_words')) + '</span>' +
      '<span class="chip"><span class="delta ' + cls(c.unique) + '">' + sign(c.unique) + '</span> ' + esc(t('cmp_unique')) + '</span>';
    if (c.wpm !== null) chips += '<span class="chip"><span class="delta ' + cls(c.wpm) + '">' + sign(c.wpm) + '</span> ' + esc(t('cmp_wpm')) + '</span>';
    return '<section class="card"><h2>' + esc(t('cmp_title')) + '</h2><div class="chips">' + chips + '</div></section>';
  }
  function rewardsHtml(s) {
    var i = s.info;
    var h = '<div class="xp-banner"><b>' + esc(t('xp_plus', { n: i.xp + i.bonus })) + '</b><span>' + esc(t('rank_' + P.rankFor(num('xp')).index)) + ' · ' + num('xp') + ' XP</span></div>';
    if (i.rankUp != null) h += '<div class="alert">' + esc(t('rankup', { r: t('rank_' + i.rankUp) })) + '</div>';
    i.newBadges.forEach(function (b) { h += '<div class="alert">' + esc(t('badge_new', { e: b.emoji, b: t('badge_' + b.id + '_t') })) + '</div>'; });
    if (i.challenge) h += '<div class="alert">' + esc(t('chal_complete', { c: t('chal_' + i.challenge.id) })) + '</div>';
    if (i.usedFreeze) h += '<div class="alert">' + esc(t('freeze_used')) + '</div>';
    if (s.vocabAdded) h += '<div class="alert soft">' + esc(t('vocab_saved', { n: s.vocabAdded })) + '</div>';
    return h;
  }
  function groupHtml(s) {
    var ch = s.chal && s.chal.ch;
    if (!ch) {
      // not a group round: offer to start one with this result
      return '<section class="card"><h2>' + esc(t('ch_invite_title')) + '</h2><p class="hint">' + esc(t('ch_invite_sub')) + '</p>' +
        nickField() + '<div class="row"><button id="gSend">' + esc(t('ch_make_link')) + '</button><button class="ghost" id="gCopy">' + esc(t('ch_copy_link')) + '</button></div>' +
        '<p class="hint">' + esc(t('ch_privacy_note')) + '</p><p class="hint" id="gNote"></p></section>';
    }
    var mine = -1;
    ch.r.forEach(function (x, i) { if (x.n === s.round.n && x.w === s.round.w && x.u === s.round.u) mine = i; });
    return '<section class="card"><h2>' + esc(t('ch_group_title')) + '</h2>' + standingsHtml(ch.r, mine) +
      '<p class="hint" style="margin-top:8px">' + esc(t('ch_your_round')) + '</p>' +
      '<div class="row"><button id="gSend">' + esc(t('ch_make_link')) + '</button><button class="ghost" id="gCopy">' + esc(t('ch_copy_link')) + '</button></div>' +
      '<p class="hint">' + esc(t('ch_fun_note')) + '</p><p class="hint" id="gNote"></p></section>';
  }
  function wireGroup(s) {
    function mk() {
      var nick = readNick() || 'Misafir';
      var ch = s.chal && s.chal.ch;
      if (!ch) {
        ch = Ch.addRound({ d: L.dateKey(new Date()), m: mode, t: testId, lv: level, i: seeds.i, j: seeds.j, r: [] },
          Ch.makeRound({ n: nick, w: s.round.w, u: s.round.u, p: s.round.p, f: s.round.f }));
      }
      var rank = Ch.standings(ch.r).filter(function (x) { return x.n === (s.chal ? s.round.n : nick) && x.w === s.round.w; })[0];
      var url = Ch.link(siteUrl(), ch);
      var text = t('ch_text_result', { w: s.round.w, r: rank ? rank.rank : 1, u: '' }).trim();
      return { url: url, text: text };
    }
    on('gSend', function () { var o = mk(); shareOrCopy(o.text, o.url, 'gNote'); });
    on('gCopy', function () { var o = mk(); copyText(o.text + ' ' + o.url, 'gNote', t('ch_link_copied')); });
  }

  function result(s) {
    flow(true);
    paintPill();
    var hitsHtml = '';
    if (s.hits) {
      hitsHtml = '<section class="card"><h2>' + esc(t('hits_title', { a: s.hits.hit.length, b: s.hits.hit.length + s.hits.missed.length })) + '</h2><div class="chips">' +
        s.hits.hit.map(function (w) { return '<span class="chip hit">✓ ' + esc(w) + '</span>'; }).join('') +
        s.hits.missed.map(function (w) { return '<span class="chip miss">✗ ' + esc(w) + '</span>'; }).join('') + '</div></section>';
    }
    var body;
    if (s.words === 0) {
      body = '<section class="card"><p class="empty">' + esc(t('res_empty')) + '</p></section>';
    } else {
      body = rewardsHtml(s) +
        '<div class="result-grid">' +
          '<div class="stat"><b>' + Math.round(s.seconds) + '</b><span>' + esc(t('stat_seconds')) + '</span></div>' +
          '<div class="stat"><b>' + s.words + '</b><span>' + esc(t('stat_words')) + '</span></div>' +
          '<div class="stat"><b>' + (s.wpm === null ? '–' : s.wpm) + '</b><span>' + esc(t('stat_wpm')) + '</span></div>' +
        '</div>' +
        groupHtml(s) + analysisHtml(s) + bandHtml(s) + tipsHtml(s) + compareHtml(s) + hitsHtml +
        '<section class="card"><h2>' + esc(s.typed ? t('typed_h') : t('heard')) + '</h2><p>' + esc(s.text) + '</p>' +
          (s.audioUrl ? '<audio class="audio" id="replayAudio" controls src="' + esc(s.audioUrl) + '"></audio>' : '') + '</section>' +
        '<section class="card"><h2>' + esc(t('share_title')) + '</h2>' +
          '<div class="row" style="margin-top:0"><button id="share">' + esc(t('btn_share')) + '</button><button id="dl">' + esc(t('btn_dl')) + '</button></div>' +
          '<div class="row"><button class="ghost" id="copy">' + esc(t('btn_copy')) + '</button></div>' +
          '<p class="hint" id="shareNote" style="margin-top:8px"></p></section>';
    }
    show(
      '<p class="eyebrow">' + esc(t('eyebrow_result', { t: s.title })) + '</p>' +
      '<h1>' + esc(s.words === 0 ? t('res_bad') : t('res_good')) + '</h1>' + body +
      '<button class="primary" id="again">' + esc(t('btn_again')) + '</button>' +
      '<div class="row"><button id="next">' + esc(t('btn_next')) + '</button><button class="ghost" id="home">' + esc(t('btn_home')) + '</button></div>'
    );
    if (s.words > 0) { confetti(); wireShare(s); wireGroup(s); }
    on('again', card);
    on('next', function () {
      if (chalState) { chalState = null; restoreEnv(); }
      pickNext();
      card();
    });
    on('home', function () { try { if (location.hash) history.replaceState(null, '', siteUrl()); } catch (e) {} home(); });
  }

  // ---------- tabs and boot ----------
  var tabBtns = document.querySelectorAll('.tab');
  for (var ti = 0; ti < tabBtns.length; ti++) {
    tabBtns[ti].addEventListener('click', function (e) {
      if (!consented) return;
      var name = e.currentTarget.getAttribute('data-tab');
      if (name === 'progress') progress(); else home();
    });
  }

  var pendingChallenge = null;
  var badHash = false;

  // ---------- series (Sherlock): you are his friend, first person ----------
  function pickVoice(male) {
    if (!synth || !synth.getVoices) return null;
    var vs = synth.getVoices() || [];
    var en = vs.filter(function (v) { return /^en/i.test(v.lang); });
    if (male) {
      // Sherlock: a British, deep, crisp male voice. Score every English voice, take the best.
      var best = null, bestScore = -1;
      en.forEach(function (v) {
        var s = 0, n = v.name || '';
        if (/en[-_]GB/i.test(v.lang)) s += 50;
        else if (/en[-_](AU|IE|ZA)/i.test(v.lang)) s += 10;
        if (/google uk english male/i.test(n)) s += 60;
        if (/arthur|oliver|ryan|thomas|daniel|george|harry|james|malcolm|gordon|rishi/i.test(n)) s += 40;
        if (/natural|online|neural/i.test(n)) s += 15;
        if (/\bmale\b/i.test(n)) s += 20;
        if (/female|susan|hazel|libby|sonia|kate|serena|fiona|moira|samantha|zira|karen|amy|emma|mia|victoria/i.test(n)) s -= 100;
        if (s > bestScore) { bestScore = s; best = v; }
      });
      return best || en[0] || null;
    }
    return en.filter(function (v) { return /en[-_]US/i.test(v.lang) && !/male\b/i.test(v.name); })[0] || en[0] || null;
  }
  var curAudio = null;
  function stopAudio() { if (curAudio) { try { curAudio.onended = null; curAudio.onerror = null; curAudio.pause(); } catch (e) {} curAudio = null; } }
  function speakLine(text, male, done) {
    var fired = false;
    function fin() { if (fired) return; fired = true; if (sc && sc.ttsTimer) { clearTimeout(sc.ttsTimer); sc.ttsTimer = null; } done(); }
    var est = St.estimateMs(text);
    stopAudio();
    // Sherlock: use the pre-generated voice line when there is one; otherwise fall through to the browser voice.
    var clip = male && window.SHERLOCK_AUDIO && window.SHERLOCK_AUDIO[text];
    if (clip && window.Audio) {
      try {
        var a = new window.Audio(clip);
        curAudio = a;
        a.onended = fin;
        a.onerror = function () { stopAudio(); speakTts(); };
        var pr = a.play();
        if (pr && pr.catch) pr.catch(function () { stopAudio(); speakTts(); });
        sc.ttsTimer = setTimeout(fin, est * 2 + 4000);
        return;
      } catch (e) { stopAudio(); }
    }
    speakTts();
    function speakTts() {
    if (sc && sc.ttsTimer) { clearTimeout(sc.ttsTimer); sc.ttsTimer = null; }
    if (!synth || !window.SpeechSynthesisUtterance) {
      sc.ttsTimer = setTimeout(fin, est);
      return;
    }
    try {
      synth.cancel();
      var u = new window.SpeechSynthesisUtterance(text);
      u.lang = male ? 'en-GB' : 'en-US';
      u.rate = male ? 1.0 : 0.92;   // Sherlock speaks briskly and crisply
      u.pitch = male ? 0.75 : 1.05; // lower, darker baritone
      var v = pickVoice(male);
      if (v) { u.voice = v; u.lang = v.lang; }
      u.onend = fin;
      u.onerror = fin;
      synth.speak(u);
      sc.ttsTimer = setTimeout(fin, est * 1.8 + 1500);
    } catch (e) { sc.ttsTimer = setTimeout(fin, est); }
    }
  }

  function sceneStop() {
    if (!sc) return;
    var s0 = sc;
    sc = null;
    s0.dead = true;
    if (s0.ttsTimer) clearTimeout(s0.ttsTimer);
    if (s0.timer) clearTimeout(s0.timer);
    if (s0.rec) { try { s0.rec.onend = null; s0.rec.onresult = null; s0.rec.onerror = null; s0.rec.abort(); } catch (e) {} }
    if (s0.ctl) s0.ctl.destroy();
    stopAudio();
    if (synth) { try { synth.cancel(); } catch (e) {} }
  }

  function sceneIntro(ep) {
    stopAll();
    view = function () { sceneIntro(ep); };
    flow(true);
    var ph = ep.phrases.map(function (p) { return '<li><b>' + esc(p.en) + '</b><span>' + esc(lang === 'tr' ? p.tr : '') + '</span></li>'; }).join('');
    show(
      '<p class="eyebrow">' + esc(t('series_card_h')) + '</p>' +
      '<h1>' + esc(t('series_ep', { t: lang === 'tr' ? ep.titleTr : ep.title })) + '</h1>' +
      '<section class="card"><p>' + esc(lang === 'tr' ? ep.blurbTr : ep.blurb) + '</p><p class="hint">' + esc(t('series_intro_hint')) + '</p>' +
        (synth ? '' : '<p class="notice">' + esc(t('series_nosound')) + '</p>') +
        (SR ? '' : '<p class="notice">' + esc(t('notice_nosr')) + '</p>') + '</section>' +
      '<section class="card"><h2>' + esc(t('series_phrases')) + '</h2><ul class="phr">' + ph + '</ul></section>' +
      '<button class="primary" id="scGo">' + esc(t('series_start')) + '</button>' +
      '<div class="row"><button class="ghost" id="scBack">' + esc(t('btn_back')) + '</button></div>'
    );
    on('scGo', function () { scene(ep); });
    on('scBack', home);
  }

  function scene(ep) {
    stopAll();
    flow(true);
    view = function () { scene(ep); };
    show(
      '<p class="eyebrow">' + esc(t('series_ep', { t: lang === 'tr' ? ep.titleTr : ep.title })) + '</p>' +
      '<div class="stage" id="stage"></div>' +
      '<div class="subs" id="subs" aria-live="polite"></div>' +
      '<div class="turn" id="turn"></div>' +
      '<div class="row"><button class="ghost" id="scQuit">' + esc(t('series_quit')) + '</button></div>'
    );
    var reduced = false;
    try { reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
    var me = {
      ep: ep, i: 0, results: [], tries: 0, best: 0, heard: '', dead: false, ttsTimer: null, timer: null, rec: null, spoken: 0,
      ctl: St.mount($('stage'), { reduced: reduced })
    };
    sc = me;
    on('scQuit', home);
    beat();
  }

  function beat() {
    var me = sc;
    if (!me || me.dead) return;
    var b = me.ep.beats[me.i];
    if (!b) { sceneEnd(); return; }
    var stage = $('stage');
    var subs = $('subs');
    var turn = $('turn');
    me.tries = 0; me.best = 0; me.heard = ''; me.spoken = 0;
    if (b.who === 'sherlock') {
      if (stage) stage.classList.remove('mine');
      if (turn) turn.innerHTML = '';
      me.ctl.setMood(b.mood);
      me.ctl.speaking(true);
      if (subs) subs.innerHTML = '<div class="who">Sherlock</div><p class="line">' + esc(b.en) + '</p>' + (lang === 'tr' ? '<p class="tr">' + esc(b.tr) + '</p>' : '');
      speakLine(b.en, true, function () {
        if (!sc || sc.dead || sc !== me) return;
        me.ctl.speaking(false);
        me.timer = setTimeout(function () { me.i++; beat(); }, 380);
      });
      return;
    }
    // your turn
    me.ctl.setMood('listen');
    me.ctl.speaking(false);
    if (stage) stage.classList.add('mine');
    if (subs) subs.innerHTML = '<div class="who">' + esc(t('series_you')) + '</div><p class="line">…</p>';
    yourTurn(b);
  }

  function sayHtml(b, r) {
    var hit = {};
    var miss = {};
    if (r) { r.hit.forEach(function (w) { hit[w] = true; }); r.miss.forEach(function (w) { miss[w] = true; }); }
    return b.en.split(/\s+/).map(function (w) {
      var key = L.normalize(w);
      var c = r ? (miss[key] ? 'miss' : (hit[key] ? 'hit' : '')) : '';
      return '<span class="' + c + '">' + esc(w) + '</span>';
    }).join(' ');
  }

  function yourTurn(b) {
    var me = sc;
    var turn = $('turn');
    if (!turn) return;
    var typed = !SR;
    turn.innerHTML =
      '<section class="card"><b>🎤 ' + esc(t('series_your_turn')) + '</b>' +
      '<p class="hint" style="margin:6px 0 0">' + esc(t('series_say_it')) + '</p>' +
      '<p class="say" id="say">' + sayHtml(b, null) + '</p>' +
      (lang === 'tr' ? '<p class="hint">' + esc(b.tr) + '</p>' : '') +
      '<div id="heard" class="transcript" aria-live="polite"></div><div id="verdict"></div>' +
      (typed ? '<textarea id="scText" placeholder="' + esc(t('series_typed_ph')) + '" aria-label="' + esc(t('series_typed_ph')) + '"></textarea>' : '') +
      '<div class="row" id="scBtns"></div></section>';
    function buttons(state) {
      var h = '<button id="scHear" class="ghost">' + esc(t('series_hear')) + '</button>';
      if (state === 'ready') {
        h += typed ? '<button class="primary" id="scSend">' + esc(t('series_send')) + '</button>' : '<button class="primary" id="scMic">' + esc(t('series_mic')) + '</button>';
        h += '<button class="ghost" id="scSkip">' + esc(t('series_skip')) + '</button>';
      } else if (state === 'listening') {
        h += '<button class="primary" id="scStopRec">' + esc(t('series_done')) + '</button>';
      } else if (state === 'retry') {
        h += '<button id="scMic">' + esc(typed ? t('series_retry') : t('series_retry')) + '</button><button class="primary" id="scNext">' + esc(t('series_next')) + '</button>';
      } else {
        h += '<button class="primary" id="scNext">' + esc(t('series_next')) + '</button>';
      }
      $('scBtns').innerHTML = h;
      on('scHear', function () { if (me.rec) return; speakLine(b.en, false, function () {}); });
      on('scMic', startListen);
      on('scStopRec', function () { if (me.rec) { try { me.rec.stop(); } catch (e) {} } });
      on('scSkip', function () { finish(); });
      on('scNext', function () { finish(); });
      on('scSend', function () {
        var ta = $('scText');
        evaluate(ta ? ta.value : '');
      });
    }
    function finish() {
      if (!sc || sc !== me) return;
      if (me.rec) { try { me.rec.onend = null; me.rec.abort(); } catch (e) {} me.rec = null; }
      if (synth) { try { synth.cancel(); } catch (e) {} }
      me.results.push({ pct: me.best, spoken: me.spoken, miss: me.lastMiss || [] });
      me.i++;
      beat();
    }
    function evaluate(text) {
      if (!sc || sc !== me) return;
      me.rec = null;
      me.tries++;
      var r = Se.scoreLine(b.en, text);
      if (r.pct >= me.best) { me.best = r.pct; me.lastMiss = r.miss; me.spoken = L.countWords(text); }
      var say = $('say');
      if (say) say.innerHTML = sayHtml(b, r);
      var hd = $('heard');
      if (hd) hd.textContent = text ? '“' + text + '”' : '';
      var vd = $('verdict');
      if (vd) vd.innerHTML = '<p class="verdict">' + esc(t('series_v' + r.stars)) + ' <small>%' + r.pct + '</small></p>' +
        (r.miss.length && !r.ok ? '<p class="hint">' + esc(t('series_missed')) + ' ' + esc(r.miss.join(', ')) + '</p>' : '');
      if (r.ok) {
        me.ctl.setMood('happy');
        me.ctl.nod();
        buttons('done');
        me.timer = setTimeout(function () { if (sc === me && !me.dead) finish(); }, 1700);
      } else {
        me.ctl.setMood('think');
        buttons(me.tries >= 2 ? 'done' : 'retry');
      }
    }
    function startListen() {
      if (!sc || sc !== me) return;
      if (synth) { try { synth.cancel(); } catch (e) {} }
      var rec;
      try { rec = new SR(); } catch (e) { typed = true; yourTurn(b); return; }
      me.rec = rec;
      rec.lang = 'en-US';
      rec.continuous = false;
      rec.interimResults = true;
      var text = '';
      var got = false;
      rec.onresult = function (e) {
        var s1 = '';
        for (var k = 0; k < e.results.length; k++) s1 += e.results[k][0].transcript + ' ';
        text = s1.trim();
        got = true;
        var hd = $('heard');
        if (hd) hd.textContent = text;
      };
      rec.onerror = function (e) {
        var code = e && e.error;
        if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture' || code === 'network') {
          if (me.rec === rec) { me.rec = null; typed = true; yourTurn(b); }
        }
      };
      rec.onend = function () {
        if (me.rec !== rec) return;
        me.rec = null;
        if (got) evaluate(text); else { var hd = $('heard'); if (hd) hd.textContent = ''; buttons('ready'); }
      };
      try {
        rec.start();
        var hd0 = $('heard');
        if (hd0) hd0.innerHTML = '<span class="ghost">' + esc(t('series_listening')) + '</span>';
        buttons('listening');
        me.timer = setTimeout(function () { if (me.rec === rec) { try { rec.stop(); } catch (e) {} } }, 12000);
      } catch (e) { me.rec = null; typed = true; yourTurn(b); }
    }
    buttons('ready');
    if (!typed) {
      // small pause so Sherlock's last word is not picked up, then listen straight away
      me.timer = setTimeout(function () { if (sc === me && !me.dead && !me.rec) startListen(); }, 450);
    }
  }

  function sceneEnd() {
    var me = sc;
    if (!me) return;
    var ep = me.ep;
    var results = me.results;
    var sum = Se.summarize(results);
    sceneStop();
    stopAll();
    flow(true);
    testId = 'roleplay';
    var info = commit({ words: Math.max(sum.spoken, 1), hitCount: sum.passed });
    var miss = [];
    results.forEach(function (r) { (r.miss || []).forEach(function (w) { if (w.length >= 4 && miss.indexOf(w) === -1) miss.push(w); }); });
    var added = 0;
    if (miss.length) {
      var before = vocabList();
      var after = N.add(before, miss.slice(0, 5));
      added = after.filter(function (w) { return before.indexOf(w) === -1; }).length;
      store.set('vocab', N.serialize(after));
    }
    var stars = '';
    for (var k = 0; k < 3; k++) stars += k < sum.stars ? '⭐' : '☆';
    var ph = ep.phrases.map(function (p) { return '<li><b>' + esc(p.en) + '</b><span>' + esc(lang === 'tr' ? p.tr : '') + '</span></li>'; }).join('');
    show(
      '<p class="eyebrow">' + esc(t('series_ep', { t: lang === 'tr' ? ep.titleTr : ep.title })) + '</p>' +
      '<h1>' + esc(t('series_end_h')) + '</h1>' +
      '<section class="card center"><p class="stars" aria-hidden="true">' + stars + '</p>' +
        '<p>' + esc(t('series_end_stats', { p: sum.passed, n: sum.total, a: sum.avg })) + '</p></section>' +
      rewardsHtml({ info: info, vocabAdded: added }) +
      '<section class="card"><h2>' + esc(t('series_cliff')) + '</h2><p>' + esc(lang === 'tr' ? ep.cliffTr : ep.cliff) + '</p></section>' +
      '<section class="card"><h2>' + esc(t('series_phrases')) + '</h2><ul class="phr">' + ph + '</ul></section>' +
      '<button class="primary" id="scAgain">' + esc(t('series_replay')) + '</button>' +
      '<div class="row"><button class="ghost" id="scHome">' + esc(t('btn_home')) + '</button></div>'
    );
    paintChrome();
    on('scAgain', function () { scene(ep); });
    on('scHome', home);
  }

  function registerSW() {
    try {
      if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      }
    } catch (e) {}
  }
  function boot2() {
    registerSW();
    paintChrome();
    if (pendingChallenge) { var c = pendingChallenge; pendingChallenge = null; challengeIntro(c); return; }
    if (badHash) {
      badHash = false;
      home();
      var box = document.createElement('div');
      box.className = 'notice';
      box.textContent = t('ch_invalid');
      screen.insertBefore(box, screen.firstChild);
      return;
    }
    home();
  }

  function boot() {
    var h = window.location.hash || '';
    pendingChallenge = Ch.parseHash(h);
    badHash = /^#c=/.test(h) && !pendingChallenge;
    consented = store.get('consent') === String(CFG.consentVersion);
    persist = consented;
    if (!consented) { consent(); return; }
    boot2();
  }
  boot();
})();
