(function (root) {
  'use strict';

  var PASSPORT_IDS = ['free', 'describe', 'opinion', 'story', 'targets', 'roleplay', 'repeat', 'rapid', 'shadow', 'twister', 'pitch', 'scene', 'pairs'];

  function parseKey(k) {
    var p = String(k).split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }
  // Whole calendar days from key a to key b ('YYYY-MM-DD').
  function daysBetween(a, b) {
    return Math.round((parseKey(b) - parseKey(a)) / 86400000);
  }

  // s = {last, streak, freeze}; returns the new state plus `used` (a freeze was spent).
  function nextStreak(s, key) {
    var last = s.last;
    var streak = s.streak || 0;
    var freeze = s.freeze || 0;
    var used = false;
    if (last === key) return { last: last, streak: streak, freeze: freeze, used: false };
    if (last) {
      var gap = daysBetween(last, key);
      if (gap < 0) return { last: last, streak: streak, freeze: freeze, used: false };
      if (gap === 1) streak += 1;
      else if (gap === 2 && freeze > 0) { streak += 1; freeze -= 1; used = true; }
      else streak = 1;
    } else {
      streak = 1;
    }
    if (streak % 7 === 0) freeze = Math.min(2, freeze + 1);
    return { last: key, streak: streak, freeze: freeze, used: used };
  }

  // The streak to display on day `key`.
  function streakAlive(s, key) {
    if (!s.last) return 0;
    var gap = daysBetween(s.last, key);
    if (gap <= 1) return s.streak || 0;
    if (gap === 2 && (s.freeze || 0) > 0) return s.streak || 0;
    return 0;
  }

  function xpFor(r) {
    if (!r || !(r.words > 0)) return 0;
    return 10 + Math.floor(Math.min(r.words, 120) / 6) + 2 * (r.hits || 0);
  }

  var RANKS = [
    { xp: 0, title: 'Sessiz' },
    { xp: 80, title: 'Mırıldanan' },
    { xp: 200, title: 'Sohbetçi' },
    { xp: 450, title: 'Konuşkan' },
    { xp: 800, title: 'Hatip' },
    { xp: 1500, title: 'Usta Hatip' }
  ];

  function rankFor(xp) {
    var idx = 0;
    for (var i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) idx = i;
    var cur = RANKS[idx];
    var next = RANKS[idx + 1] || null;
    var into = xp - cur.xp;
    return {
      title: cur.title,
      index: idx,
      next: next ? next.title : null,
      xpInto: into,
      xpNeeded: next ? next.xp - cur.xp : null,
      frac: next ? into / (next.xp - cur.xp) : 1
    };
  }

  var BADGES = [
    { id: 'first', title: 'İlk Söz', emoji: '🌱', desc: 'İlk testini bitir', test: function (s) { return s.done >= 1; } },
    { id: 'streak3', title: '3 Günlük Seri', emoji: '🔥', desc: '3 gün üst üste pratik yap', test: function (s) { return s.bestStreak >= 3; } },
    { id: 'streak7', title: 'Haftalık Seri', emoji: '🏅', desc: '7 gün üst üste pratik yap', test: function (s) { return s.bestStreak >= 7; } },
    { id: 'words100', title: '100 Kelime', emoji: '💬', desc: 'Toplam 100 kelime konuş', test: function (s) { return s.words >= 100; } },
    { id: 'words500', title: '500 Kelime', emoji: '🗣️', desc: 'Toplam 500 kelime konuş', test: function (s) { return s.words >= 500; } },
    { id: 'passport', title: 'Tam Pasaport', emoji: '🛂', desc: '13 günlük test türünün hepsini dene', test: function (s) {
      return PASSPORT_IDS.every(function (id) { return s.stamps.indexOf(id) !== -1; });
    } },
    { id: 'ielts', title: 'IELTS Denemesi', emoji: '🎓', desc: 'Bir IELTS Speaking testi bitir', test: function (s) {
      return s.stamps.some(function (x) { return /^ielts/.test(x); });
    } },
    { id: 'rapid', title: 'Hız Ustası', emoji: '⚡', desc: 'Bir hız turu bitir', test: function (s) { return s.stamps.indexOf('rapid') !== -1; } },
    { id: 'shadow', title: 'Gölge Okuyucu', emoji: '👥', desc: 'Bir gölgeleme testi bitir', test: function (s) { return s.stamps.indexOf('shadow') !== -1; } },
    { id: 'week', title: 'Haftanın Yıldızı', emoji: '⭐', desc: 'Bir haftalık görevi tamamla', test: function (s) { return s.weeksDone >= 1; } }
  ];

  function badgesFor(state) {
    return BADGES.map(function (b) {
      return { id: b.id, title: b.title, emoji: b.emoji, desc: b.desc, earned: !!b.test(state) };
    });
  }

  var CHALLENGES = [
    { id: 'types3', titleTr: '3 farklı test türünü dene', target: 3, metric: 'types' },
    { id: 'words150', titleTr: 'Bu hafta toplam 150 kelime konuş', target: 150, metric: 'words' },
    { id: 'days4', titleTr: '4 farklı günde pratik yap', target: 4, metric: 'days' },
    { id: 'rapid2', titleTr: 'Hız turunu 2 kez bitir', target: 2, metric: 'rapid' },
    { id: 'tests6', titleTr: 'Bu hafta 6 test bitir', target: 6, metric: 'tests' }
  ];
  var CHALLENGE_EPOCH = '2026-11-09'; // a Monday

  function challengeFor(weekKey) {
    var n = Math.floor(daysBetween(CHALLENGE_EPOCH, weekKey) / 7);
    var len = CHALLENGES.length;
    return CHALLENGES[((n % len) + len) % len];
  }

  function emptyWeek(key) {
    return { key: key, types: [], words: 0, days: [], rapid: 0, tests: 0, claimed: false };
  }

  function updateWeek(wk, weekKey, r) {
    var w = wk && wk.key === weekKey
      ? { key: wk.key, types: wk.types.slice(), words: wk.words, days: wk.days.slice(), rapid: wk.rapid, tests: wk.tests, claimed: !!wk.claimed }
      : emptyWeek(weekKey);
    if (w.types.indexOf(r.type) === -1) w.types.push(r.type);
    if (w.days.indexOf(r.dayKey) === -1) w.days.push(r.dayKey);
    w.words += r.words || 0;
    w.tests += 1;
    if (r.type === 'rapid') w.rapid += 1;
    return w;
  }

  function challengeProgress(ch, wk) {
    var v = { types: wk.types ? wk.types.length : 0, words: wk.words || 0, days: wk.days ? wk.days.length : 0, rapid: wk.rapid || 0, tests: wk.tests || 0 }[ch.metric] || 0;
    return Math.min(ch.target, v);
  }

  function claimWeek(ch, wk) {
    if (!wk.claimed && challengeProgress(ch, wk) >= ch.target) {
      return { wk: Object.assign({}, wk, { claimed: true }), bonus: 50 };
    }
    return { wk: wk, bonus: 0 };
  }

  var api = {
    PASSPORT_IDS: PASSPORT_IDS,
    RANKS: RANKS,
    CHALLENGES: CHALLENGES,
    daysBetween: daysBetween,
    nextStreak: nextStreak,
    streakAlive: streakAlive,
    xpFor: xpFor,
    rankFor: rankFor,
    badgesFor: badgesFor,
    challengeFor: challengeFor,
    emptyWeek: emptyWeek,
    updateWeek: updateWeek,
    challengeProgress: challengeProgress,
    claimWeek: claimWeek
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Progress = api;
})(typeof window !== 'undefined' ? window : globalThis);
