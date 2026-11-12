const test = require('node:test');
const assert = require('node:assert');
const Se = require('../app/series.js');
const St = require('../app/stage.js');
const L = require('../app/logic.js');

const words = (s) => L.normalize(s).split(' ').filter(Boolean);

test('episodes: well-formed, original, moods exist in the stage rig', () => {
  assert.ok(Se.EPISODES.length >= 1);
  const ids = new Set();
  Se.EPISODES.forEach(ep => {
    assert.ok(ep.id && !ids.has(ep.id)); ids.add(ep.id);
    ['title', 'titleTr', 'cliff', 'cliffTr', 'blurb', 'blurbTr'].forEach(k => assert.ok(ep[k], ep.id + ' ' + k));
    const sh = ep.beats.filter(b => b.who === 'sherlock');
    const me = ep.beats.filter(b => b.who === 'you');
    assert.ok(ep.beats.length >= 11 && sh.length >= 5 && me.length >= 5, 'enough turns');
    assert.strictEqual(ep.beats[0].who, 'sherlock', 'Sherlock opens');
    ep.beats.forEach((b, i) => {
      assert.ok(b.en && b.tr, ep.id + ' beat ' + i);
      assert.ok(['sherlock', 'you'].includes(b.who));
      if (b.who === 'sherlock') {
        assert.ok(St.POSES[b.mood], 'unknown mood ' + b.mood);
        assert.ok(words(b.en).length <= 22, 'Sherlock line too long at ' + i);
      } else {
        const n = words(b.en).length;
        assert.ok(n >= 3 && n <= 14, 'your line length ' + n + ' at ' + i);
        assert.ok(!/\w[’']\w/.test(b.en), 'no contractions in lines you must say: ' + b.en);
      }
    });
  });
});

test('episodes: every key phrase really appears in the script', () => {
  Se.EPISODES.forEach(ep => {
    assert.ok(ep.phrases.length >= 4);
    const all = ' ' + ep.beats.map(b => L.normalize(b.en)).join(' ') + ' ';
    ep.phrases.forEach(p => {
      assert.ok(p.en && p.tr);
      assert.ok(all.includes(' ' + L.normalize(p.en) + ' '), 'phrase not in script: ' + p.en);
    });
  });
});

test('scoreLine: exact match is 100%, three stars', () => {
  const r = Se.scoreLine('A case? What happened?', 'a case what happened');
  assert.strictEqual(r.pct, 100); assert.ok(r.ok); assert.strictEqual(r.stars, 3); assert.deepStrictEqual(r.miss, []);
});

test('scoreLine: reports missing words in script order, without duplicates', () => {
  const r = Se.scoreLine('Maybe you ate it yourself and forgot', 'maybe you ate it');
  assert.deepStrictEqual(r.miss, ['yourself', 'and', 'forgot']);
  assert.strictEqual(r.pct, Math.round(4 / 7 * 100));
  assert.strictEqual(r.ok, false);
});

test('scoreLine: tolerant of contractions and digits that speech recognition produces', () => {
  assert.strictEqual(Se.scoreLine('It is only a spoon. Why is it important?', "it's only a spoon why is it important").pct, 100);
  assert.strictEqual(Se.scoreLine('That is jam! It is not yogurt!', "that's jam it isn't yogurt").pct >= 80, true);
  assert.strictEqual(Se.scoreLine('I went to bed at ten, I promise.', 'I went to bed at 10 I promise').pct, 100);
});

test('scoreLine: nothing heard means 0% and every word missing', () => {
  const r = Se.scoreLine('Hello there friend', '');
  assert.strictEqual(r.pct, 0); assert.strictEqual(r.ok, false); assert.strictEqual(r.stars, 0);
  assert.deepStrictEqual(r.miss, ['hello', 'there', 'friend']);
});

test('stars thresholds', () => {
  assert.deepStrictEqual([100, 90, 89, 75, 74, 60, 59, 0].map(Se.starsFor), [3, 3, 2, 2, 1, 1, 0, 0]);
});

test('summarize: averages best attempts, counts passes and spoken words', () => {
  const s = Se.summarize([
    { pct: 100, spoken: 4 }, { pct: 80, spoken: 7 }, { pct: 40, spoken: 3 }, { pct: 100, spoken: 0 }
  ]);
  assert.strictEqual(s.avg, 80);
  assert.strictEqual(s.passed, 3);
  assert.strictEqual(s.spoken, 14);
  assert.strictEqual(s.stars, 2);
  assert.deepStrictEqual(Se.summarize([]), { avg: 0, passed: 0, spoken: 0, stars: 0, total: 0 });
});

test('episodeFor: deterministic per day and always a real episode', () => {
  const a = Se.episodeFor('2026-11-13');
  assert.strictEqual(a.id, Se.episodeFor('2026-11-13').id);
  assert.ok(Se.get(a.id));
  assert.strictEqual(Se.get('nope'), null);
});
