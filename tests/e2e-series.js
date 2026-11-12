// Quick browser check for the Sherlock series: node build.js && node tests/e2e-series.js
const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');
const url = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');

const fakeTTS = () => {
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak(u) { window.__spoken = (window.__spoken || []).concat(u.text); setTimeout(() => u.onend && u.onend(), 40); }, cancel() {}, getVoices() { return []; } } });
};
// what the fake mic "hears": the script line on screen, or a wrong answer for the first try when __bad is set
const fakeSR = () => {
  function F() {}
  F.prototype.start = function () {
    const self = this;
    setTimeout(() => {
      const el = document.getElementById('say');
      let text = el ? el.textContent : '';
      if (window.__bad && !window.__badDone) { window.__badDone = true; text = 'hello'; }
      const r = [{ transcript: text }]; r.isFinal = true;
      self.onresult && self.onresult({ results: [r] });
      self.onend && self.onend();
    }, 120);
  };
  F.prototype.stop = function () {}; F.prototype.abort = function () {};
  window.SpeechRecognition = F; window.webkitSpeechRecognition = F;
};
const noSR = () => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; };

async function open(browser, init, vp) {
  const ctx = await browser.newContext({ viewport: vp || { width: 390, height: 844 }, locale: 'tr-TR' });
  await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(url);
  await page.waitForSelector('#cAccept');
  await page.check('#cAgree');
  await page.click('#cAccept');
  await page.waitForSelector('#seriesGo');
  return { ctx, page, errors };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const wrap = (f) => `(${fakeTTS.toString()})();(${f.toString()})();`;

  // 1) full episode, perfect answers
  let { ctx, page, errors } = await open(browser, wrap(fakeSR));
  await page.click('#seriesGo');
  await page.waitForSelector('#scGo');
  await page.screenshot({ path: '/tmp/st/intro.png' });
  await page.click('#scGo');
  await page.waitForSelector('#stage svg');
  await page.waitForSelector('#say', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/st/turn.png' });
  await page.waitForSelector('.stars', { timeout: 60000 });
  const stars = await page.textContent('.stars');
  assert.strictEqual(stars, '⭐⭐⭐', 'perfect run gives three stars');
  assert.ok(/6\/6/.test(await page.textContent('.card.center')), 'all six lines done');
  assert.ok(await page.locator('.xp-banner').count() === 1, 'xp banner shown');
  const spoken = await page.evaluate(() => window.__spoken.length);
  assert.ok(spoken >= 7, 'Sherlock spoke every line, got ' + spoken);
  await page.screenshot({ path: '/tmp/st/end.png' });
  const xp = await page.evaluate(() => localStorage.getItem('spk_xp'));
  assert.ok(+xp > 0, 'xp saved after consent');
  assert.deepStrictEqual(errors, [], 'no console errors: ' + errors.join('|'));
  await ctx.close();

  // 2) a wrong first answer offers a retry, then passes
  ({ ctx, page, errors } = await open(browser, wrap(fakeSR) + 'window.__bad=true;'));
  await page.click('#seriesGo'); await page.click('#scGo');
  await page.waitForFunction(() => /%\d+/.test((document.getElementById('verdict') || {}).textContent || ''), null, { timeout: 15000 });
  await page.screenshot({ path: '/tmp/st/retry.png' });
  assert.ok(/%0/.test(await page.textContent('#verdict')), 'wrong answer scored 0%');
  assert.ok(await page.locator('#scNext').count() === 1, 'can continue');
  await page.click('#scMic');
  await page.waitForFunction(() => /%100/.test((document.getElementById('verdict') || {}).textContent || ''));
  assert.deepStrictEqual(errors, []);
  await ctx.close();

  // 3) no speech recognition: typed fallback works
  ({ ctx, page, errors } = await open(browser, wrap(noSR)));
  await page.click('#seriesGo'); await page.click('#scGo');
  await page.waitForSelector('#scText', { timeout: 15000 });
  const line = await page.textContent('#say');
  await page.fill('#scText', line);
  await page.click('#scSend');
  await page.waitForFunction(() => /%100/.test(document.getElementById('verdict').textContent));
  assert.deepStrictEqual(errors, []);
  await ctx.close();

  // 4) leaving mid-episode stops everything and returns home
  ({ ctx, page, errors } = await open(browser, wrap(fakeSR)));
  await page.click('#seriesGo'); await page.click('#scGo');
  await page.waitForSelector('#scQuit');
  await page.click('#scQuit');
  await page.waitForSelector('#seriesGo');
  await page.waitForTimeout(600);
  assert.deepStrictEqual(errors, []);
  await ctx.close();

  // 5) animation runs: the rig actually moves over time (not a static picture)
  ({ ctx, page, errors } = await open(browser, wrap(fakeSR)));
  await page.click('#seriesGo'); await page.click('#scGo');
  await page.waitForSelector('#stage svg');
  const a = await page.getAttribute('#stage [data-r="armR1"]', 'd');
  await page.waitForTimeout(700);
  const b2 = await page.getAttribute('#stage [data-r="armR1"]', 'd');
  assert.notStrictEqual(a, b2, 'arm geometry changes over time');
  await ctx.close();

  await browser.close();
  console.log('series e2e OK');
})().catch(e => { console.error(e); process.exit(1); });
