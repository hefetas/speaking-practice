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
  assert.ok(!/<link[^>]+href=/i.test(html), 'external stylesheet');
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
