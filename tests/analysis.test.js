const test = require('node:test');
const assert = require('node:assert');
const A = require('../app/analysis.js');

test('fillers counts whole filler phrases, not substrings', () => {
  const r = A.fillers("Well, you know, I mean, it's kind of basically um good. I have an umbrella.");
  assert.strictEqual(r.count, 5);
  assert.strictEqual(r.found['you know'], 1);
  assert.strictEqual(r.found['um'], 1);
});
test('fillers on empty text', () => {
  assert.deepStrictEqual(A.fillers(''), { count: 0, found: {} });
});

test('uniqueWords reports total, unique and ratio', () => {
  const r = A.uniqueWords('the cat and the dog and the bird');
  assert.deepStrictEqual([r.total, r.unique, r.ratio], [8, 5, 63]);
  assert.deepStrictEqual(A.uniqueWords(''), { total: 0, unique: 0, ratio: 0 });
});

test('repeated lists content words used 3+ times, most frequent first', () => {
  const r = A.repeated('travel is fun and travel is good because travel helps me and the people people people people');
  assert.deepStrictEqual(r, [{ word: 'people', n: 4 }, { word: 'travel', n: 3 }]);
});

test('paceLabel bands', () => {
  assert.strictEqual(A.paceLabel(null), null);
  assert.strictEqual(A.paceLabel(0), null);
  assert.strictEqual(A.paceLabel(60), 'Biraz yavaş');
  assert.strictEqual(A.paceLabel(120), 'Doğal tempo');
  assert.strictEqual(A.paceLabel(190), 'Hızlı');
});

test('compare gives deltas, null without a previous attempt, null wpm when typed', () => {
  assert.strictEqual(A.compare(null, { words: 10, wpm: 50, unique: 8 }), null);
  assert.deepStrictEqual(A.compare({ words: 10, wpm: 50, unique: 8 }, { words: 24, wpm: 61, unique: 15 }), { words: 14, wpm: 11, unique: 7 });
  assert.strictEqual(A.compare({ words: 10, wpm: null, unique: 8 }, { words: 24, wpm: 61, unique: 15 }).wpm, null);
});

test('coverage is the share of passage words found in the transcript', () => {
  assert.strictEqual(A.coverage('hello big world', 'Hello, big world!'), 100);
  assert.strictEqual(A.coverage('hello world', 'Hello big world today'), 50);
  assert.strictEqual(A.coverage('anything', ''), 0);
});

test('analyze bundles the pieces', () => {
  const r = A.analyze('I like travel and I like food');
  assert.strictEqual(r.words, 7);
  assert.strictEqual(r.unique, 5);
  assert.strictEqual(r.fillers.count, 0);
});
