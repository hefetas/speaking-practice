const test = require('node:test');
const assert = require('node:assert');
const S = require('../app/stage.js');

test('ik: elbow sits exactly L1 from shoulder and L2 from hand for reachable targets', () => {
  [[-12, 138], [-43, -53], [60, 20], [0, 100], [-50, 20]].forEach(([tx, ty]) => {
    const r = S.ik(82, 76, tx, ty, -1);
    assert.ok(Math.abs(Math.hypot(r.ex, r.ey) - 82) < 1e-6, 'upper arm length');
    assert.ok(Math.abs(Math.hypot(tx - r.ex, ty - r.ey) - 76) < 1e-6, 'forearm length');
  });
});

test('ik: unreachable targets are clamped to a straight arm, tiny ones do not produce NaN', () => {
  const far = S.ik(82, 76, 0, 400, 1);
  assert.ok(Math.abs(Math.hypot(far.hx, far.hy) - 158) < 0.1);
  const near = S.ik(82, 76, 0, 0, 1);
  assert.ok(Number.isFinite(near.ex) && Number.isFinite(near.ey) && Number.isFinite(near.hx));
});

test('ik: elbow bends outward (away from the body centre) on each side', () => {
  const l = S.ik(82, 76, -43, -53, -1);
  const r = S.ik(82, 76, 43, -53, 1);
  assert.ok(l.ex < 0, 'left elbow outward');
  assert.ok(r.ex > 0, 'right elbow outward');
});

test('spring: converges to the target without exploding, even with large frame gaps', () => {
  const s = { x: 0, v: 0 };
  for (let i = 0; i < 240; i++) S.spring(s, 100, 1 / 60, 14);
  assert.ok(Math.abs(s.x - 100) < 0.5, 'converged ' + s.x);
  const big = { x: 0, v: 0 };
  S.spring(big, 100, 5, 14); // a 5 s hitch (tab was hidden)
  assert.ok(Number.isFinite(big.x) && big.x <= 120 && big.x >= -20);
});

test('spring: critically damped, so it barely overshoots', () => {
  const s = { x: 0, v: 0 };
  let max = 0;
  for (let i = 0; i < 300; i++) { S.spring(s, 100, 1 / 60, 14); max = Math.max(max, s.x); }
  assert.ok(max < 103, 'overshoot ' + max);
});

test('POSES: every mood defines every rig parameter with finite numbers', () => {
  const moods = Object.keys(S.POSES);
  ['idle', 'excited', 'angry', 'think', 'suspicious', 'shock', 'happy', 'listen'].forEach(m => assert.ok(moods.includes(m), 'missing ' + m));
  moods.forEach(m => S.PARAMS.forEach(k => assert.ok(Number.isFinite(S.POSES[m][k]), m + '.' + k)));
});

test('mouthOpen stays within 0..1 and is closed when not speaking', () => {
  for (let t = 0; t < 5; t += 0.037) {
    const o = S.mouthOpen(t, true);
    assert.ok(o >= 0 && o <= 1, 'range ' + o);
    assert.strictEqual(S.mouthOpen(t, false), 0);
  }
});

test('estimateMs grows with word count and has a floor', () => {
  assert.ok(S.estimateMs('Hi') >= 900);
  assert.ok(S.estimateMs('one two three four five six seven eight nine ten') > S.estimateMs('one two three'));
});
