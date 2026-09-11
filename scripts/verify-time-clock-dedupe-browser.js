#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent(`<!doctype html><html><head></head><body><main id="mainContent"><section class="card" id="todayAnchor">Today anchor</section></main><div id="toast" class="hidden"></div></body></html>`);
    await page.evaluate(() => {
      window.state = { page: 'today', businessId: '00000000-0000-0000-0000-000000000038' };
      window.__h38TimeStateCalls = 0;
      window.__h38ClockedIn = false;
      window.H38_SUPABASE_SHARED_CLIENT = {
        ensure() {
          return {
            async rpc(name) {
              if (name === 'business_office_time_state') {
                window.__h38TimeStateCalls += 1;
                await new Promise(resolve => setTimeout(resolve, 160));
                return {
                  data: {
                    currentPunch: window.__h38ClockedIn ? { 'Start Time': '2026-09-10T19:30:00.000Z' } : null,
                    canEdit: false,
                    recent: []
                  },
                  error: null
                };
              }
              if (name === 'business_office_clock_in') {
                window.__h38ClockedIn = true;
                return { data: { Status: 'Recorded' }, error: null };
              }
              if (name === 'business_office_clock_out') {
                window.__h38ClockedIn = false;
                return { data: { Status: 'Recorded' }, error: null };
              }
              return { data: {}, error: null };
            }
          };
        }
      };
    });

    await page.addScriptTag({ path: path.resolve('commercial-app/erp-foundation.js') });

    // Keep creating mutations/focus events while the deliberately slow time-state RPC is unresolved.
    // The old renderer passed its pre-await DOM check several times and produced duplicate IDs/cards.
    for (let i = 0; i < 5; i += 1) {
      await page.waitForTimeout(55);
      await page.evaluate(index => {
        const marker = document.createElement('i');
        marker.dataset.testMutation = String(index);
        document.body.appendChild(marker);
        window.dispatchEvent(new Event('focus'));
      }, i);
    }
    await page.waitForTimeout(450);

    let result = await page.evaluate(() => ({
      cards: document.querySelectorAll('#h38TimeClockCard').length,
      calls: window.__h38TimeStateCalls,
      label: document.querySelector('#h38TimeClockCard .h38-time-state')?.textContent || ''
    }));
    assert.equal(result.cards, 1, `expected exactly one Time clock card after concurrent renders, got ${result.cards}`);
    assert.equal(result.calls, 1, `expected one shared time-state RPC while render was in flight, got ${result.calls}`);
    assert.equal(result.label, 'Not clocked in');

    // Prove the self-heal path removes stale duplicate cards already in the DOM.
    await page.evaluate(() => {
      const main = document.getElementById('mainContent');
      const original = document.getElementById('h38TimeClockCard');
      main.insertBefore(original.cloneNode(true), original.nextSibling);
      main.insertBefore(original.cloneNode(true), original.nextSibling);
      const mutation = document.createElement('b');
      mutation.textContent = 'force dedupe';
      main.appendChild(mutation);
    });
    await page.waitForTimeout(180);
    result = await page.evaluate(() => ({ cards: document.querySelectorAll('#h38TimeClockCard').length }));
    assert.equal(result.cards, 1, `expected stale duplicate Time clock cards to self-heal to one, got ${result.cards}`);

    // A real punch refresh must replace the single card, not recreate the race.
    await page.locator('#h38TimeClockCard [data-h38-clock="in"]').click();
    await page.waitForTimeout(450);
    result = await page.evaluate(() => ({
      cards: document.querySelectorAll('#h38TimeClockCard').length,
      action: document.querySelector('#h38TimeClockCard [data-h38-clock]')?.textContent || '',
      state: document.querySelector('#h38TimeClockCard .h38-time-state')?.textContent || ''
    }));
    assert.equal(result.cards, 1, `expected exactly one Time clock card after clock-in refresh, got ${result.cards}`);
    assert.equal(result.action, 'Clock out');
    assert.match(result.state, /^Clocked in /);

    const meta = await page.evaluate(() => window.H38_ERP_FOUNDATION);
    assert.equal(meta.timeClockSingleFlight, true);
    assert.equal(meta.timeClockCardDeduped, true);
    console.log('PASS: Today time-clock render is single-flight and duplicate-safe.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
