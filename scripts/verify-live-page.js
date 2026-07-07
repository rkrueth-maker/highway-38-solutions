#!/usr/bin/env node
/**
 * verify-live-page.js
 * Fetches the live sample-library-now.html page and verifies that:
 *   - HTTP 200 is returned
 *   - All required Version 5 strings are present
 *   - No forbidden unsafe strings are present
 *
 * Usage:
 *   node scripts/verify-live-page.js
 *
 * Exit code 0 = PASS, 1 = FAIL
 */

'use strict';

const https = require('https');
const http  = require('http');
const url   = require('url');

const VERIFY_URL =
  'https://rkrueth-maker.github.io/highway-38-solutions/sample-library-now.html?v=v5-ladder-final';

const REQUIRED_STRINGS = [
  'Version 5 package ladder add-on',
  'Version 5 package ladder',
  '$500 Package',
  '$1,000 Package',
  '$1,500 Package',
  '$2,000 Package',
  '$2,500 Package',
  'Legal / approval notice',
  'Rick Review Required / Owner Approval Required',
];

const FORBIDDEN_STRINGS = [
  'automatically sends customer emails',
  'automatically approves quotes',
  'payment requested automatically',
  'final delivery without Rick approval',
  'fully autonomous real-customer automation',
];

const MAX_ATTEMPTS = 10;
const RETRY_DELAY_MS = 15000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchUrl(rawUrl) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(rawUrl);
    const lib = parsed.protocol === 'https:' ? https : http;

    const req = lib.get(rawUrl, { headers: { 'User-Agent': 'highway38-verify-live-page/1.0' } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });

    req.on('error', reject);
    req.setTimeout(20000, () => {
      req.destroy(new Error('Request timed out'));
    });
  });
}

async function run() {
  console.log('=== Highway 38 Solutions — live page verification ===');
  console.log('URL:', VERIFY_URL);
  console.log('');

  let response = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`Attempt ${attempt}/${MAX_ATTEMPTS}: fetching live page…`);
    try {
      response = await fetchUrl(VERIFY_URL);
      console.log(`HTTP status: ${response.status}`);
      if (response.status === 200) break;
    } catch (err) {
      console.warn(`  fetch error: ${err.message}`);
    }

    if (attempt < MAX_ATTEMPTS) {
      console.log(`  Waiting ${RETRY_DELAY_MS / 1000}s before retry…`);
      await sleep(RETRY_DELAY_MS);
    }
  }

  if (!response || response.status !== 200) {
    console.error(`\nFAIL: Could not fetch live page with HTTP 200 after ${MAX_ATTEMPTS} attempts.`);
    process.exit(1);
  }

  const html = response.body;
  let failed = false;

  console.log('\n--- Required strings ---');
  for (const s of REQUIRED_STRINGS) {
    if (html.includes(s)) {
      console.log(`PASS: "${s}"`);
    } else {
      console.error(`FAIL: missing required string — "${s}"`);
      failed = true;
    }
  }

  console.log('\n--- Forbidden strings ---');
  for (const s of FORBIDDEN_STRINGS) {
    if (html.includes(s)) {
      console.error(`FAIL: forbidden string found — "${s}"`);
      failed = true;
    } else {
      console.log(`PASS (not present): "${s}"`);
    }
  }

  console.log('');
  if (failed) {
    console.error('RESULT: FAIL — one or more checks did not pass. See above.');
    process.exit(1);
  } else {
    console.log('RESULT: PASS — all required strings present, no forbidden strings found.');
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
