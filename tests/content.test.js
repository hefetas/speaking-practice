const test = require('node:test');
const assert = require('node:assert');
const C = require('../app/content.js');

const IDS = ['free', 'describe', 'opinion', 'story', 'targets', 'roleplay', 'repeat'];

test('LEVELS are easy, medium, hard', () => {
  assert.deepStrictEqual(C.LEVELS, ['easy', 'medium', 'hard']);
});

test('DAILY has exactly 60 entries', () => {
  assert.strictEqual(C.DAILY.length, 60);
});

test('every daily entry is complete', () => {
  C.DAILY.forEach((d, i) => {
    assert.ok(d.theme && d.themeTr && d.emoji, 'theme/themeTr/emoji missing at ' + i);
    assert.strictEqual(d.words.length, 5, 'need 5 words at ' + i);
    assert.strictEqual(new Set(d.words.map(w => w.toLowerCase())).size, 5, 'dup words at ' + i);
    d.words.forEach(w => assert.ok(w.trim().length > 0));
    C.LEVELS.forEach(l => assert.ok(d.questions[l] && d.questions[l].trim().length > 10, 'question ' + l + ' at ' + i));
  });
});

test('daily themes are unique', () => {
  assert.strictEqual(new Set(C.DAILY.map(d => d.theme.toLowerCase())).size, 60);
});

test('TESTS has the 7 required ids in any order', () => {
  assert.deepStrictEqual(C.TESTS.map(t => t.id).sort(), [...IDS].sort());
  C.TESTS.forEach(t => assert.ok(t.titleTr));
});

test('every test builds a usable prompt for every level and the first 5 days', () => {
  C.TESTS.forEach(t => {
    C.LEVELS.forEach(l => {
      C.DAILY.slice(0, 5).forEach(d => {
        const b = t.build(d, l);
        assert.ok(b.promptEn && b.promptEn.length > 5, t.id + ' promptEn');
        assert.ok(b.hintTr && b.hintTr.length > 5, t.id + ' hintTr');
        assert.ok(b.seconds > 0, t.id + ' seconds');
      });
    });
  });
});

test('seconds follow the level (easy 45, medium 60, hard 90; repeat 30)', () => {
  const d = C.DAILY[0];
  const free = C.TESTS.find(t => t.id === 'free');
  assert.deepStrictEqual(C.LEVELS.map(l => free.build(d, l).seconds), [45, 60, 90]);
  const rep = C.TESTS.find(t => t.id === 'repeat');
  C.LEVELS.forEach(l => assert.strictEqual(rep.build(d, l).seconds, 30));
});

test('targets test returns exactly the daily words', () => {
  const d = C.DAILY[3];
  const b = C.TESTS.find(t => t.id === 'targets').build(d, 'medium');
  assert.deepStrictEqual(b.targets, d.words);
});

test('repeat test provides speakText from the daily question', () => {
  const d = C.DAILY[2];
  const b = C.TESTS.find(t => t.id === 'repeat').build(d, 'easy');
  assert.strictEqual(b.speakText, d.questions.easy);
});
