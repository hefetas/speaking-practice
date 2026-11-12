(function (root) {
  'use strict';

  var LEVELS = ['easy', 'medium', 'hard'];
  var MODES = ['daily', 'ielts'];
  var MAX_ROUNDS = 12;
  var MAX_LEN = 2000;

  function cleanNick(s) {
    if (s == null) return '';
    var out = String(s).replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim();
    return out.slice(0, 16).trim();
  }

  function b64encode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64decode(s) {
    var t = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    var bin = atob(t);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }

  function intIn(v, lo, hi) {
    return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi;
  }
  function validDate(k) {
    if (typeof k !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(k)) return false;
    var p = k.split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    return d.getUTCFullYear() === +p[0] && d.getUTCMonth() === +p[1] - 1 && d.getUTCDate() === +p[2];
  }

  function round(o) {
    if (!o || typeof o !== 'object') return null;
    if (!intIn(o.w, 0, 2000) || !intIn(o.u, 0, 2000) || !intIn(o.f, 0, 100)) return null;
    if (!(o.p === null || intIn(o.p, 0, 400))) return null;
    var n = cleanNick(o.n) || 'Misafir';
    return { n: n, w: o.w, u: o.u, p: o.p, f: o.f };
  }

  function clampInt(v, hi) {
    v = Math.floor(Number(v));
    if (!isFinite(v) || v < 0) return 0;
    return Math.min(hi, v);
  }
  // Builds a valid round from raw stats (clamps instead of rejecting).
  function makeRound(o) {
    return {
      n: cleanNick(o.n) || 'Misafir',
      w: clampInt(o.w, 2000),
      u: clampInt(o.u, 2000),
      p: o.p == null ? null : clampInt(o.p, 400),
      f: clampInt(o.f, 100)
    };
  }

  function normalize(o) {
    if (!o || typeof o !== 'object') return null;
    if (!validDate(o.d) || MODES.indexOf(o.m) === -1 || LEVELS.indexOf(o.lv) === -1) return null;
    if (typeof o.t !== 'string' || !/^[a-z0-9]{1,12}$/.test(o.t)) return null;
    if (!intIn(o.i, 0, 99999) || !intIn(o.j, 0, 99999)) return null;
    if (!Array.isArray(o.r) || o.r.length > MAX_ROUNDS) return null;
    var rs = [];
    for (var k = 0; k < o.r.length; k++) {
      var r = round(o.r[k]);
      if (!r) return null;
      rs.push(r);
    }
    return { d: o.d, m: o.m, t: o.t, lv: o.lv, i: o.i, j: o.j, r: rs };
  }

  function encode(ch) {
    var c = normalize(ch);
    if (!c) throw new Error('invalid challenge');
    return b64encode(JSON.stringify({ v: 1, d: c.d, m: c.m, t: c.t, lv: c.lv, i: c.i, j: c.j, r: c.r }));
  }

  function decode(str) {
    if (typeof str !== 'string' || !str || str.length > MAX_LEN || !/^[A-Za-z0-9_\-]+$/.test(str)) return null;
    var o;
    try { o = JSON.parse(b64decode(str)); } catch (e) { return null; }
    if (!o || o.v !== 1) return null;
    return normalize(o);
  }

  function score(r) {
    return Math.max(0, (r.w || 0) + 2 * (r.u || 0) - 3 * (r.f || 0));
  }

  function standings(rounds) {
    var list = rounds.map(function (r, idx) { return { n: r.n, w: r.w, u: r.u, p: r.p, f: r.f, score: score(r), idx: idx }; });
    list.sort(function (a, b) { return b.score - a.score || a.idx - b.idx; });
    var prev = null;
    var rank = 0;
    list.forEach(function (x, i) {
      if (prev === null || x.score !== prev) rank = i + 1;
      x.rank = rank;
      prev = x.score;
    });
    return list;
  }

  function addRound(ch, r) {
    var rs = ch.r.concat([r]);
    if (rs.length > MAX_ROUNDS) {
      var low = 0;
      for (var i = 1; i < rs.length; i++) if (score(rs[i]) < score(rs[low])) low = i;
      rs.splice(low, 1);
    }
    return { d: ch.d, m: ch.m, t: ch.t, lv: ch.lv, i: ch.i, j: ch.j, r: rs };
  }

  function parseHash(h) {
    var m = /^#c=([A-Za-z0-9_\-]+)$/.exec(String(h || ''));
    return m ? decode(m[1]) : null;
  }

  function link(base, ch) { return base + '#c=' + encode(ch); }

  function dailyTestId(ids, key) {
    var p = key.split('-');
    var day = Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
    return ids[((day % ids.length) + ids.length) % ids.length];
  }

  var api = { makeRound: makeRound, cleanNick: cleanNick, b64encode: b64encode, b64decode: b64decode, encode: encode, decode: decode, score: score, standings: standings, addRound: addRound, parseHash: parseHash, link: link, dailyTestId: dailyTestId, validDate: validDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Challenge = api;
})(typeof window !== 'undefined' ? window : globalThis);
