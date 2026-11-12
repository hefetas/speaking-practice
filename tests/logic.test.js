const test = require('node:test');
const assert = require('node:assert');
const L = require('../app/logic.js');

test('dayIndex is 0 on the epoch day', () => {
  assert.strictEqual(L.dayIndex(new Date(2026, 10, 13)), 0);
});

test('dayIndex is stable within a day (00:01 vs 23:59)', () => {
  const a = L.dayIndex(new Date(2026, 10, 20, 0, 1));
  const b = L.dayIndex(new Date(2026, 10, 20, 23, 59));
  assert.strictEqual(a, 7);
  assert.strictEqual(b, 7);
});

test('dayIndex increments by exactly 1 across EU DST change (2027-03-28)', () => {
  const d1 = L.dayIndex(new Date(2027, 2, 27, 12));
  const d2 = L.dayIndex(new Date(2027, 2, 28, 12));
  const d3 = L.dayIndex(new Date(2027, 2, 29, 12));
  assert.strictEqual(d2 - d1, 1);
  assert.strictEqual(d3 - d2, 1);
});

test('pickDaily wraps past the list length', () => {
  const list = ['a', 'b', 'c'];
  assert.strictEqual(L.pickDaily(list, new Date(2026, 10, 13)), 'a');
  assert.strictEqual(L.pickDaily(list, new Date(2026, 10, 16)), 'a');
  assert.strictEqual(L.pickDaily(list, new Date(2026, 10, 17)), 'b');
});

test('pickDaily handles dates before the epoch', () => {
  const list = ['a', 'b', 'c'];
  assert.strictEqual(L.pickDaily(list, new Date(2026, 10, 12)), 'c');
});

test('pickTest never returns the last type', () => {
  const types = ['a', 'b', 'c'];
  for (let i = 0; i < 200; i++) {
    assert.notStrictEqual(L.pickTest(types, 'b', Math.random), 'b');
  }
});

test('pickTest with a single type returns it', () => {
  assert.strictEqual(L.pickTest(['a'], 'a'), 'a');
});

test('pickTest can reach every other type', () => {
  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(L.pickTest(['a', 'b', 'c'], 'b'));
  assert.deepStrictEqual([...seen].sort(), ['a', 'c']);
});

test('normalize lowercases and strips punctuation, keeps apostrophes', () => {
  assert.strictEqual(L.normalize("  I LOVE Figure-out puzzles! Don't you? "), "i love figure out puzzles don't you");
});

test('countWords counts words and handles empty text', () => {
  assert.strictEqual(L.countWords(''), 0);
  assert.strictEqual(L.countWords('   '), 0);
  assert.strictEqual(L.countWords('Hello, big world!'), 3);
});

test('targetHits matches multi-word phrases ignoring case and punctuation', () => {
  const r = L.targetHits('I love Figure-out puzzles!', ['figure out']);
  assert.deepStrictEqual(r.hit, ['figure out']);
  assert.deepStrictEqual(r.missed, []);
});

test('targetHits does not match inside a longer word', () => {
  const r = L.targetHits('category', ['cat']);
  assert.deepStrictEqual(r.hit, []);
  assert.deepStrictEqual(r.missed, ['cat']);
});

test('targetHits on an empty transcript misses everything', () => {
  const r = L.targetHits('', ['a', 'b']);
  assert.deepStrictEqual(r.missed, ['a', 'b']);
});

test('wordsPerMinute is 0 for non-positive seconds and rounds otherwise', () => {
  assert.strictEqual(L.wordsPerMinute(30, 0), 0);
  assert.strictEqual(L.wordsPerMinute(30, -5), 0);
  assert.strictEqual(L.wordsPerMinute(30, 60), 30);
  assert.strictEqual(L.wordsPerMinute(10, 45), 13);
});
