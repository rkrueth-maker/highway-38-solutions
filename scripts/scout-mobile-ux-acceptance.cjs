const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.H38_WEB_BASE || 'http://127.0.0.1:4173';
const SB = process.env.SUPABASE_URL || process.env.SB_URL;
const KEY = process.env.SUPABASE_KEY || process.env.SB_KEY;
const EMAIL = process.env.SCOUT_EMAIL;
const PASSWORD = process.env.SCOUT_PASSWORD;
const OUT = process.env.H38_MOBILE_OUT || 'artifacts/scout-mobile-ux';
const sizes = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];
const pages = [
  { name: 'shell', url: '/index.html', selectors: ['#products', '#product-penny', '#product-resale', '#product-coupon'] },
  { name: 'penny', url: '/penny.html', selectors: ['.back', '#lookupOpen', '#refresh', '#search', '#stores'] },
  { name: 'resale', url: '/resale.html', selectors: ['.top a', '[data-tab="deals"]', '.sources summary', '#search', '#scan'] },
  { name: 'coupon', url: '/coupon.html', selectors: ['.top a', '.nav', '[data-view="shop"]', '[data-view="deals"]', '[data-view="receipts"]'] },
  { name: 'maintenance', url: '/maintenance.html', selectors: ['.top a', '#check', '#maintain', '#report'] },
];

function fail(msg) { throw new Error(msg); }
async function authSession() {
  const r = await fetch(SB + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: KEY },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const t = await r.text();
  if (!r.ok) fail('Auth failed ' + r.status + ' ' + t.slice(0, 200));
  const s = JSON.parse(t);
  s.expires_at = Math.floor(Date.now() / 1000) + Number(s.expires_in || 3600);
  return s;
}
async function assertInViewport(page, selector, label) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: 'visible', timeout: 30000 });
  const b = await el.boundingBox();
  const vp = page.viewportSize();
  if (!b || !vp) fail(label + ' has no box');
  if (b.x < -1 || b.x + b.width > vp.width + 1) fail(label + ' clipped horizontally: ' + JSON.stringify(b) + ' viewport ' + JSON.stringify(vp));
  if (b.y < -1) fail(label + ' clipped above viewport: ' + JSON.stringify(b));
}
(async () => {
  if (!SB || !KEY || !EMAIL || !PASSWORD) fail('Missing mobile acceptance environment');
  fs.mkdirSync(OUT, { recursive: true });
  const session = await authSession();
  const browser = await chromium.launch({ headless: true });
  const report = [];
  try {
    for (const size of sizes) {
      const context = await browser.newContext({ viewport: size });
      await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
        key: 'sb-jqukmwtsgcsaruucnqja-auth-token', value: session,
      });
      for (const spec of pages) {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        await page.goto(BASE + spec.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(spec.name === 'maintenance' ? 6500 : 3500);
        const metrics = await page.evaluate(() => ({
          innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
          active: document.activeElement && document.activeElement.tagName,
        }));
        if (metrics.scrollWidth > metrics.innerWidth + 1 || metrics.bodyScrollWidth > metrics.innerWidth + 1) {
          fail(spec.name + ' ' + size.width + 'px horizontal overflow ' + JSON.stringify(metrics));
        }
        for (const sel of spec.selectors) await assertInViewport(page, sel, spec.name + ' ' + size.width + ' ' + sel);
        if (spec.name === 'coupon') {
          for (const view of ['shop','deals','save','scan','receipts']) {
            await assertInViewport(page, '[data-view="' + view + '"]', 'coupon ' + size.width + ' tab ' + view);
          }
        }
        if (spec.name === 'penny') {
          const text = await page.locator('#stores').innerText().catch(() => '');
          if (/Show all\s+\d{3,}/i.test(text)) fail('Penny still exposes giant Show all at ' + size.width + 'px');
        }
        const shot = path.join(OUT, spec.name + '-' + size.width + 'x' + size.height + '.png');
        await page.screenshot({ path: shot, fullPage: true });
        report.push({ page: spec.name, ...size, metrics, errors, screenshot: shot });
        if (errors.length) fail(spec.name + ' ' + size.width + ' uncaught JS: ' + errors.join(' | '));
        await page.close();
      }
      await context.close();
    }
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ ok: true, generated_at: new Date().toISOString(), report }, null, 2));
    console.log('H38_SCOUT_MOBILE_UX_PASS', report.length, 'screens');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
