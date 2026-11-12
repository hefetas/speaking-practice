const test = require('node:test');
const assert = require('node:assert');
const I = require('../app/i18n.js');
const G = require('../app/legal.js');

const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');

test('i18n: tr and en have identical keys and identical placeholders', () => {
  const tr = Object.keys(I.tr).sort();
  const en = Object.keys(I.en).sort();
  assert.deepStrictEqual(tr, en);
  tr.forEach(k => assert.strictEqual(ph(I.tr[k]), ph(I.en[k]), 'placeholder mismatch in ' + k));
  tr.forEach(k => { assert.ok(String(I.tr[k]).length > 0 && String(I.en[k]).length > 0, 'empty ' + k); });
});

test('i18n.t fills {vars}, falls back to tr then key', () => {
  assert.strictEqual(I.t('en', 'home_goal_left', { n: 2 }), I.en.home_goal_left.replace('{n}', '2'));
  assert.strictEqual(I.t('xx', 'home_goal_left', { n: 1 }), I.tr.home_goal_left.replace('{n}', '1'));
  assert.strictEqual(I.t('tr', 'no_such_key'), 'no_such_key');
});

test('i18n: every test id has a title and hint in both languages', () => {
  const C = require('../app/content.js');
  C.TESTS.concat(C.IELTS_TESTS).forEach(t => {
    ['tr', 'en'].forEach(l => {
      assert.ok(I.testTitle(l, t.id), 'title ' + l + ' ' + t.id);
      assert.ok(I.testHint(l, t.id), 'hint ' + l + ' ' + t.id);
    });
  });
});

test('legal: both languages cover privacy, terms and about with the same structure', () => {
  ['privacy', 'terms', 'about'].forEach(k => {
    assert.ok(G.tr[k].length >= 5, k + ' too short');
    assert.strictEqual(G.tr[k].length, G.en[k].length, k + ' section count differs');
    G.tr[k].concat(G.en[k]).forEach(s => assert.ok(s.h && Array.isArray(s.p) && s.p.length, 'bad section in ' + k));
  });
});

test('legal: privacy discloses browser speech processing, local storage, nickname in links, rights and age', () => {
  const tr = JSON.stringify(G.tr.privacy);
  const en = JSON.stringify(G.en.privacy);
  assert.ok(/KVKK/.test(tr) && /6698/.test(tr));
  assert.ok(/Google|Microsoft|tarayıcı sağlayıcı/i.test(tr) && /Google|Microsoft|browser vendor/i.test(en));
  assert.ok(/localStorage|yerel depolama/i.test(tr));
  assert.ok(/takma ad/i.test(tr) && /nickname/i.test(en));
  assert.ok(/Madde 11|md\. ?11|11\. madde/i.test(tr));
  assert.ok(/18/.test(tr) && /18/.test(en));
});

test('legal: terms disclaim estimates, trademark affiliation and warranty', () => {
  const tr = JSON.stringify(G.tr.terms) + JSON.stringify(G.tr.about);
  const en = JSON.stringify(G.en.terms) + JSON.stringify(G.en.about);
  assert.ok(/IELTS/.test(tr) && /bağlantılı|ilişkili|onaylamaz/i.test(tr) && /marka/i.test(tr));
  assert.ok(/IELTS/.test(en) && /affiliated|endorsed/i.test(en) && /trademark/i.test(en));
  assert.ok(/olduğu gibi/i.test(tr) && /as is|"as-is"/i.test(en));
  assert.ok(/tahmin/i.test(tr) && /estimate/i.test(en));
});

test('legal: operator and contact are placeholders filled from config, never hardcoded', () => {
  const all = JSON.stringify(G);
  assert.ok(all.includes('{operator}') && all.includes('{contact}'));
  assert.ok(!/@\w+\.\w+/.test(all), 'hardcoded e-mail');
  assert.ok(!/https?:\/\//.test(all), 'absolute URL in legal text');
});
