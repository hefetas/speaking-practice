(function (root) {
  'use strict';

  var L = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
    ? require('./logic.js')
    : root.Logic;

  var FILLERS = ['you know', 'i mean', 'sort of', 'kind of', 'basically', 'actually', 'literally', 'um', 'uh', 'erm'];
  var STOP = ('that this with from have been were they them their there what when which would could should will just very really about into than then also your because while where these those some more most other such only even much many make made like want need get got going').split(' ');

  function words(text) {
    var n = L.normalize(text);
    return n ? n.split(' ') : [];
  }

  function fillers(text) {
    var padded = ' ' + L.normalize(text) + ' ';
    var found = {};
    var count = 0;
    FILLERS.forEach(function (f) {
      var needle = ' ' + f + ' ';
      var pos = 0;
      var i;
      var n = 0;
      while ((i = padded.indexOf(needle, pos)) !== -1) {
        n++;
        pos = i + needle.length - 1;
      }
      if (n) { found[f] = n; count += n; }
    });
    return { count: count, found: found };
  }

  function uniqueWords(text) {
    var w = words(text);
    var set = {};
    w.forEach(function (x) { set[x] = true; });
    var unique = Object.keys(set).length;
    return { total: w.length, unique: unique, ratio: w.length ? Math.round((unique / w.length) * 100) : 0 };
  }

  function repeated(text) {
    var counts = {};
    words(text).forEach(function (w) {
      if (w.length >= 4 && STOP.indexOf(w) === -1) counts[w] = (counts[w] || 0) + 1;
    });
    return Object.keys(counts)
      .filter(function (w) { return counts[w] >= 3; })
      .map(function (w) { return { word: w, n: counts[w] }; })
      .sort(function (a, b) { return b.n - a.n || (a.word < b.word ? -1 : 1); })
      .slice(0, 3);
  }

  function paceKey(wpm) {
    if (wpm == null || !(wpm > 0)) return null;
    if (wpm < 90) return 'slow';
    if (wpm <= 160) return 'natural';
    return 'fast';
  }

  function paceLabel(wpm) {
    if (wpm == null || !(wpm > 0)) return null;
    if (wpm < 90) return 'Biraz yavaş';
    if (wpm <= 160) return 'Doğal tempo';
    return 'Hızlı';
  }

  function compare(prev, cur) {
    if (!prev) return null;
    return {
      words: cur.words - prev.words,
      wpm: prev.wpm != null && cur.wpm != null ? cur.wpm - prev.wpm : null,
      unique: cur.unique - prev.unique
    };
  }

  // Share of the passage's distinct words that appear in the transcript.
  function coverage(transcript, passage) {
    var seen = {};
    var pw = [];
    words(passage).forEach(function (w) { if (!seen[w]) { seen[w] = true; pw.push(w); } });
    if (!pw.length) return 0;
    var have = {};
    words(transcript).forEach(function (w) { have[w] = true; });
    var hit = pw.filter(function (w) { return have[w]; }).length;
    return Math.round((hit / pw.length) * 100);
  }

  function analyze(text) {
    var u = uniqueWords(text);
    return { words: u.total, unique: u.unique, ratio: u.ratio, fillers: fillers(text), repeated: repeated(text) };
  }


  // Rule-based grammar tips. Each rule matches a common learner mistake.
  var TIPS = [
    { id: 'amagree', re: /\bi am agree\b/i, good: 'I agree', tr: '“agree” bir fiildir; “am” ile kullanılmaz.', en: '“Agree” is a verb; do not use “am” with it.' },
    { id: 'morebetter', re: /\bmore (better|easier|bigger|faster|cheaper|worse|good)\b/i, good: 'better / easier …', tr: 'Kısa sıfatlarda “more” kullanma; “-er” yeter (better, easier).', en: 'Do not double the comparative: use “better”, not “more better”.' },
    { id: 'hedont', re: /\b(he|she|it) (don't|do not)\b/i, good: "he/she/it doesn't", tr: 'He/she/it ile olumsuz “doesn’t” olur.', en: 'With he/she/it the negative is “doesn’t”.' },
    { id: 'thirds', re: /\b(he|she) (go|like|want|need|work|live|make|think|know|love|have)\b/i, good: 'he goes / she likes …', tr: 'He/she ile şimdiki zamanda fiile -s/-es eklenir.', en: 'Add -s/-es to the verb after he/she in the present simple.' },
    { id: 'didntpast', re: /\bdidn't (went|saw|ate|took|came|made|got|did|had|said|gave|found)\b/i, good: "didn't + base form", tr: '“didn’t” sonrasında fiil yalın hâlde kalır (didn’t go).', en: 'After “didn’t” use the base form (didn’t go).' },
    { id: 'haveyears', re: /\bi have \d{1,2} years?\b(?! of| in| ago)/i, good: 'I am 20 years old', tr: 'Yaş için “I am 20 (years old)” denir, “have” değil.', en: 'Use “I am 20 (years old)”, not “I have 20 years”.' },
    { id: 'manypeople', re: /\bmany people (is|was)\b/i, good: 'many people are', tr: '“people” çoğuldur: are / were.', en: '“People” is plural: are / were.' },
    { id: 'peoples', re: /\bpeoples\b/i, good: 'people', tr: '“people” zaten çoğuldur, -s almaz.', en: '“People” is already plural; no -s.' },
    { id: 'informations', re: /\b(informations|advices|furnitures|knowledges)\b/i, good: 'information / advice', tr: 'Bu kelimeler sayılamaz; çoğul yapılmaz.', en: 'These nouns are uncountable; do not add -s.' },
    { id: 'muchpeople', re: /\bmuch (people|friends|things|books)\b/i, good: 'many people', tr: 'Sayılabilen çoğul isimlerle “many” kullan.', en: 'Use “many” with countable plural nouns.' },
    { id: 'dependof', re: /\bdepends? of\b/i, good: 'depend on', tr: '“depend” ile edat “on” olur.', en: 'The preposition after “depend” is “on”.' },
    { id: 'otherhand', re: /\bin the other hand\b/i, good: 'on the other hand', tr: 'Doğrusu “on the other hand”.', en: 'The correct phrase is “on the other hand”.' },
    { id: 'boring', re: /\bi am boring\b/i, good: 'I am bored', tr: 'Sıkılan kişi “bored”, sıkan şey “boring”dir.', en: 'A person who feels it is “bored”; the thing is “boring”.' },
    { id: 'interesting', re: /\bi am interesting (in|about)\b/i, good: 'I am interested in', tr: 'İlgilenen kişi “interested”, ilgi çeken şey “interesting”dir.', en: 'A person is “interested”; the thing is “interesting”.' },
    { id: 'lookforward', re: /\blook(?:ing)? forward to (meet|see|hear|work)\b/i, good: 'look forward to meeting', tr: '“look forward to” sonrası fiil -ing alır.', en: '“Look forward to” is followed by -ing.' }
  ];

  function tips(text) {
    var t = String(text || '');
    var out = [];
    for (var i = 0; i < TIPS.length && out.length < 3; i++) {
      var m = TIPS[i].re.exec(t);
      if (m) out.push({ id: TIPS[i].id, bad: m[0], good: TIPS[i].good, tr: TIPS[i].tr, en: TIPS[i].en });
    }
    return out;
  }

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  // Rough fluency/vocabulary-based estimate (grammar and pronunciation are not measured).
  function bandEstimate(o) {
    if (!o || !(o.words >= 15)) return null;
    var minutes = (o.seconds || 60) / 60;
    var len = Math.min(1, o.words / (minutes * 110));
    var pace = o.wpm == null ? 0.5 : 1 - Math.min(1, Math.abs(o.wpm - 125) / 90);
    var lex = clamp((o.unique / Math.sqrt(o.words) - 3.5) / 4.5, 0, 1);
    var fl = clamp(1 - ((o.fillers || 0) / o.words) / 0.08, 0, 1);
    var total = 0.35 * len + 0.2 * pace + 0.3 * lex + 0.15 * fl;
    var band = Math.round((3.5 + total * 3.5) * 2) / 2;
    return clamp(band, 3.5, 7);
  }

  var api = { paceKey: paceKey, tips: tips, bandEstimate: bandEstimate,
    fillers: fillers,
    uniqueWords: uniqueWords,
    repeated: repeated,
    paceLabel: paceLabel,
    compare: compare,
    coverage: coverage,
    analyze: analyze
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Analysis = api;
})(typeof window !== 'undefined' ? window : globalThis);
