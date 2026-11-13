const test = require('node:test');
const assert = require('node:assert');
const S3 = require('../app/stage3d.js');
const Se = require('../app/series.js');
const { M } = S3;

const near = (a, b, e = 1e-5) => Math.abs(a - b) < e;

test('mat4: translate/scale/rotate compose in the right order', () => {
  const m = M.mul(M.T(1, 2, 3), M.S(2));
  assert.deepStrictEqual(M.apply(m, [1, 1, 1]).map(v => +v.toFixed(6)), [3, 4, 5]);
  const r = M.apply(M.RY(Math.PI / 2), [0, 0, 1]);
  assert.ok(near(r[0], 1) && near(r[2], 0), 'RY turns +Z into +X');
  const rx = M.apply(M.RX(-Math.PI / 2), [0, -1, 0]);
  assert.ok(near(rx[2], 1), 'negative pitch swings a hanging arm forward (+Z)');
});

test('lookAt + perspective put the target in the centre of the screen', () => {
  const vp = M.mul(M.persp(0.9, 1.5, 0.05, 30), M.lookAt([1, 1.6, 2], [-2, 0.8, -1], [0, 1, 0]));
  const p = M.apply(vp, [-2, 0.8, -1]);
  assert.ok(near(p[0], 0, 1e-4) && near(p[1], 0, 1e-4) && p[2] > -1 && p[2] < 1);
});

test('normal matrix stays perpendicular to surfaces under non-uniform scale', () => {
  const m = M.mul(M.RZ(0.7), M.S(3, 0.5, 1));
  const n = M.normalMat(m);
  // surface tangent (1,1,0) and normal (1,-1,0) of the unscaled shape
  const t = M.apply(m, [1, 1, 0]);
  const nn = [n[0] * 1 + n[3] * -1, n[1] * 1 + n[4] * -1, n[2] * 1 + n[5] * -1];
  assert.ok(near(t[0] * nn[0] + t[1] * nn[1] + t[2] * nn[2], 0, 1e-5));
});

test('poses: every mood the series uses exists and sets every parameter', () => {
  Se.EPISODES.forEach(ep => ep.beats.filter(b => b.mood).forEach(b => assert.ok(S3.POSES[b.mood], 'missing ' + b.mood)));
  Object.keys(S3.POSES).forEach(m => S3.PARAMS.forEach(k => assert.ok(Number.isFinite(S3.POSES[m][k]), m + '.' + k)));
});

test('shots: every beat names a known shot, inside the room, with valid gestures', () => {
  Se.EPISODES.forEach(ep => ep.beats.forEach((b, i) => assert.ok(S3.SHOTS[b.shot], ep.id + ' beat ' + i + ' shot ' + b.shot)));
  Object.keys(S3.SHOTS).forEach(k => {
    const s = S3.SHOTS[k];
    [s.cam, s.look].forEach(p => assert.ok(p[0] > -3 && p[0] < 3 && p[1] > 0 && p[1] < 2.8 && p[2] > -2.5 && p[2] < 2.5, k));
    assert.ok(Math.abs(s.at[0]) < 2.8 && Math.abs(s.at[1]) < 2.3, k + ' mark inside');
    if (s.gesture) assert.ok(S3.POSES[s.gesture], k + ' gesture');
    S3.OBST.forEach(o => assert.ok(Math.hypot(s.at[0] - o[0], s.at[1] - o[1]) > o[2] * 0.6, k + ' mark not inside furniture'));
  });
});

test('walkStep: reaches the mark, then turns to face the wanted direction', () => {
  const g = { x: 0, z: 0, yaw: 0, speed: 0 };
  let n = 0;
  while (S3.walkStep(g, 2, -1, Math.PI, 1 / 30) && n < 900) n++;
  assert.ok(n < 900, 'arrived');
  assert.ok(Math.hypot(g.x - 2, g.z + 1) < 0.08);
  for (let i = 0; i < 120; i++) S3.walkStep(g, 2, -1, Math.PI, 1 / 30);
  assert.ok(Math.abs(S3.angDiff(g.yaw, Math.PI)) < 0.05, 'faces the clue');
});

test('route: walks around the table instead of through it', () => {
  // from the fridge to the sink the straight line crosses the table
  let x = 1.25, z = -0.95, yaw = 0;
  const g = { x, z, yaw, speed: 0 };
  let minD = 9;
  for (let i = 0; i < 1500; i++) {
    const wp = S3.route(g.x, g.z, -1.75, -0.05, S3.OBST);
    const moving = S3.walkStep(g, wp[0], wp[1], null, 1 / 30);
    minD = Math.min(minD, Math.hypot(g.x - 0, g.z + 0.35));
    if (!moving && wp[0] === -1.75) break;
  }
  assert.ok(Math.hypot(g.x + 1.75, g.z + 0.05) < 0.1, 'arrived at the sink');
  assert.ok(minD > 0.9, 'never walked through the table, min distance ' + minD.toFixed(2));
});

test('spring: stable with big frame gaps', () => {
  const s = { x: 0, v: 0 };
  S3.spring(s, 1, 5, 2.1);
  assert.ok(Number.isFinite(s.x) && s.x > 0 && s.x < 1.2);
});
