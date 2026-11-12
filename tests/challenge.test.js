const test = require('node:test');
const assert = require('node:assert');
const Ch = require('../app/challenge.js');

const base = { d: '2026-11-13', m: 'daily', t: 'free', lv: 'medium', i: 12, j: 3, r: [] };

test('cleanNick keeps letters/digits, trims, caps at 16, strips symbols', () => {
  assert.strictEqual(Ch.cleanNick('  Efe_Taş  '), 'Efe_Taş');
  assert.strictEqual(Ch.cleanNick('<b>x</b>'), 'bxb');
  assert.strictEqual(Ch.cleanNick('a'.repeat(40)).length, 16);
  assert.strictEqual(Ch.cleanNick('   '), '');
  assert.strictEqual(Ch.cleanNick(null), '');
});

test('encode/decode round-trips a challenge, unicode nicknames included', () => {
  const ch = { ...base, r: [{ n: 'Efe', w: 80, u: 50, p: 120, f: 2 }, { n: 'Şeyma', w: 60, u: 40, p: null, f: 0 }] };
  assert.deepStrictEqual(Ch.decode(Ch.encode(ch)), ch);
});

test('decode rejects garbage, wrong version, bad fields and oversized input', () => {
  assert.strictEqual(Ch.decode('%%%'), null);
  assert.strictEqual(Ch.decode(''), null);
  assert.strictEqual(Ch.decode(null), null);
  assert.strictEqual(Ch.decode('x'.repeat(5000)), null);
  const enc = (o) => Ch.b64encode(JSON.stringify(o));
  assert.strictEqual(Ch.decode(enc({ v: 2, ...base })), null);
  assert.strictEqual(Ch.decode(enc({ v: 1, ...base, d: '2026-13-45' })), null);
  assert.strictEqual(Ch.decode(enc({ v: 1, ...base, m: 'evil' })), null);
  assert.strictEqual(Ch.decode(enc({ v: 1, ...base, t: '<script>' })), null);
  assert.strictEqual(Ch.decode(enc({ v: 1, ...base, lv: 'god' })), null);
  assert.strictEqual(Ch.decode(enc({ v: 1, ...base, r: [{ n: 'a', w: -5, u: 1, p: 1, f: 0 }] })), null);
  assert.strictEqual(Ch.decode(enc({ v: 1, ...base, r: new Array(13).fill({ n: 'a', w: 1, u: 1, p: 1, f: 0 }) })), null);
});

test('decode sanitizes nicknames so markup cannot ride in a link', () => {
  const enc = Ch.b64encode(JSON.stringify({ v: 1, ...base, r: [{ n: '<img src=x onerror=alert(1)>', w: 10, u: 8, p: 100, f: 0 }] }));
  const out = Ch.decode(enc);
  assert.ok(out && !/[<>=()]/.test(out.r[0].n));
});

test('score rewards words and variety and penalizes fillers, never negative', () => {
  assert.ok(Ch.score({ w: 80, u: 50, f: 0 }) > Ch.score({ w: 80, u: 30, f: 0 }));
  assert.ok(Ch.score({ w: 80, u: 50, f: 0 }) > Ch.score({ w: 80, u: 50, f: 5 }));
  assert.strictEqual(Ch.score({ w: 3, u: 2, f: 50 }), 0);
});

test('standings sorts by score and gives ties the same rank', () => {
  const s = Ch.standings([{ n: 'a', w: 10, u: 10, p: 1, f: 0 }, { n: 'b', w: 50, u: 40, p: 1, f: 0 }, { n: 'c', w: 10, u: 10, p: 1, f: 0 }]);
  assert.deepStrictEqual(s.map(x => x.n), ['b', 'a', 'c']);
  assert.deepStrictEqual(s.map(x => x.rank), [1, 2, 2]);
});

test('addRound appends, keeps at most 12 by dropping the lowest, and never mutates', () => {
  const ch = { ...base, r: [] };
  const next = Ch.addRound(ch, { n: 'Efe', w: 10, u: 8, p: 100, f: 0 });
  assert.strictEqual(ch.r.length, 0);
  assert.strictEqual(next.r.length, 1);
  let big = next;
  for (let i = 0; i < 14; i++) big = Ch.addRound(big, { n: 'p' + i, w: 10 + i, u: 8, p: 100, f: 0 });
  assert.strictEqual(big.r.length, 12);
  assert.ok(big.r.some(x => x.n === 'p13'), 'best round dropped');
});

test('parseHash reads #c=... and ignores anything else', () => {
  const ch = { ...base, r: [] };
  assert.deepStrictEqual(Ch.parseHash('#c=' + Ch.encode(ch)), ch);
  assert.strictEqual(Ch.parseHash('#other'), null);
  assert.strictEqual(Ch.parseHash(''), null);
  assert.ok(Ch.link('https://x.test/app/', ch).startsWith('https://x.test/app/#c='));
});

test('dailyTestId is stable per date and moves between days', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  assert.strictEqual(Ch.dailyTestId(ids, '2026-11-13'), Ch.dailyTestId(ids, '2026-11-13'));
  assert.notStrictEqual(Ch.dailyTestId(ids, '2026-11-13'), Ch.dailyTestId(ids, '2026-11-14'));
  assert.ok(ids.includes(Ch.dailyTestId(ids, '2026-11-13')));
});

test('makeRound clamps out-of-range stats so a fast burst can never break link creation', () => {
  const r = Ch.makeRound({ n: '  Efe ', w: 5000, u: 3000, p: 900, f: 400 });
  assert.deepStrictEqual(r, { n: 'Efe', w: 2000, u: 2000, p: 400, f: 100 });
  assert.strictEqual(Ch.makeRound({ n: '', w: 3.7, u: 2, p: null, f: 0 }).n, 'Misafir');
  assert.strictEqual(Ch.makeRound({ n: 'a', w: 3.7, u: 2, p: null, f: 0 }).w, 3);
  assert.doesNotThrow(() => Ch.encode(Ch.addRound({ d: '2026-11-13', m: 'daily', t: 'free', lv: 'medium', i: 1, j: 1, r: [] }, Ch.makeRound({ n: 'x', w: 20, u: 15, p: 700, f: 0 }))));
});
