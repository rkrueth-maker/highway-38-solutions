const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.SUPABASE_URL;
const WEB_BASE = (process.env.H38_WEB_BASE || BASE).replace(/\/$/, '');
const KEY = process.env.SUPABASE_KEY;
const EMAIL = process.env.SCOUT_EMAIL;
const PASSWORD = process.env.SCOUT_PASSWORD;
const OUT = process.env.H38_DEAL_ENGINE_OUT || 'artifacts/scout-deal-engine-acceptance/report.json';
const report = { started_at: new Date().toISOString(), checks: [], cleanup: [], failures: [] };
const qa = 'H38 QA Engine ' + Date.now();

function check(name, ok, detail = '') {
  report.checks.push({ name, ok: !!ok, detail: String(detail || '') });
  if (!ok) throw new Error(name + (detail ? ': ' + detail : ''));
}
async function session() {
  const r = await fetch(BASE + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: KEY },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const raw = await r.text();
  check('Deal Engine auth', r.ok, 'HTTP ' + r.status + ' ' + raw.slice(0, 250));
  const s = JSON.parse(raw);
  s.expires_at = Math.floor(Date.now() / 1000) + Number(s.expires_in || 3600);
  return s;
}
async function api(s, body) {
  const r = await fetch(BASE + '/functions/v1/h38-deal-engine-api', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + s.access_token,
      apikey: KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const raw = await r.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { raw }; }
  if (!r.ok || data.error) throw new Error('Deal Engine API ' + r.status + ' ' + JSON.stringify(data).slice(0, 1000));
  return data;
}
async function browserSession(context, s) {
  await context.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: 'sb-jqukmwtsgcsaruucnqja-auth-token', value: s });
}
async function cleanupWatch(s, id) {
  if (!id) return;
  try { await api(s, { action: 'watch_delete', id }); report.cleanup.push('watch ' + id); } catch (e) { report.cleanup.push('watch cleanup failed ' + id + ': ' + e.message); }
}
async function cleanupAction(s, key) {
  if (!key) return;
  try { await api(s, { action: 'action_clear', canonical_key: key }); report.cleanup.push('action ' + key); } catch (e) { report.cleanup.push('action cleanup failed ' + key + ': ' + e.message); }
}
async function cleanupQueue(s, id) {
  if (!id) return;
  try { await api(s, { action: 'queue_update', id, status: 'cancelled' }); report.cleanup.push('queue ' + id); } catch (e) { report.cleanup.push('queue cleanup failed ' + id + ': ' + e.message); }
}

(async () => {
  if (!BASE || !KEY || !EMAIL || !PASSWORD) throw new Error('Missing Deal Engine acceptance environment');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const s = await session();
  let directWatchId = '', uiWatchId = '', directKey = '', uiKey = '', directQueueId = '', uiQueueId = '';
  let browser;
  try {
    const refreshed = await api(s, { action: 'refresh', refresh_sources: false, since: new Date(Date.now() - 86400000).toISOString() });
    check('Deal Engine refresh populated observations', Number(refreshed.refresh?.observation_count || 0) > 0, JSON.stringify(refreshed.refresh || {}));
    check('Deal Engine Best Opportunities nonempty', (refreshed.segments?.best || []).length > 0, 'best=' + (refreshed.segments?.best || []).length);
    check('Deal Engine state recorded source counts', !!refreshed.state?.source_counts, JSON.stringify(refreshed.state || {}));
    check('Deal Engine source warnings truthful array', Array.isArray(refreshed.state?.warnings), JSON.stringify(refreshed.state?.warnings));

    const best = refreshed.segments.best || [];
    const resell = refreshed.segments.resell || [];
    check('Deal Engine no invented Resale profit', resell.every(x =>
      x.estimated_profit != null && x.expected_resale != null && x.observed_price != null && x.payload?.engine_cost_complete === true
    ), 'resell_known=' + resell.length);
    check('Deal Engine missing economics remain unknown', best.some(x => x.estimated_profit == null), 'Expected at least one opportunity without fabricated profit');

    directKey = best[0].canonical_key;
    const history = await api(s, { action: 'history', canonical_key: directKey });
    check('Deal Engine history available', Number(history.summary?.observations || 0) > 0, JSON.stringify(history.summary || {}));

    const watchSaved = await api(s, {
      action: 'watch_save',
      watch: {
        query_text: qa,
        retailer: 'Walmart',
        product_area: 'all',
        watch_mode: 'rule',
        max_buy_price: 25,
        min_discount_percent: 20,
      },
    });
    directWatchId = watchSaved.watch?.id || '';
    check('Deal Engine unified watch saved', !!directWatchId, JSON.stringify(watchSaved.watch || {}));
    check('Deal Engine watch mirrored to Resale', !!watchSaved.watch?.legacy_reseller_watch_id);
    check('Deal Engine watch mirrored to Couponing', !!watchSaved.watch?.legacy_coupon_watch_id);

    let afterWatch = await api(s, { action: 'overview' });
    check('Deal Engine saved watch visible', (afterWatch.watches || []).some(x => x.id === directWatchId));

    const bought = await api(s, { action: 'set_action', canonical_key: directKey, decision: 'buy', quantity: 1, notes: qa });
    directQueueId = bought.queue?.id || '';
    check('Deal Engine Buy creates sourcing queue', !!directQueueId, JSON.stringify(bought.queue || {}));
    let afterBuy = await api(s, { action: 'overview' });
    check('Deal Engine sourcing queue visible', (afterBuy.queue || []).some(x => x.id === directQueueId));

    await api(s, { action: 'set_action', canonical_key: directKey, decision: 'pass', notes: qa });
    const afterPass = await api(s, { action: 'overview' });
    check('Deal Engine Pass hides default opportunity', !(afterPass.segments.best || []).some(x => x.canonical_key === directKey));
    await cleanupAction(s, directKey);
    await cleanupQueue(s, directQueueId); directQueueId = '';
    await cleanupWatch(s, directWatchId); directWatchId = '';

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await browserSession(context, s);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(WEB_BASE + '/best.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#app:not(.hidden)', { timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('.deal').length > 0, null, { timeout: 90000 });
    check('Deal Engine dashboard renders cards', await page.locator('.deal').count() > 0);
    check('Deal Engine dashboard five task tabs', await page.locator('.tab').count() === 5);
    const overflow = await page.evaluate(() => ({
      innerWidth,
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    check('Deal Engine 390px no horizontal overflow', overflow.doc <= overflow.innerWidth + 1 && overflow.body <= overflow.innerWidth + 1, JSON.stringify(overflow));

    const first = page.locator('.deal').first();
    uiKey = await first.getAttribute('data-key');
    await first.locator('.hist').click();
    await first.locator('.history:not(.hidden)').waitFor({ timeout: 30000 });
    check('Deal Engine History button', (await first.locator('.history').innerText()).trim().length > 0);

    await first.locator('.act[data-action="watch"]').click();
    await page.waitForFunction(() => /Watch created/i.test(document.querySelector('#status')?.textContent || ''), null, { timeout: 60000 });
    let uiOverview = await api(s, { action: 'overview' });
    const uiRow = (uiOverview.segments.best || []).find(x => x.canonical_key === uiKey) ||
                  (uiOverview.segments.savings || []).find(x => x.canonical_key === uiKey);
    const createdIds = uiRow?.watch_rule_ids || [];
    uiWatchId = createdIds.find(id => !(uiOverview.watches || []).find(w => w.id === id)?.query_text?.startsWith('H38 QA')) || createdIds[0] || '';
    check('Deal Engine Watch button persists shared watch', !!uiWatchId, JSON.stringify(createdIds));

    const refreshedCard = page.locator('.deal[data-key="' + uiKey.replace(/"/g, '\\"') + '"]').first();
    if (await refreshedCard.count()) {
      await refreshedCard.locator('.act[data-action="buy"]').click();
    } else {
      await page.locator('.deal').first().locator('.act[data-action="buy"]').click();
      uiKey = await page.locator('.deal').first().getAttribute('data-key');
    }
    await page.waitForFunction(() => /Added to sourcing queue/i.test(document.querySelector('#status')?.textContent || ''), null, { timeout: 60000 });
    uiOverview = await api(s, { action: 'overview' });
    const uiQueue = (uiOverview.queue || []).find(q => q.canonical_key === uiKey && ['planned','purchased','listed'].includes(q.status));
    uiQueueId = uiQueue?.id || '';
    check('Deal Engine Buy button persists sourcing queue', !!uiQueueId);

    const passCard = page.locator('.deal[data-key="' + uiKey.replace(/"/g, '\\"') + '"]').first();
    if (await passCard.count()) {
      await passCard.locator('.act[data-action="pass"]').click();
      await page.waitForFunction(() => /Passed/i.test(document.querySelector('#status')?.textContent || ''), null, { timeout: 60000 });
      const passedOverview = await api(s, { action: 'overview' });
      check('Deal Engine Pass button persists', !(passedOverview.segments.best || []).some(x => x.canonical_key === uiKey));
    } else {
      check('Deal Engine Pass button available after Buy', false, 'Card disappeared unexpectedly before Pass test');
    }

    await page.click('[data-tab="watches"]');
    check('Deal Engine Watches tab', await page.locator('#watchesPane:not(.hidden)').count() === 1);
    await page.click('[data-tab="queue"]');
    check('Deal Engine Queue tab', await page.locator('#queuePane:not(.hidden)').count() === 1);
    check('Deal Engine dashboard uncaught JS', errors.length === 0, errors.join(' | '));

    await context.close();

    await cleanupAction(s, uiKey);
    await cleanupQueue(s, uiQueueId); uiQueueId = '';
    await cleanupWatch(s, uiWatchId); uiWatchId = '';

    const final = await api(s, { action: 'health' });
    check('Deal Engine health endpoint', final.ok === true && Number(final.active_observations || 0) > 0, JSON.stringify(final));

    const leftovers = await api(s, { action: 'overview' });
    check('Deal Engine QA watch cleanup', !(leftovers.watches || []).some(w => String(w.query_text || '').startsWith('H38 QA Engine ')));
    check('Deal Engine QA queue cleanup', !(leftovers.queue || []).some(q => String(q.notes || '').startsWith('H38 QA Engine ')));

    report.finished_at = new Date().toISOString();
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log('H38_DEAL_ENGINE_ACCEPTANCE_PASS');
    for (const c of report.checks) console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name + (c.detail ? ' — ' + c.detail : ''));
  } catch (e) {
    report.failures.push(String(e && e.stack || e));
    try { await cleanupAction(s, directKey); } catch {}
    try { await cleanupQueue(s, directQueueId); } catch {}
    try { await cleanupWatch(s, directWatchId); } catch {}
    try { await cleanupAction(s, uiKey); } catch {}
    try { await cleanupQueue(s, uiQueueId); } catch {}
    try { await cleanupWatch(s, uiWatchId); } catch {}
    report.finished_at = new Date().toISOString();
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    throw e;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
