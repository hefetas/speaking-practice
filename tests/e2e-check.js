// Manual browser check (not part of node --test): node build.js && node tests/e2e-check.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
const assert = require('assert');

const dist = path.join(__dirname, '..', 'dist');
const url = 'file://' + path.join(dist, 'index.html');
const CHROME = '/usr/bin/google-chrome';

const fakeSR = () => {
  function F() { this.onresult = null; }
  F.prototype.start = function () {
    const self = this;
    setTimeout(() => {
      const mk = (t) => { const r = [{ transcript: t }]; r.isFinal = true; return r; };
      self.onresult && self.onresult({ results: [mk('well I really like to travel and I travel a lot um because travel is nice and I like it')] });
    }, 300);
  };
  F.prototype.abort = function () {}; F.prototype.stop = function () {};
  window.SpeechRecognition = F; window.webkitSpeechRecognition = F;
};
const noSR = () => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; };
const stubShare = () => { navigator.share = (d) => { window.__shared = d; return Promise.resolve(); }; };
const combine = (...fns) => fns.map(f => `(${f.toString()})()`).join(';\n');

async function fresh(browser, opts = {}, init, target = url, accept = true) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR', ...opts });
  if (init) await ctx.addInitScript(typeof init === 'string' ? init : init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(target);
  if (accept) await acceptConsent(page);
  return { ctx, page, errors };
}
async function acceptConsent(page) {
  await page.waitForSelector('#cAccept');
  await page.check('#cAgree');
  await page.click('#cAccept');
  await page.waitForSelector('#go, #cGo');
}

async function startTest(page) {
  await page.click('#go');
  const title = await page.textContent('h1');
  await page.click('#start');
  await page.waitForSelector('#time, #speak, #prepgo', { timeout: 8000 });
  if (await page.$('#prepgo')) { await page.click('#prepgo'); await page.waitForSelector('#time'); }
  else if (await page.$('#speak')) { await page.click('#speak'); await page.waitForSelector('#time'); }
  return title;
}
async function runStarted(page) {
  await page.click('#start');
  await page.waitForSelector('#time, #speak, #prepgo', { timeout: 8000 });
  if (await page.$('#prepgo')) await page.click('#prepgo'); else if (await page.$('#speak')) await page.click('#speak');
  await page.waitForSelector('#time');
}
// click "another test" on the card screen until the title matches
async function seek(page, re, max = 200) {
  for (let i = 0; i < max; i++) {
    const h = (await page.textContent('h1')).trim();
    if (re.test(h)) return h;
    await page.click('#other');
  }
  throw new Error('test never appeared: ' + re);
}
function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
  const server = http.createServer((req, res) => {
    const f = path.join(dist, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
    if (!f.startsWith(dist) || !fs.existsSync(f)) { res.statusCode = 404; return res.end('nf'); }
    res.setHeader('Content-Type', types[path.extname(f)] || 'application/octet-stream');
    res.end(fs.readFileSync(f));
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, base: 'http://127.0.0.1:' + server.address().port + '/' })));
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

  // 1. Home layout on a phone-sized screen, page is noindex
  let { ctx, page, errors } = await fresh(browser);
  const theme = await page.textContent('h1');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, 'horizontal scroll ' + overflow);
  const small = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.getBoundingClientRect().height < 44).length);
  assert.strictEqual(small, 0, 'buttons under 44px');
  assert.strictEqual(await page.getAttribute('meta[name=robots]', 'content'), 'noindex,nofollow');
  console.log('1 ok  home layout, noindex; theme =', theme.trim());

  // 2. Reload 6x: daily theme constant, test type never repeats back to back
  const titles = [];
  for (let i = 0; i < 6; i++) {
    await page.reload();
    assert.strictEqual((await page.textContent('h1')).trim(), theme.trim(), 'daily theme changed on reload');
    await page.click('#go');
    titles.push((await page.textContent('h1')).trim());
  }
  for (let i = 1; i < titles.length; i++) assert.notStrictEqual(titles[i], titles[i - 1], 'repeated type');
  console.log('2 ok  reload variety:', titles.join(' | '));

  // 3. Full flow with browser SR (headless), typed answer if fell back
  await page.reload();
  const t3 = await startTest(page);
  await page.waitForTimeout(1500);
  if (await page.$('#typed')) await page.fill('#typed', 'I really like to travel and book a nice destination for my holiday');
  await page.click('#finish');
  await page.waitForSelector('#again');
  console.log('3 ok  flow finished for', t3.trim());
  assert.deepStrictEqual(errors, [], 'console errors: ' + errors.join('; '));
  await ctx.close();

  // 4. No speech support: notice, textarea, typed result, streak
  ({ ctx, page, errors } = await fresh(browser, {}, noSR));
  assert.ok((await page.textContent('.notice')).includes('desteklemiyor'));
  await startTest(page);
  assert.ok(await page.$('#typed'), 'textarea fallback missing');
  await page.fill('#typed', 'hello world this is a test');
  await page.click('#finish');
  await page.waitForSelector('#again');
  const res = await page.textContent('.result-grid');
  assert.ok(res.includes('6') && res.includes('–'), 'typed stats wrong: ' + res);
  await page.click('#home');
  assert.ok((await page.textContent('#streakPill')).includes('1'));
  assert.ok((await page.textContent('.goal')).includes('1/2'));
  await page.click('.tab[data-tab=progress]');
  assert.ok(/1\s*gün seri/.test(await page.textContent('.stats')));
  console.log('4 ok  no-SR fallback, typed result, streak = 1');
  await page.click('.tab[data-tab=today]');

  // 5. Empty answer: honest result, no counters moved
  await startTest(page);
  await page.click('#finish');
  await page.waitForSelector('#again');
  assert.ok((await page.textContent('h1')).includes('olmadı'));
  assert.ok(!(await page.$('.result-grid')), 'stats shown for empty answer');
  await page.click('#home');
  await page.click('.tab[data-tab=progress]');
  assert.ok(/1\s*tamamlanan/.test(await page.textContent('.stats')), 'empty run was counted');
  assert.deepStrictEqual(errors, [], 'console errors: ' + errors.join('; '));
  console.log('5 ok  empty answer handled');
  await ctx.close();

  // 6. localStorage throwing must not break the page
  ({ ctx, page, errors } = await fresh(browser, {}, () => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  }));
  await startTest(page);
  await page.click('#finish');
  await page.waitForSelector('#again');
  assert.deepStrictEqual(errors, [], 'console errors: ' + errors.join('; '));
  console.log('6 ok  works with localStorage blocked');
  await ctx.close();

  // 7. Fake SR: analysis, XP, tips, compare on retry, share download, passport
  ({ ctx, page, errors } = await fresh(browser, { acceptDownloads: true }, fakeSR));
  await startTest(page);
  await page.waitForFunction(() => /travel/.test(document.getElementById('tr').textContent));
  await page.waitForTimeout(1200);
  await page.click('#finish');
  await page.waitForSelector('#again');
  const body7 = await page.textContent('#screen');
  assert.ok(/\+\d+ XP/.test(body7) && /Konuşma analizi/.test(body7) && /Dolgu/.test(body7) && /Tempo/.test(body7), 'result blocks missing');
  assert.ok(/İlk denemen/.test(body7));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dl')]);
  assert.strictEqual(dl.suggestedFilename(), 'konus-sonuc.png');
  await page.click('#again');
  await runStarted(page);
  await page.waitForFunction(() => /travel/.test(document.getElementById('tr').textContent));
  await page.click('#finish');
  await page.waitForSelector('#again');
  const b7 = await page.textContent('#screen');
  assert.ok(/Geçen denemeyle kıyas/.test(b7) && !/İlk denemen/.test(b7), 'compare missing');
  await page.click('#home');
  await page.click('.tab[data-tab=progress]');
  const prog = await page.textContent('#screen');
  assert.ok(/Konuşma pasaportu \([1-9]\d*\/13\)/.test(prog), 'passport not counted');
  assert.deepStrictEqual(errors, [], 'console errors: ' + errors.join('; '));
  console.log('7 ok  fake SR, analysis, XP, compare, download, passport');
  await ctx.close();

  // 8. IELTS-style mode runs all parts (typed fallback), level picker hidden, band shown
  ({ ctx, page, errors } = await fresh(browser, {}, noSR));
  await page.click('[data-mode=ielts]');
  assert.ok((await page.textContent('h1')).includes('IELTS'));
  assert.ok(!(await page.$('[data-level]')), 'level picker should hide in IELTS mode');
  const seen = new Set();
  let sawBand = false;
  for (let i = 0; i < 6; i++) {
    await page.click('#go, #again').catch(() => {});
    await page.click('#start');
    await page.waitForSelector('#time, #prepgo', { timeout: 8000 });
    if (await page.$('#prepgo')) { seen.add('part2'); await page.click('#prepgo'); await page.waitForSelector('#time'); }
    await page.fill('#typed', 'I think this is a good question and I would like to answer it with several words because it matters to me a lot');
    await page.click('#finish');
    await page.waitForSelector('#next');
    if (await page.$('.band')) sawBand = true;
    await page.click('#next');
    seen.add((await page.textContent('h1')).trim());
  }
  assert.ok(seen.size >= 3, 'IELTS variety too low: ' + [...seen].join('|'));
  assert.ok(sawBand, 'band estimate never shown in IELTS mode');
  assert.deepStrictEqual(errors, [], 'console errors: ' + errors.join('; '));
  console.log('8 ok  IELTS-style mode + band:', [...seen].join(' | '));
  await ctx.close();

  // 9. Optional audio recording with a fake mic
  const b2 = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  ({ ctx, page, errors } = await fresh(b2, { permissions: ['microphone'] }, fakeSR));
  await page.click('#go');
  await page.check('#audioToggle');
  await runStarted(page);
  await page.waitForTimeout(1800);
  await page.click('#finish');
  await page.waitForSelector('#again');
  assert.ok(await page.$('#replayAudio'), 'audio player missing');
  assert.deepStrictEqual(errors, [], 'console errors: ' + errors.join('; '));
  console.log('9 ok  audio playback recorded');
  await ctx.close();
  await b2.close();

  // 10. Consent: nothing persisted before accept, decline stores nothing, language toggle works pre-consent
  ({ ctx, page, errors } = await fresh(browser, {}, null, url, false));
  await page.waitForSelector('#cAccept');
  assert.ok(!(await page.$('.tabs:not([style*=none])')) || !(await page.isVisible('.tabs')), 'tabs visible on consent');
  await page.click('#cAccept');
  assert.ok(await page.isVisible('#cNeed'), 'must demand the checkbox');
  await page.click('#langBtn').catch(() => {});
  let keys = await page.evaluate(() => Object.keys(localStorage));
  assert.deepStrictEqual(keys, [], 'storage written before consent: ' + keys);
  await page.click('#cDecline');
  await page.waitForSelector('#cBack');
  keys = await page.evaluate(() => Object.keys(localStorage));
  assert.deepStrictEqual(keys, [], 'storage written after decline');
  await page.click('#cBack');
  await page.check('#cAgree');
  await page.click('#cAccept');
  await page.waitForSelector('#go');
  keys = await page.evaluate(() => Object.keys(localStorage));
  assert.ok(keys.includes('spk_consent'), 'consent not recorded');
  assert.deepStrictEqual(errors, [], 'console errors: ' + errors.join('; '));
  console.log('10 ok consent gate: no storage before/after decline, recorded on accept');
  await ctx.close();

  // 11. English UI via locale; legal pages open and go back
  ({ ctx, page, errors } = await fresh(browser, { locale: 'en-US' }, null, url, false));
  assert.ok((await page.textContent('h1')).includes('Before you start'));
  await page.check('#cAgree');
  await page.click('#cAccept');
  await page.waitForSelector('#go');
  assert.ok((await page.textContent('#go')).includes('Start today'));
  await page.click('[data-legal=privacy]');
  const pv = await page.textContent('#screen');
  assert.ok(/KVKK/.test(pv) && /browser vendor/.test(pv) && /not been|to be added before launch/.test(pv), 'privacy text incomplete');
  await page.click('#lBack');
  await page.waitForSelector('#go');
  await page.click('#langBtn');
  assert.ok((await page.textContent('#go')).includes('Bugünkü'), 'language toggle failed');
  await page.click('[data-legal=terms]');
  assert.ok(/IELTS/.test(await page.textContent('#screen')));
  assert.deepStrictEqual(errors, [], 'console errors: ' + errors.join('; '));
  console.log('11 ok English UI, legal pages, language toggle');
  await ctx.close();

  // 12. Friend challenge: A creates a link, B opens it, plays, sees both; tampered/XSS links are safe
  const shareCtx = { acceptDownloads: true };
  let A = await fresh(browser, shareCtx, combine(fakeSR, stubShare));
  await startTest(A.page);
  await A.page.waitForFunction(() => document.getElementById('tr') && /travel/.test(document.getElementById('tr').textContent)).catch(async (e) => { console.log('A html:', (await A.page.evaluate(() => document.getElementById('screen').innerHTML)).slice(0, 400)); throw e; });
  await A.page.click('#finish');
  await A.page.waitForSelector('#gSend');
  await A.page.fill('#nick', 'Efe');
  await A.page.click('#gSend');
  const shared = await A.page.evaluate(() => window.__shared);
  assert.ok(shared && /#c=/.test(shared.url), 'no challenge link produced');
  assert.ok(!/travel/.test(shared.url) && !/travel/.test(shared.text), 'text leaked into link');
  const link = shared.url;
  let Bp = await fresh(browser, {}, combine(fakeSR, stubShare), link);
  assert.ok(await Bp.page.isVisible('#cGo'), 'challenge intro missing');
  const intro = await Bp.page.textContent('#screen');
  assert.ok(/Efe/.test(intro), 'standings missing first player: ' + intro.slice(0, 200));
  await Bp.page.fill('#nick', 'Ayşe');
  await Bp.page.click('#cGo');
  await runStarted(Bp.page);
  await Bp.page.waitForFunction(() => document.getElementById('tr') && /travel/.test(document.getElementById('tr').textContent)).catch(async (e) => { console.log('B html:', (await Bp.page.evaluate(() => document.getElementById('screen').innerHTML)).slice(0, 400)); throw e; });
  await Bp.page.waitForTimeout(800);
  await Bp.page.click('#finish');
  await Bp.page.waitForSelector('.standings');
  const rows = await Bp.page.$$eval('.standings li', l => l.map(x => x.textContent));
  assert.strictEqual(rows.length, 2, 'group standings should have two players: ' + rows);
  assert.ok(rows.some(r => /Efe/.test(r)) && rows.some(r => /Ayşe/.test(r)));
  await Bp.page.click('#gSend');
  const link2 = await Bp.page.evaluate(() => window.__shared.url);
  assert.ok(link2.length > link.length, 'second link should carry both rounds');
  assert.deepStrictEqual(A.errors.concat(Bp.errors), [], 'console errors');
  await A.ctx.close(); await Bp.ctx.close();

  // tampered link
  const bad = await fresh(browser, {}, null, url + '#c=not-a-real-link');
  assert.ok((await bad.page.textContent('.notice')).includes('geçersiz'), 'invalid link not reported');
  await bad.ctx.close();
  // markup in a nickname must not execute or render
  const evil = Buffer.from(JSON.stringify({ v: 1, d: '2026-11-13', m: 'daily', t: 'free', lv: 'medium', i: 1, j: 1, r: [{ n: '<img src=x onerror=window.__pwn=1>', w: 10, u: 8, p: 100, f: 0 }] })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const xs = await fresh(browser, {}, null, url + '#c=' + evil);
  await xs.page.waitForSelector('#cGo');
  assert.strictEqual(await xs.page.evaluate(() => window.__pwn), undefined, 'XSS executed');
  assert.strictEqual((await xs.page.$$('#screen img')).length, 0, 'injected <img> rendered');
  assert.deepStrictEqual(xs.errors, [], 'console errors: ' + xs.errors);
  await xs.ctx.close();
  console.log('12 ok friend challenge round-trip, tampered and XSS links are safe');

  // 13. Backup / restore across devices, wrong code rejected, delete all data
  ({ ctx, page, errors } = await fresh(browser, {}, noSR));
  await startTest(page);
  await page.fill('#typed', 'hello world this is a small backup test for my progress');
  await page.click('#finish');
  await page.waitForSelector('#again');
  await page.click('#home');
  await page.click('.tab[data-tab=progress]');
  await page.fill('#nick', 'Deniz');
  await page.click('#nickSave');
  await page.click('#bkMake');
  const code = await page.inputValue('#bkCode');
  assert.ok(/^KNS1\./.test(code), 'no backup code');
  const dev2 = await fresh(browser, {}, noSR);
  await dev2.page.click('.tab[data-tab=progress]');
  await dev2.page.fill('#bkCode', code.slice(0, -2) + 'zz');
  await dev2.page.click('#bkRestore');
  assert.ok((await dev2.page.textContent('#bkNote')).includes('geçersiz'), 'tampered code accepted');
  await dev2.page.fill('#bkCode', code);
  await dev2.page.click('#bkRestore');
  assert.ok(/1\s*tamamlanan/.test(await dev2.page.textContent('.stats')), 'restore did not bring progress');
  assert.strictEqual(await dev2.page.inputValue('#nick'), 'Deniz');
  await dev2.ctx.close();
  await page.click('#delBtn');
  await page.click('#delYes');
  await page.waitForSelector('#cAccept');
  const left = await page.evaluate(() => Object.keys(localStorage));
  assert.deepStrictEqual(left, [], 'data left after delete: ' + left);
  assert.deepStrictEqual(errors, [], 'console errors: ' + errors.join('; '));
  console.log('13 ok backup code round-trip, tamper rejected, delete-all leaves nothing');
  await ctx.close();

  // 14. Vocabulary notebook fills from missed target words, drill starts a speed round
  ({ ctx, page, errors } = await fresh(browser, {}, noSR));
  await page.click('#go');
  await seek(page, /Hedef kelimelerle/);
  await runStarted(page);
  await page.fill('#typed', 'hello this is something completely different');
  await page.click('#finish');
  await page.waitForSelector('#again');
  assert.ok(/kelime defterine eklendi/.test(await page.textContent('#screen')), 'missed words not saved');
  await page.click('#home');
  await page.click('#vocabOpen');
  assert.ok((await page.$$('.vlist li')).length >= 3);
  await page.click('[data-rm="0"]');
  await page.click('#vDrill');
  assert.ok((await page.textContent('h1')).includes('Hız turu'));
  assert.deepStrictEqual(errors, [], 'console errors: ' + errors.join('; '));
  console.log('14 ok vocabulary notebook + drill');
  await ctx.close();

  // 15. Every new test type renders and runs (tongue twister, pitch, scene, pairs)
  ({ ctx, page, errors } = await fresh(browser, {}, fakeSR));
  await page.click('#go');
  for (const [re, check] of [[/Dil dönmesi/, '#passage'], [/1 dakikada/, '.points'], [/Sahneyi anlat/, '.scene'], [/Telaffuz çiftleri/, '#passage']]) {
    await seek(page, re);
    await runStarted(page);
    assert.ok(await page.$(check), 'missing ' + check + ' for ' + re);
    await page.waitForTimeout(700);
    await page.click('#finish');
    await page.waitForSelector('#again');
    await page.click('#next');
    await page.waitForSelector('#start');
  }
  assert.deepStrictEqual(errors, [], 'console errors: ' + errors.join('; '));
  console.log('15 ok twister, pitch, scene, pairs');
  await ctx.close();

  // 16. Served over http: manifest + icons load, service worker installs, app opens offline, CSP has no violations
  const { server, base } = await serve();
  ({ ctx, page, errors } = await fresh(browser, {}, noSR, base));
  const mani = (await ctx.request.get(base + 'manifest.webmanifest')).status();
  assert.strictEqual(mani, 200);
  // CSP really blocks network calls from the page
  const blocked = await page.evaluate(async () => { try { await fetch('manifest.webmanifest'); return false; } catch (e) { return true; } });
  assert.ok(blocked, 'CSP connect-src none not enforced');
  errors.length = 0;
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForSelector('#go');
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('#go', { timeout: 8000 });
  await ctx.setOffline(false);
  assert.deepStrictEqual(errors.filter(e => !/net::ERR/.test(e)), [], 'console errors: ' + errors.join('; '));
  console.log('16 ok PWA: manifest, service worker, offline reload');
  await ctx.close();
  server.close();

  await browser.close();
  console.log('ALL E2E CHECKS PASSED');
})().catch(e => { console.error('E2E FAIL:', e.message); process.exit(1); });
