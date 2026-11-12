const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist', 'index.html');

test('build produces a single self-contained dist/index.html', () => {
  if (fs.existsSync(out)) fs.unlinkSync(out);
  execFileSync(process.execPath, [path.join(root, 'build.js')], { cwd: root });
  assert.ok(fs.existsSync(out), 'dist/index.html missing');
  const html = fs.readFileSync(out, 'utf8');
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(/<title>[^<]+<\/title>/.test(html));
  assert.ok(!html.includes('/*INLINE_'), 'placeholder left over');
  assert.ok(!/<script[^>]+src=/i.test(html), 'external script');
  assert.ok(!/<link[^>]+rel="stylesheet"/i.test(html), 'external stylesheet');
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket/.test(html), 'network API used');
  assert.ok(!/https?:\/\//.test(html), 'absolute URL present');
});

test('every inline script parses', () => {
  const html = fs.readFileSync(out, 'utf8');
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m, n = 0;
  while ((m = re.exec(html))) {
    const f = path.join(os.tmpdir(), 'spk-check-' + n++ + '.js');
    fs.writeFileSync(f, m[1]);
    execFileSync(process.execPath, ['--check', f]);
  }
  assert.ok(n >= 1, 'no inline script found');
});

test('build ships a CSP, no-referrer, noindex by default and the config object', () => {
  const html = fs.readFileSync(out, 'utf8');
  assert.ok(/http-equiv="Content-Security-Policy"/.test(html), 'CSP missing');
  assert.ok(/connect-src 'none'/.test(html), 'connect-src must be none');
  assert.ok(/name="referrer" content="no-referrer"/.test(html));
  assert.ok(/name="robots" content="noindex,nofollow"/.test(html), 'must be noindex before launch');
  assert.ok(/window\.CONFIG=\{/.test(html), 'config not inlined');
  assert.ok(!/<!--ROBOTS-->/.test(html));
});

test('LAUNCH=1 switches robots to index,follow', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spk-launch-'));
  execFileSync(process.execPath, [path.join(root, 'build.js')], { cwd: root, env: { ...process.env, LAUNCH: '1', OUT_DIR: dir } });
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.ok(/name="robots" content="index,follow"/.test(html));
  assert.ok(/"launch":true/.test(html));
});

test('build emits PWA files with a versioned service worker and valid manifest', () => {
  const dist = path.join(root, 'dist');
  ['manifest.webmanifest', 'sw.js', 'icon-192.png', 'icon-512.png'].forEach(f => assert.ok(fs.existsSync(path.join(dist, f)), f + ' missing'));
  const m = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.webmanifest'), 'utf8'));
  assert.ok(m.name && m.start_url && m.display === 'standalone' && m.icons.length >= 2);
  const sw = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8');
  assert.ok(/const VERSION = 'konus-[0-9a-f]{8}'/.test(sw), 'sw version stamp missing');
});

test('every t("key") used in ui.js exists in both languages', () => {
  const ui = fs.readFileSync(path.join(root, 'app', 'ui.js'), 'utf8');
  const I = require('../app/i18n.js');
  const used = new Set();
  const re = /\bt\('([a-z0-9_]+)'/g;
  let m;
  while ((m = re.exec(ui))) used.add(m[1]);
  assert.ok(used.size > 50, 'too few keys found: ' + used.size);
  const dynamic = new Set(['lvl_', 'day', 'rank_', 'chal_', 'legal_title_', 'stamp_', 'badge_', 'pace_']);
  used.forEach(k => { if (!dynamic.has(k)) assert.ok(k in I.tr && k in I.en, 'missing i18n key: ' + k); });
  // dynamic key families must be complete
  const P = require('../app/progress.js');
  const C = require('../app/content.js');
  const need = [];
  ['easy', 'medium', 'hard'].forEach(l => need.push('lvl_' + l));
  for (let i = 0; i < 7; i++) need.push('day' + i);
  P.RANKS.forEach((r, i) => need.push('rank_' + i));
  P.CHALLENGES.forEach(c => need.push('chal_' + c.id));
  P.PASSPORT_IDS.forEach(id => need.push('stamp_' + id));
  P.badgesFor({ done: 0, words: 0, bestStreak: 0, stamps: [], weeksDone: 0 }).forEach(b => need.push('badge_' + b.id + '_t', 'badge_' + b.id + '_d'));
  ['slow', 'natural', 'fast'].forEach(k => need.push('pace_' + k));
  ['privacy', 'terms', 'about'].forEach(k => need.push('legal_title_' + k));
  need.forEach(k => assert.ok(k in I.tr && k in I.en, 'missing dynamic i18n key: ' + k));
  assert.deepStrictEqual(C.TESTS.map(x => x.id).sort(), P.PASSPORT_IDS.slice().sort());
});
