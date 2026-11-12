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

  var api = {
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
