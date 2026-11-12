(function (root) {
  'use strict';

  function norm(w) { return String(w).toLowerCase().replace(/[|,<>]/g, ' ').replace(/\s+/g, ' ').trim(); }

  // Newest first, case-insensitive dedupe, capped.
  function add(list, words, max) {
    var cap = max || 60;
    var seen = {};
    var out = [];
    words.map(norm).reverse().concat(list.map(norm)).forEach(function (w) {
      if (!w || seen[w]) return;
      seen[w] = true;
      out.push(w);
    });
    return out.slice(0, cap);
  }

  function remove(list, word) {
    var n = norm(word);
    return list.filter(function (w) { return norm(w) !== n; });
  }
  function serialize(list) { return list.join('|'); }
  function parse(s) {
    if (!s) return [];
    return String(s).split('|').map(norm).filter(Boolean);
  }

  var api = { add: add, remove: remove, serialize: serialize, parse: parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Notebook = api;
})(typeof window !== 'undefined' ? window : globalThis);
