// Functional checks against the local server: product configurator, gallery filter + lightbox, FAQ filter, lead-form validation (never submits).
import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:4321';
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const ok = (n, c, x = '') => console.log(c ? 'PASS' : 'FAIL', n, x);

await p.goto(BASE + '/products/modern-white'); await p.waitForTimeout(500);
const price0 = await p.textContent('#pd-price');
await p.click('label.chip:has-text("2×2")'); await p.waitForTimeout(300);
ok('config price changes', (await p.textContent('#pd-price')) !== price0, `${price0} -> ${await p.textContent('#pd-price')}`);
ok('config dims', (await p.textContent('[data-d=n]')).startsWith('4'), await p.textContent('[data-d=n]'));
ok('book link carries size', (await p.getAttribute('#pd-book', 'href')).includes('size=2X2'), await p.getAttribute('#pd-book', 'href'));
await p.click('summary:has-text("How many consoles")'); await p.fill('#rl', '5'); await p.fill('#rw', '4');
ok('calculator', /25.*35|25–35/.test(await p.textContent('#calc-out')) || /m²/.test(await p.textContent('#calc-out')), await p.textContent('#calc-out'));

await p.goto(BASE + '/pages/book-a-site-visit?product=Modern%20White&size=2X2'); await p.waitForTimeout(500);
ok('book prefill', (await p.inputValue('textarea[name=specify_the_area_in_the_layout_where_you_want_the_sunroof]')).includes('Modern White'));
await p.click('form[data-lead-form] button[type=submit]'); await p.waitForTimeout(300);
ok('form blocks empty submit (still on page)', p.url().includes('book-a-site-visit'));
ok('form shows errors', (await p.locator('.err:not(:empty)').count()) > 0);

await p.goto(BASE + '/pages/gallery'); await p.waitForTimeout(500);
await p.click('button[data-k=type][data-v=Commercial]'); await p.waitForTimeout(200);
ok('gallery filter', (await p.textContent('#gl-n')).startsWith('20'), await p.textContent('#gl-n'));
await p.locator('.gl__grid li:not([hidden]) .gl__b').first().click(); await p.waitForTimeout(500);
ok('lightbox opens', await p.evaluate(() => document.querySelector('.gl__lb').open));
await p.keyboard.press('ArrowRight'); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
ok('lightbox closes on Esc', !(await p.evaluate(() => document.querySelector('.gl__lb').open)));

await p.goto(BASE + '/pages/faqs'); await p.waitForTimeout(300);
const all = await p.locator('.fq__i:visible').count(); await p.click('button[data-g=Installation]');
const inst = await p.locator('.fq__i:visible').count(); ok('faq filter', inst > 0 && inst < all, `${all} -> ${inst}`);

// reduced motion: home hero must still render content
const rm = await (await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })).newPage();
await rm.goto(BASE + '/'); await rm.waitForTimeout(1500);
ok('reduced-motion home renders h1', (await rm.locator('h1').first().isVisible()));
console.log('pageerrors', errs);
await b.close();
