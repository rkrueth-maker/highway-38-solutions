#!/usr/bin/env node
'use strict';

const { chromium } = require('playwright');

const [baseArg = 'https://highway38solutions.com/commercial-app/'] = process.argv.slice(2);
const base = new URL(baseArg);
const allowedPopupHosts = new Set([
  'script.google.com',
  'script.googleusercontent.com',
  'accounts.google.com'
]);

function fail(message, details = {}) {
  console.error(JSON.stringify({ status: 'FAIL', message, ...details }, null, 2));
  process.exitCode = 1;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      const stalledIndexedDb = {
        open() {
          return {};
        }
      };
      try {
        Object.defineProperty(window, 'indexedDB', {
          configurable: true,
          value: stalledIndexedDb
        });
      } catch (error) {
        window.indexedDB = stalledIndexedDb;
      }
    });

    const page = await context.newPage();
    const target = new URL(base);
    target.searchParams.set('browserAcceptanceBuild', '20260803-1140');
    await page.goto(target.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });

    const selector = '#secureSignInButton, #watchdogSecureSignInButton';
    await page.waitForSelector(selector, { state: 'visible', timeout: 20000 });
    const visibleSelector = await page.locator('#secureSignInButton').isVisible().catch(() => false)
      ? '#secureSignInButton'
      : '#watchdogSecureSignInButton';

    const popupPromise = page.waitForEvent('popup', { timeout: 8000 });
    await page.click(visibleSelector);
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await popup.waitForTimeout(600);

    const popupUrl = popup.url();
    const popupHost = popupUrl && popupUrl !== 'about:blank' ? new URL(popupUrl).hostname : '';
    if (!popupHost || !allowedPopupHosts.has(popupHost)) {
      fail('The visible secure sign-in control did not open the authorized Google window.', {
        clickedSelector: visibleSelector,
        popupUrl,
        popupHost
      });
      return;
    }

    const businessStatus = (await page.locator('#businessStatus').textContent().catch(() => '')) || '';
    const directHref = await page.locator(visibleSelector).getAttribute('href');
    if (!directHref || !directHref.includes('script.google.com/macros/s/') || !directHref.includes('bridge=1')) {
      fail('The visible sign-in control did not retain a direct Apps Script authorization link.', {
        clickedSelector: visibleSelector,
        directHref
      });
      return;
    }

    console.log(JSON.stringify({
      status: 'PASS',
      acceptance: 'BROWSER_SIGNIN_CLICK_WITH_INDEXEDDB_STALLED',
      publicUrl: target.toString(),
      clickedSelector: visibleSelector,
      directLinkPresent: true,
      popupOpened: true,
      popupHost,
      businessStatus,
      indexedDbWasStalled: true
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  fail('Browser-level secure sign-in acceptance crashed.', { error: error.message });
});
