// Manual browser check (not part of node --test): node tests/e2e-check.js
const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');
const url = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');

async function fresh(browser, opts = {}, init) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(url);
  return { ctx, page, errors };
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

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });

  // 1. Home layout on a phone-sized screen
  let { ctx, page, errors } = await fresh(browser);
  const theme = await page.textContent('h1');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, 'horizontal scroll ' + overflow);
  const small = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.getBoundingClientRect().height < 44).length);
  assert.strictEqual(small, 0, 'buttons under 44px');
  console.log('1 ok  home layout; theme =', theme.trim());

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

  // 3. Full flow with browser SR (headless: expect fallback or live), typed answer
  await page.reload();
  const t3 = await startTest(page);
  await page.waitForTimeout(1500);
  if (!(await page.$('#typed'))) {
    console.log('  note: SR stayed live in headless; forcing typed path is covered in step 5');
    await page.click('#finish');
  } else {
    await page.fill('#typed', 'I really like to travel and book a nice destination for my holiday');
    await page.click('#finish');
  }
  await page.waitForSelector('#again');
  console.log('3 ok  flow finished for', t3.trim(), '→', (await page.textContent('h1')).trim());
  assert.deepStrictEqual(errors, [], 'console errors: ' + errors.join('; '));
  await ctx.close();

  // 4. No speech support: notice on home, textarea right away, typed result + stats
  ({ ctx, page, errors } = await fresh(browser, {}, () => {
    delete window.SpeechRecognition; delete window.webkitSpeechRecognition;
  }));
  assert.ok((await page.textContent('.notice')).includes('desteklemiyor'));
  await startTest(page);
  assert.ok(await page.$('#typed'), 'textarea fallback missing');
  await page.fill('#typed', 'hello world this is a test');
  await page.click('#finish');
  await page.waitForSelector('#again');
  const res = await page.textContent('.result-grid');
  assert.ok(res.includes('6'), 'word count missing: ' + res);
  assert.ok(res.includes('–'), 'typed mode must not show a fake wpm');
  await page.click('#home');
  assert.ok((await page.textContent('#streakPill')).includes('1'), 'streak pill not updated');
  assert.ok(await page.$('.dot.done'), 'week strip has no done day');
  assert.ok((await page.textContent('.goal')).includes('1/2'), 'goal ring not updated');
  await page.click('.tab[data-tab=progress]');
  const stats = await page.textContent('.stats');
  assert.ok(/1\s*gün seri/.test(stats) && /1\s*tamamlanan/.test(stats), 'streak/done not updated: ' + stats);
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

  // 7. Fake speech recognition: live transcript, wpm, analysis, XP, compare on retry, share download
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
  ({ ctx, page, errors } = await fresh(browser, { acceptDownloads: true }, fakeSR));
  await startTest(page);
  await page.waitForFunction(() => /travel/.test(document.getElementById('tr').textContent));
  await page.waitForTimeout(1200);
  await page.click('#finish');
  await page.waitForSelector('#again');
  const body7 = await page.textContent('main, #screen');
  assert.ok(/\+\d+ XP/.test(body7), 'no XP banner');
  assert.ok(/Konuşma analizi/.test(body7) && /Dolgu/.test(body7), 'no analysis');
  assert.ok(/Tempo/.test(body7), 'no pace label');
  assert.ok(/İlk denemen/.test(body7), 'first attempt note missing');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dl')]);
  assert.strictEqual(dl.suggestedFilename(), 'konus-sonuc.png');
  // retry the same test: comparison appears
  await page.click('#again');
  await page.click('#start');
  await page.waitForSelector('#time, #speak, #prepgo', { timeout: 8000 });
  if (await page.$('#prepgo')) await page.click('#prepgo'); else if (await page.$('#speak')) await page.click('#speak');
  await page.waitForSelector('#time');
  await page.waitForFunction(() => /travel/.test(document.getElementById('tr').textContent));
  await page.click('#finish');
  await page.waitForSelector('#again');
  assert.ok(/Geçen denemeyle kıyas/.test(await page.textContent('#screen')) && !/İlk denemen/.test(await page.textContent('#screen')), 'compare missing');
  await page.click('#home');
  await page.click('.tab[data-tab=progress]');
  const prog = await page.textContent('#screen');
  assert.ok(/Konuşma pasaportu \(\d\/9\)/.test(prog) && !/Konuşma pasaportu \(0\/9\)/.test(prog), 'passport empty');
  assert.ok(/Yeni|İlk|Rozetler/.test(prog));
  assert.deepStrictEqual(errors, [], 'console errors: ' + errors.join('; '));
  console.log('7 ok  fake SR, analysis, XP, compare, share download, passport');
  await ctx.close();

  // 8. IELTS mode runs all three parts without errors (typed fallback)
  ({ ctx, page, errors } = await fresh(browser, {}, () => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; }));
  await page.click('[data-mode=ielts]');
  assert.ok((await page.textContent('h1')).includes('IELTS'));
  assert.ok(!(await page.$('[data-level]')), 'level picker should hide in IELTS mode');
  const seen = new Set();
  for (let i = 0; i < 6; i++) {
    await page.click('#go, #again').catch(() => {});
    await page.click('#start');
    await page.waitForSelector('#time, #prepgo', { timeout: 8000 });
    if (await page.$('#prepgo')) { seen.add('part2'); await page.click('#prepgo'); await page.waitForSelector('#time'); }
    await page.fill('#typed', 'I think this is a good question and I would like to answer it with several words');
    await page.click('#finish');
    await page.waitForSelector('#next');
    await page.click('#next');
    seen.add((await page.textContent('h1')).trim());
  }
  assert.ok(seen.size >= 3, 'IELTS variety too low: ' + [...seen].join('|'));
  assert.deepStrictEqual(errors, [], 'console errors: ' + errors.join('; '));
  console.log('8 ok  IELTS mode:', [...seen].join(' | '));
  await ctx.close();

  // 9. Optional audio recording with a fake mic
  ({ ctx, page, errors } = await fresh(browser, { permissions: ['microphone'] }, fakeSR));
  await ctx.close();
  const b2 = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  ({ ctx, page, errors } = await fresh(b2, { permissions: ['microphone'] }, fakeSR));
  await page.click('#go');
  await page.check('#audioToggle');
  await page.click('#start');
  await page.waitForSelector('#time, #speak, #prepgo', { timeout: 8000 });
  if (await page.$('#prepgo')) await page.click('#prepgo'); else if (await page.$('#speak')) await page.click('#speak');
  await page.waitForSelector('#time');
  await page.waitForTimeout(1800);
  await page.click('#finish');
  await page.waitForSelector('#again');
  assert.ok(await page.$('#replayAudio'), 'audio player missing');
  assert.deepStrictEqual(errors, [], 'console errors: ' + errors.join('; '));
  console.log('9 ok  audio playback recorded');
  await ctx.close();
  await b2.close();

  await browser.close();
  console.log('ALL E2E CHECKS PASSED');
})().catch(e => { console.error('E2E FAIL:', e.message); process.exit(1); });
