const test = require('node:test');
const assert = require('node:assert');
const C = require('../app/content.js');

const IDS = ['free', 'describe', 'opinion', 'story', 'targets', 'roleplay', 'repeat', 'rapid', 'shadow', 'twister', 'pitch', 'scene', 'pairs'];

test('LEVELS are easy, medium, hard', () => {
  assert.deepStrictEqual(C.LEVELS, ['easy', 'medium', 'hard']);
});

test('DAILY has exactly 180 entries', () => {
  assert.strictEqual(C.DAILY.length, 180);
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
  assert.strictEqual(new Set(C.DAILY.map(d => d.theme.toLowerCase())).size, 180);
});

test('TESTS has the 13 daily test ids in any order', () => {
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

test('rapid test: 5 prompts built from the daily words, round length by level', () => {
  const d = C.DAILY[1];
  const t = C.TESTS.find(x => x.id === 'rapid');
  const secs = C.LEVELS.map(l => t.build(d, l).roundSeconds);
  assert.deepStrictEqual(secs, [12, 10, 8]);
  const b = t.build(d, 'medium');
  assert.strictEqual(b.prompts.length, 5);
  b.prompts.forEach((p, i) => assert.ok(p.includes(d.words[i])));
  assert.strictEqual(b.seconds, 50);
  assert.deepStrictEqual(b.targets, d.words);
});

test('shadow test: passage from theme and question, pace by level, time fits the passage', () => {
  const d = C.DAILY[2];
  const t = C.TESTS.find(x => x.id === 'shadow');
  assert.deepStrictEqual(C.LEVELS.map(l => t.build(d, l).passageWpm), [100, 130, 150]);
  const b = t.build(d, 'easy');
  assert.ok(b.passage.includes(d.questions.easy));
  const n = b.passage.split(/\s+/).length;
  assert.strictEqual(b.seconds, Math.ceil(n / 100 * 60) + 4);
});

test('IELTS bank has 12 complete topics', () => {
  assert.strictEqual(C.IELTS.length, 12);
  assert.strictEqual(new Set(C.IELTS.map(t => t.id)).size, 12);
  C.IELTS.forEach(t => {
    assert.ok(t.topic);
    assert.strictEqual(t.part1.length, 3);
    assert.ok(t.part2.prompt.startsWith('Describe'));
    assert.strictEqual(t.part2.points.length, 4);
    assert.strictEqual(t.part3.length, 2);
    [...t.part1, ...t.part3].forEach(q => assert.ok(q.endsWith('?')));
  });
});

test('IELTS tests build parts 1, 2 and 3 with the right timing', () => {
  assert.deepStrictEqual(C.IELTS_TESTS.map(t => t.id), ['ielts1', 'ielts2', 'ielts3']);
  const d = C.DAILY[0];
  C.IELTS.forEach(card => {
    [0, 1, 2].forEach(i => {
      const [p1, p2, p3] = C.IELTS_TESTS.map(t => t.build(d, 'medium', { card, i }));
      assert.strictEqual(p1.promptEn, card.part1[i]);
      assert.strictEqual(p1.seconds, 40);
      assert.strictEqual(p2.promptEn, card.part2.prompt);
      assert.deepStrictEqual(p2.points, card.part2.points);
      assert.strictEqual(p2.seconds, 120);
      assert.strictEqual(p2.prepSeconds, 30);
      assert.strictEqual(p3.promptEn, card.part3[i % 2]);
      assert.strictEqual(p3.seconds, 60);
      [p1, p2, p3].forEach(p => assert.ok(p.hintTr.length > 5));
    });
  });
});

test('practice bank: enough unique twisters, pitches, scenes and minimal-pair drills', () => {
  const B = require('../app/practice-bank.js');
  assert.ok(B.TWISTERS.length >= 16 && new Set(B.TWISTERS).size === B.TWISTERS.length);
  assert.ok(B.PITCHES.length >= 12);
  B.PITCHES.forEach(p => { assert.ok(p.prompt.length > 20); assert.strictEqual(p.points.length, 3); });
  assert.ok(B.SCENES.length >= 12);
  B.SCENES.forEach(s => assert.ok(s.emoji.length >= 4 && s.title));
  assert.ok(B.PAIRS.length >= 12);
  B.PAIRS.forEach(p => assert.ok(p.split(/\s+/).length >= 6));
});

test('new tests are deterministic for a seed and vary across seeds', () => {
  ['twister', 'pitch', 'scene', 'pairs'].forEach(id => {
    const t = C.TESTS.find(x => x.id === id);
    const d = C.DAILY[0];
    const a = t.build(d, 'medium', { i: 7, j: 2 });
    assert.deepStrictEqual(a, t.build(d, 'medium', { i: 7, j: 2 }), id + ' not deterministic');
    const seen = new Set();
    for (let i = 0; i < 40; i++) seen.add(JSON.stringify(t.build(d, 'medium', { i: i, j: 0 })));
    assert.ok(seen.size >= 8, id + ' variety ' + seen.size);
    assert.ok(a.promptEn && a.hintTr && a.seconds > 0);
  });
});

test('twister and pairs expose a static passage (no highlight pace); scene exposes emoji', () => {
  const d = C.DAILY[4];
  const tw = C.TESTS.find(x => x.id === 'twister').build(d, 'easy', { i: 1, j: 0 });
  assert.ok(tw.passage && tw.passageWpm === undefined && tw.scoreCoverage);
  const pr = C.TESTS.find(x => x.id === 'pairs').build(d, 'easy', { i: 1, j: 0 });
  assert.ok(pr.passage && pr.passageWpm === undefined && pr.scoreCoverage);
  const sc = C.TESTS.find(x => x.id === 'scene').build(d, 'easy', { i: 1, j: 0 });
  assert.ok(sc.scene && sc.scene.length >= 4);
  const pi = C.TESTS.find(x => x.id === 'pitch').build(d, 'hard', { i: 1, j: 0 });
  assert.ok(pi.points.length === 3 && pi.seconds === 90);
});
