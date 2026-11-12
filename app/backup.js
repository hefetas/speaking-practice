(function (root) {
  'use strict';

  var Ch = (typeof module !== 'undefined' && module.exports && typeof require === 'function') ? require('./challenge.js') : root.Challenge;

  var NUM = ['done', 'words', 'xp', 'bestStreak', 'streak', 'freeze', 'weeksDone'];
  var KEYS = NUM.concat(['streakLast', 'stamps', 'days', 'tc', 'wk', 'vocab', 'nick', 'lang', 'level', 'mode', 'audio', 'remind']);
  var MAX_VAL = 4000;
  var DATE = /^\d{4}-\d{2}-\d{2}$/;

  function fnv(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  function allowedKey(k) { return KEYS.indexOf(k) !== -1 || /^prev_[a-z0-9]{1,12}$/.test(k); }

  function pack(state) {
    var out = {};
    Object.keys(state || {}).forEach(function (k) {
      if (allowedKey(k) && typeof state[k] === 'string' && state[k].length <= MAX_VAL) out[k] = state[k];
    });
    var body = Ch.b64encode(JSON.stringify(out));
    return 'KNS1.' + body + '.' + fnv(body);
  }

  function validJSON(v) {
    try { var o = JSON.parse(v); return o && typeof o === 'object'; } catch (e) { return false; }
  }

  function validValue(k, v) {
    if (NUM.indexOf(k) !== -1) return /^\d{1,9}$/.test(v);
    if (k === 'streakLast') return DATE.test(v) && Ch.validDate(v);
    if (k === 'days') return v === '' || v.split(',').every(function (x) { return DATE.test(x) && Ch.validDate(x); });
    if (k === 'stamps') return /^[a-z0-9]{1,12}(,[a-z0-9]{1,12})*$/.test(v) || v === '';
    if (k === 'tc') return /^\d{4}-\d{2}-\d{2}:\d{1,4}$/.test(v);
    if (k === 'wk' || /^prev_/.test(k)) return validJSON(v);
    if (k === 'lang') return v === 'tr' || v === 'en';
    if (k === 'level') return ['easy', 'medium', 'hard'].indexOf(v) !== -1;
    if (k === 'mode') return v === 'daily' || v === 'ielts';
    if (k === 'audio') return v === '0' || v === '1';
    if (k === 'remind') return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
    if (k === 'vocab') return v.length <= MAX_VAL && !/[<>]/.test(v);
    return true;
  }

  function unpack(code) {
    if (typeof code !== 'string') return null;
    var m = /^KNS1\.([A-Za-z0-9_\-]+)\.([0-9a-f]{8})$/.exec(code.trim());
    if (!m || fnv(m[1]) !== m[2]) return null;
    var o;
    try { o = JSON.parse(Ch.b64decode(m[1])); } catch (e) { return null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    var out = {};
    var keys = Object.keys(o);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = o[k];
      if (!allowedKey(k) || typeof v !== 'string' || v.length > MAX_VAL) return null;
      if (k === 'nick') { out.nick = Ch.cleanNick(v); continue; }
      if (!validValue(k, v)) return null;
      out[k] = v;
    }
    return out;
  }

  var api = { KEYS: KEYS, pack: pack, unpack: unpack, allowedKey: allowedKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Backup = api;
})(typeof window !== 'undefined' ? window : globalThis);
