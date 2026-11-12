(function (root) {
  'use strict';

  var L = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
    ? require('./logic.js')
    : root.Logic;

  // Original scripts. The characters (Sherlock Holmes, his friend) come from Arthur Conan Doyle's
  // public-domain stories; every line of dialogue, the plot and all artwork are our own.
  function S(mood, en, tr) { return { who: 'sherlock', mood: mood, en: en, tr: tr }; }
  function Y(en, tr) { return { who: 'you', en: en, tr: tr }; }

  var EPISODES = [
    {
      id: 'e1',
      title: 'The Missing Yogurt',
      titleTr: 'Kayıp Yoğurt',
      blurb: 'Sherlock is your flatmate. Someone ate his last strawberry yogurt. Can you help him solve the case?',
      blurbTr: 'Sherlock senin ev arkadaşın. Biri son çilekli yoğurdunu yemiş. Vakayı çözmesine yardım edebilir misin?',
      cliff: 'Tomorrow: the neighbor opens the door… and she is holding an empty yogurt pot!',
      cliffTr: 'Yarın: Komşu kapıyı açıyor… ve elinde boş bir yoğurt kabı var!',
      phrases: [
        { en: 'Do not touch anything', tr: 'Hiçbir şeye dokunma' },
        { en: 'What happened', tr: 'Ne oldu?' },
        { en: 'in a hurry', tr: 'aceleyle' },
        { en: 'spare key', tr: 'yedek anahtar' },
        { en: 'at midnight', tr: 'gece yarısı' },
        { en: 'I promise', tr: 'söz veriyorum' }
      ],
      beats: [
        S('excited', 'Good morning! Do not touch anything. We have a case!', 'Günaydın! Hiçbir şeye dokunma. Bir vakamız var!'),
        Y('A case? What happened?', 'Bir vaka mı? Ne oldu?'),
        S('angry', 'Someone ate my strawberry yogurt last night. It was the last one.', 'Dün gece biri çilekli yoğurdumu yedi. Sonuncusuydu.'),
        Y('Maybe you ate it yourself and forgot.', 'Belki kendin yedin ve unuttun.'),
        S('think', 'Impossible. I never forget yogurt. Now, look at this spoon in the sink.', 'İmkânsız. Yoğurdu asla unutmam. Şimdi lavabodaki şu kaşığa bak.'),
        Y('It is only a spoon. Why is it important?', 'Sadece bir kaşık. Neden önemli?'),
        S('think', 'It is clean, but there is a small pink drop on it. Someone washed it in a hurry.', 'Temiz ama üstünde küçük pembe bir damla var. Biri aceleyle yıkamış.'),
        Y('Maybe it was our neighbor. She has a spare key.', 'Belki komşumuzdu. Onda yedek anahtar var.'),
        S('suspicious', 'Interesting. And where were you at midnight?', 'İlginç. Peki sen gece yarısı neredeydin?'),
        Y('I was asleep. I went to bed at ten, I promise.', 'Uyuyordum. Saat ona yattım, söz veriyorum.'),
        S('shock', 'Hmm. Then why is there a pink spot on your sleeve?', 'Hmm. O zaman kolunda neden pembe bir leke var?'),
        Y('That is jam! It is not yogurt!', 'O reçel! Yoğurt değil!'),
        S('happy', 'We will see. Tomorrow we visit the neighbor. Bring your key!', 'Göreceğiz. Yarın komşuyu ziyaret ediyoruz. Anahtarını getir!')
      ]
    }
  ];

  var NUM = { 0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten',
    11: 'eleven', 12: 'twelve', 13: 'thirteen', 14: 'fourteen', 15: 'fifteen', 16: 'sixteen', 17: 'seventeen', 18: 'eighteen', 19: 'nineteen', 20: 'twenty' };

  // Speech recognition returns contractions and digits; our scripts spell everything out.
  function expand(text) {
    var s = String(text || '').replace(/[’‘]/g, "'").toLowerCase();
    s = s.replace(/\bcan't\b/g, 'can not').replace(/\bwon't\b/g, 'will not').replace(/\bcannot\b/g, 'can not')
      .replace(/n't\b/g, ' not')
      .replace(/\b(it|that|he|she|there|what|who|here|let)'s\b/g, '$1 is')
      .replace(/'m\b/g, ' am').replace(/'re\b/g, ' are').replace(/'ve\b/g, ' have').replace(/'ll\b/g, ' will').replace(/'d\b/g, ' would');
    return L.normalize(s).split(' ').filter(Boolean).map(function (w) {
      return /^\d+$/.test(w) && NUM[+w] ? NUM[+w] : w;
    });
  }

  function starsFor(pct) { return pct >= 90 ? 3 : (pct >= 75 ? 2 : (pct >= 60 ? 1 : 0)); }

  function scoreLine(expected, heard) {
    var want = [];
    var seen = {};
    expand(expected).forEach(function (w) { if (!seen[w]) { seen[w] = true; want.push(w); } });
    var have = {};
    expand(heard).forEach(function (w) { have[w] = true; });
    var miss = want.filter(function (w) { return !have[w]; });
    var pct = want.length ? Math.round(((want.length - miss.length) / want.length) * 100) : 0;
    return { pct: pct, ok: pct >= 60, stars: starsFor(pct), miss: miss, hit: want.filter(function (w) { return have[w]; }) };
  }

  function summarize(results) {
    if (!results || !results.length) return { avg: 0, passed: 0, spoken: 0, stars: 0, total: 0 };
    var sum = 0, passed = 0, spoken = 0;
    results.forEach(function (r) { sum += r.pct; if (r.pct >= 60) passed++; spoken += r.spoken || 0; });
    var avg = Math.round(sum / results.length);
    return { avg: avg, passed: passed, spoken: spoken, stars: starsFor(avg), total: results.length };
  }

  function get(id) {
    for (var i = 0; i < EPISODES.length; i++) if (EPISODES[i].id === id) return EPISODES[i];
    return null;
  }

  function episodeFor(dateKey) {
    var p = String(dateKey).split('-');
    var days = Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
    return EPISODES[((days % EPISODES.length) + EPISODES.length) % EPISODES.length];
  }

  var api = { EPISODES: EPISODES, expand: expand, starsFor: starsFor, scoreLine: scoreLine, summarize: summarize, get: get, episodeFor: episodeFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Series = api;
})(typeof window !== 'undefined' ? window : globalThis);
