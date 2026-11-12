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
  await page.waitForSelector('#time, #speak', { timeout: 8000 });
  if (await page.$('#speak')) { await page.click('#speak'); await page.waitForSelector('#time'); }
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

  await browser.close();
  console.log('ALL E2E CHECKS PASSED');
})().catch(e => { console.error('E2E FAIL:', e.message); process.exit(1); });
