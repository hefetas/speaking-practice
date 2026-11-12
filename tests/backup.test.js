const test = require('node:test');
const assert = require('node:assert');
const B = require('../app/backup.js');

const state = { done: '5', words: '320', xp: '90', streak: '3', streakLast: '2026-11-13', stamps: 'free,rapid', days: '2026-11-12,2026-11-13', nick: 'Efe', lang: 'tr', wk: '{"key":"2026-11-09","types":["free"],"words":10,"days":[],"rapid":0,"tests":1,"claimed":false}', prev_free: '{"words":20,"wpm":100,"unique":15}' };

test('pack/unpack round-trips whitelisted state', () => {
  assert.deepStrictEqual(B.unpack(B.pack(state)), state);
});

test('pack drops non-whitelisted keys (consent, audio blobs, anything else)', () => {
  const out = B.unpack(B.pack({ ...state, consent: '1', secret: 'x', 'evil key': 'y' }));
  assert.ok(!('consent' in out) && !('secret' in out) && !('evil key' in out));
});

test('unpack tolerates whitespace and rejects tampering, bad prefix and junk', () => {
  const code = B.pack(state);
  assert.ok(B.unpack('  ' + code + '\n'));
  assert.strictEqual(B.unpack(code.slice(0, -1) + (code.slice(-1) === 'a' ? 'b' : 'a')), null);
  assert.strictEqual(B.unpack('nope'), null);
  assert.strictEqual(B.unpack(''), null);
  assert.strictEqual(B.unpack(null), null);
  assert.strictEqual(B.unpack(code.replace('KNS1.', 'KNS9.')), null);
});

test('unpack validates values: numbers, dates, stamp ids, JSON blobs, nick', () => {
  const bad = (o) => assert.strictEqual(B.unpack(B.pack(o)), null, JSON.stringify(o));
  bad({ xp: 'abc' });
  bad({ xp: '99999999999' });
  bad({ streakLast: '13/11/2026' });
  bad({ stamps: 'free,<script>' });
  bad({ days: '2026-11-12,hello' });
  bad({ wk: '{not json' });
  bad({ lang: 'fr' });
  const out = B.unpack(B.pack({ nick: '<b>Efe</b>' }));
  assert.ok(out && !/[<>]/.test(out.nick));
});
