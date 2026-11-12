const test = require('node:test');
const assert = require('node:assert');
const P = require('../app/progress.js');

test('daysBetween counts calendar days across month and DST', () => {
  assert.strictEqual(P.daysBetween('2026-11-12', '2026-11-13'), 1);
  assert.strictEqual(P.daysBetween('2026-10-31', '2026-11-01'), 1);
  assert.strictEqual(P.daysBetween('2027-03-27', '2027-03-29'), 2);
  assert.strictEqual(P.daysBetween('2026-11-13', '2026-11-12'), -1);
});

test('nextStreak: first ever test starts at 1', () => {
  const r = P.nextStreak({ last: null, streak: 0, freeze: 0 }, '2026-11-13');
  assert.deepStrictEqual([r.streak, r.freeze, r.last, r.used], [1, 0, '2026-11-13', false]);
});
test('nextStreak: same day changes nothing', () => {
  const r = P.nextStreak({ last: '2026-11-13', streak: 4, freeze: 1 }, '2026-11-13');
  assert.deepStrictEqual([r.streak, r.freeze], [4, 1]);
});
test('nextStreak: next day adds one', () => {
  assert.strictEqual(P.nextStreak({ last: '2026-11-12', streak: 4, freeze: 0 }, '2026-11-13').streak, 5);
});
test('nextStreak: one missed day without freeze resets to 1', () => {
  assert.strictEqual(P.nextStreak({ last: '2026-11-11', streak: 4, freeze: 0 }, '2026-11-13').streak, 1);
});
test('nextStreak: one missed day with freeze keeps the streak and uses the freeze', () => {
  const r = P.nextStreak({ last: '2026-11-11', streak: 4, freeze: 1 }, '2026-11-13');
  assert.deepStrictEqual([r.streak, r.freeze, r.used], [5, 0, true]);
});
test('nextStreak: two missed days reset even with a freeze', () => {
  assert.strictEqual(P.nextStreak({ last: '2026-11-10', streak: 4, freeze: 2 }, '2026-11-13').streak, 1);
});
test('nextStreak: reaching 7 earns a freeze, capped at 2', () => {
  assert.strictEqual(P.nextStreak({ last: '2026-11-12', streak: 6, freeze: 0 }, '2026-11-13').freeze, 1);
  assert.strictEqual(P.nextStreak({ last: '2026-11-12', streak: 6, freeze: 2 }, '2026-11-13').freeze, 2);
});
test('nextStreak: clock moved backwards leaves the state alone', () => {
  const r = P.nextStreak({ last: '2026-11-14', streak: 3, freeze: 1 }, '2026-11-13');
  assert.deepStrictEqual([r.streak, r.last], [3, '2026-11-14']);
});

test('streakAlive shows the streak for today, yesterday and a freeze-covered gap only', () => {
  const s = { last: '2026-11-12', streak: 5, freeze: 0 };
  assert.strictEqual(P.streakAlive(s, '2026-11-12'), 5);
  assert.strictEqual(P.streakAlive(s, '2026-11-13'), 5);
  assert.strictEqual(P.streakAlive(s, '2026-11-14'), 0);
  assert.strictEqual(P.streakAlive({ last: '2026-11-12', streak: 5, freeze: 1 }, '2026-11-14'), 5);
  assert.strictEqual(P.streakAlive({ last: null, streak: 0, freeze: 0 }, '2026-11-14'), 0);
});

test('xpFor rewards words (capped) and target hits, nothing for silence', () => {
  assert.strictEqual(P.xpFor({ words: 0, hits: 0 }), 0);
  assert.strictEqual(P.xpFor({ words: 6, hits: 0 }), 11);
  assert.strictEqual(P.xpFor({ words: 120, hits: 0 }), 30);
  assert.strictEqual(P.xpFor({ words: 500, hits: 0 }), 30);
  assert.strictEqual(P.xpFor({ words: 6, hits: 3 }), 17);
});

test('rankFor maps xp to titles with progress to the next one', () => {
  const a = P.rankFor(0);
  assert.deepStrictEqual([a.title, a.index, a.next, a.xpNeeded, a.frac], ['Sessiz', 0, 'Mırıldanan', 80, 0]);
  assert.strictEqual(P.rankFor(79).title, 'Sessiz');
  assert.strictEqual(P.rankFor(80).title, 'Mırıldanan');
  const z = P.rankFor(5000);
  assert.deepStrictEqual([z.title, z.next, z.frac], ['Usta Hatip', null, 1]);
});

test('badgesFor: nothing earned at the start, first word badge after one test', () => {
  const base = { done: 0, words: 0, bestStreak: 0, stamps: [], weeksDone: 0 };
  assert.strictEqual(P.badgesFor(base).filter(b => b.earned).length, 0);
  const b = P.badgesFor({ ...base, done: 1 });
  assert.ok(b.find(x => x.id === 'first').earned);
});
test('badgesFor: passport needs every daily test type', () => {
  const base = { done: 13, words: 50, bestStreak: 1, stamps: P.PASSPORT_IDS.slice(0, P.PASSPORT_IDS.length - 1), weeksDone: 0 };
  assert.ok(!P.badgesFor(base).find(x => x.id === 'passport').earned);
  assert.ok(P.badgesFor({ ...base, stamps: P.PASSPORT_IDS }).find(x => x.id === 'passport').earned);
  assert.strictEqual(P.PASSPORT_IDS.length, 13);
});
test('badgesFor: streak, words, ielts and weekly badges', () => {
  const s = { done: 5, words: 520, bestStreak: 7, stamps: ['ielts2'], weeksDone: 1 };
  const e = id => P.badgesFor(s).find(x => x.id === id).earned;
  assert.ok(e('streak3') && e('streak7') && e('words100') && e('words500') && e('ielts') && e('week'));
});

test('challengeFor is stable per week and rotates', () => {
  assert.strictEqual(P.challengeFor('2026-11-09').id, P.challengeFor('2026-11-09').id);
  assert.notStrictEqual(P.challengeFor('2026-11-09').id, P.challengeFor('2026-11-16').id);
  assert.ok(P.challengeFor('2020-01-06').id);
});
test('updateWeek resets on a new week and accumulates inside one', () => {
  let wk = P.updateWeek(null, '2026-11-09', { type: 'rapid', words: 10, dayKey: '2026-11-13' });
  wk = P.updateWeek(wk, '2026-11-09', { type: 'rapid', words: 5, dayKey: '2026-11-13' });
  wk = P.updateWeek(wk, '2026-11-09', { type: 'free', words: 5, dayKey: '2026-11-14' });
  assert.deepStrictEqual([wk.words, wk.tests, wk.rapid, wk.types.length, wk.days.length], [20, 3, 2, 2, 2]);
  const n = P.updateWeek(wk, '2026-11-16', { type: 'free', words: 3, dayKey: '2026-11-16' });
  assert.deepStrictEqual([n.key, n.words, n.tests], ['2026-11-16', 3, 1]);
});
test('challengeProgress caps at the target and claimWeek pays once', () => {
  const ch = { id: 'words150', target: 150, metric: 'words' };
  assert.strictEqual(P.challengeProgress(ch, { words: 400, types: [], days: [], rapid: 0, tests: 0 }), 150);
  const wk = { key: 'k', words: 150, types: [], days: [], rapid: 0, tests: 0, claimed: false };
  const a = P.claimWeek(ch, wk);
  assert.strictEqual(a.bonus, 50);
  assert.strictEqual(a.wk.claimed, true);
  assert.strictEqual(P.claimWeek(ch, a.wk).bonus, 0);
  assert.strictEqual(P.claimWeek(ch, { ...wk, words: 10 }).bonus, 0);
});
