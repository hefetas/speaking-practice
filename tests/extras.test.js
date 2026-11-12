const test = require('node:test');
const assert = require('node:assert');
const N = require('../app/notebook.js');
const Ics = require('../app/ics.js');
const A = require('../app/analysis.js');

test('notebook: add dedupes case-insensitively, newest first, caps size', () => {
  let l = N.add([], ['Itinerary', 'pack']);
  assert.deepStrictEqual(l, ['pack', 'itinerary']);
  l = N.add(l, ['PACK', 'souvenir']);
  assert.deepStrictEqual(l, ['souvenir', 'pack', 'itinerary']);
  const many = N.add([], Array.from({ length: 80 }, (_, i) => 'w' + i), 60);
  assert.strictEqual(many.length, 60);
});

test('notebook: remove, parse and serialize survive multi-word entries', () => {
  const l = ['wake up', 'pack', 'get ready'];
  assert.deepStrictEqual(N.parse(N.serialize(l)), l);
  assert.deepStrictEqual(N.remove(l, 'PACK'), ['wake up', 'get ready']);
  assert.deepStrictEqual(N.parse(null), []);
  assert.deepStrictEqual(N.parse('a||b|'), ['a', 'b']);
});

test('ics: daily recurring event with CRLF lines and an alarm', () => {
  const s = Ics.make({ time: '20:30', startKey: '2026-11-14', summary: 'Konuş; pratik, zamanı' });
  assert.ok(s.startsWith('BEGIN:VCALENDAR\r\n') && s.trim().endsWith('END:VCALENDAR'));
  assert.ok(s.includes('DTSTART:20261114T203000'));
  assert.ok(s.includes('RRULE:FREQ=DAILY'));
  assert.ok(s.includes('BEGIN:VALARM'));
  assert.ok(s.includes('SUMMARY:Konuş\; pratik\\, zamanı'));
  assert.ok(!/\n(?<!\r)/.test(s.replace(/\r\n/g, '')), 'bare LF found');
});

test('ics: invalid time falls back to 20:00', () => {
  assert.ok(Ics.make({ time: '99:99', startKey: '2026-11-14', summary: 'x' }).includes('T200000'));
  assert.ok(Ics.validTime('07:05') && !Ics.validTime('7:5'));
});

test('tips: catches common mistakes with the matched text and a fix', () => {
  const t = A.tips('I am agree with you and he don\'t like peoples');
  const ids = t.map(x => x.id);
  assert.ok(ids.includes('amagree'));
  assert.ok(t.length <= 3);
  assert.strictEqual(t.find(x => x.id === 'amagree').good, 'I agree');
});

test('tips: clean text and valid constructions give nothing', () => {
  assert.deepStrictEqual(A.tips('I agree with you. She would go there. I have 5 years of experience.'), []);
  assert.deepStrictEqual(A.tips(''), []);
});

test('tips: flags "much people", "depend of", "on the other hand" typo and "I have 20 years"', () => {
  const ids = (s) => A.tips(s).map(x => x.id);
  assert.ok(ids('much people like it').includes('muchpeople'));
  assert.ok(ids('it depend of the weather').includes('dependof'));
  assert.ok(ids('in the other hand it is fine').includes('otherhand'));
  assert.ok(ids('I have 20 years').includes('haveyears'));
});

test('bandEstimate: null for tiny samples, bounded and half-step, monotone with quality', () => {
  assert.strictEqual(A.bandEstimate({ words: 5, seconds: 60, wpm: 80, unique: 5, fillers: 0 }), null);
  const weak = A.bandEstimate({ words: 30, seconds: 60, wpm: 40, unique: 15, fillers: 6 });
  const strong = A.bandEstimate({ words: 150, seconds: 90, wpm: 125, unique: 100, fillers: 1 });
  assert.ok(strong > weak, strong + ' vs ' + weak);
  [weak, strong].forEach(b => { assert.ok(b >= 3.5 && b <= 7); assert.strictEqual((b * 2) % 1, 0); });
});
