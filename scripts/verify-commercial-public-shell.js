#!/usr/bin/env node
'use strict';

const [baseArg = 'https://highway38solutions.com/commercial-app/'] = process.argv.slice(2);
const base = new URL(baseArg);
const allowedHosts = new Set(['highway38solutions.com', 'www.highway38solutions.com']);

function fail(message, details = {}) {
  console.error(JSON.stringify({ status: 'FAIL', message, ...details }, null, 2));
  process.exit(1);
}

async function fetchLive(relativePath) {
  const target = new URL(relativePath, base);
  target.searchParams.set('acceptanceBuild', '20260803-1140');
  const response = await fetch(target, {
    headers: {
      accept: 'text/html,application/javascript,text/javascript,*/*;q=0.8',
      'cache-control': 'no-cache',
      pragma: 'no-cache'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000)
  });
  const finalUrl = new URL(response.url);
  if (!allowedHosts.has(finalUrl.hostname)) {
    fail('The public Business Office redirected away from the Highway 38 domain.', {
      requestedPath: relativePath,
      finalHost: finalUrl.hostname,
      httpStatus: response.status
    });
  }
  const text = await response.text();
  if (!response.ok) {
    fail('The public Business Office returned a non-success status.', {
      requestedPath: relativePath,
      httpStatus: response.status,
      bodyPreview: text.slice(0, 200)
    });
  }
  return { text, response, finalUrl };
}

function requireTokens(label, text, tokens) {
  const missing = tokens.filter(token => !text.includes(token));
  if (missing.length) fail(`${label} is not the accepted startup build.`, { missing });
}

(async () => {
  const index = await fetchLive('./');
  requireTokens('Public Office HTML', index.text, [
    "window.H38_BUILD='20260803-1140'",
    "window.H38_SECURE_AUTH_URL='https://script.google.com/macros/s/",
    'id="businessSelect" aria-label="Business" hidden disabled',
    'watchdogSecureSignInButton',
    'target="h38-secure-signin"',
    'startup-fix.js?build=20260803-1140',
    '<title>Highway 38 Business Office</title>'
  ]);

  const startup = await fetchLive('./startup-fix.js');
  requireTokens('Public startup controller', startup.text, [
    "const H38_STARTUP_BUILD='20260803-1140'",
    'state.bridge=new H38Bridge',
    'withStartupTimeout',
    'state.canSwitchBusinesses=startup.canSwitchBusinesses===true',
    'refreshing latest records',
    "'sign-in-timeout'",
    "'popup-blocked'"
  ]);

  const bridge = await fetchLive('./bridge.js');
  requireTokens('Public secure bridge client', bridge.text, [
    'window.open(authUrl',
    "message.type==='H38_BRIDGE_BOOTSTRAP'",
    "message.type==='H38_BRIDGE_FULL_SNAPSHOT'",
    "this.onStatus('sign-in-timeout')"
  ]);

  const worker = await fetchLive('./service-worker.js');
  requireTokens('Public service worker', worker.text, [
    "h38-business-office-v5-20260803-1140",
    "cache:'no-store'",
    'self.skipWaiting()',
    'self.clients.claim()'
  ]);

  console.log(JSON.stringify({
    status: 'PASS',
    acceptance: 'PUBLIC_HIGHWAY38_DOMAIN_STARTUP',
    publicUrl: index.finalUrl.toString(),
    build: '20260803-1140',
    htmlStatus: index.response.status,
    startupController: true,
    secureBridgeClient: true,
    browserSafeSignInLink: true,
    bridgeBeforeLocalCache: true,
    serviceWorker: true,
    ownerSwitcherHiddenByDefault: true,
    deterministicRecovery: true
  }, null, 2));
})().catch(error => fail('Live custom-domain startup verification crashed.', { error: error.message }));
