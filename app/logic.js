(function (root) {
  'use strict';

  var DEFAULT_EPOCH = new Date(2026, 10, 13);

  // Whole local calendar days since epoch. Uses UTC of local Y/M/D parts so DST never skews it.
  function dayIndex(date, epoch) {
    var e = epoch || DEFAULT_EPOCH;
    var a = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    var b = Date.UTC(e.getFullYear(), e.getMonth(), e.getDate());
    return Math.round((a - b) / 86400000);
  }

  function pickDaily(list, date) {
    var n = list.length;
    return list[((dayIndex(date) % n) + n) % n];
  }

  function pickTest(types, last, rand) {
    var r = rand || Math.random;
    var pool = types.length > 1 ? types.filter(function (t) { return t !== last; }) : types;
    var i = Math.min(pool.length - 1, Math.floor(r() * pool.length));
    return pool[i];
  }

  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9'À-ɏ\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function countWords(text) {
    var n = normalize(text);
    return n ? n.split(' ').length : 0;
  }

  function targetHits(transcript, targets) {
    var padded = ' ' + normalize(transcript) + ' ';
    var hit = [];
    var missed = [];
    targets.forEach(function (t) {
      var needle = ' ' + normalize(t) + ' ';
      (padded.indexOf(needle) !== -1 ? hit : missed).push(t);
    });
    return { hit: hit, missed: missed };
  }

  function wordsPerMinute(wordCount, seconds) {
    if (!(seconds > 0)) return 0;
    return Math.round((wordCount / seconds) * 60);
  }

  var api = {
    dayIndex: dayIndex,
    pickDaily: pickDaily,
    pickTest: pickTest,
    normalize: normalize,
    countWords: countWords,
    targetHits: targetHits,
    wordsPerMinute: wordsPerMinute
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Logic = api;
})(typeof window !== 'undefined' ? window : globalThis);
