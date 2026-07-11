#!/usr/bin/env node
/**
 * Fetches the live Highway 38 products/sample page and verifies:
 * - HTTP 200
 * - current versionless product/package content
 * - owner-approval safety language
 * - absence of unsafe or obsolete versioned claims
 *
 * Exit code 0 = PASS, 1 = FAIL.
 */

'use strict';

const https = require('https');
const http = require('http');
const url = require('url');

const VERIFY_URL =
  process.env.VERIFY_URL ||
  'https://rkrueth-maker.github.io/highway-38-solutions/sample-library-now.html';

const REQUIRED_STRINGS = [
  'Products, packages, and sample outputs',
  'Messy details in. Finished product out.',
  '$500 Package',
  '$1,000 Package',
  '$1,500 Package',
  '$2,000 Package',
  '$2,500 Package',
  'Approval notice',
  'Rick Review Required / Owner Approval Required',
  'No automatic quote approval',
  'No payment request without Rick approval',
];

const FORBIDDEN_STRINGS = [
  'automatically sends customer emails',
  'automatically approves quotes',
  'payment requested automatically',
  'final delivery without Rick approval',
  'fully autonomous real-customer automation',
  'Version 5 package ladder add-on',
  'Version 5 package ladder',
];

const MAX_ATTEMPTS = 10;
const RETRY_DELAY_MS = 15000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchUrl(rawUrl, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(rawUrl);
    const lib = parsed.protocol === 'https:' ? https : http;

    const req = lib.get(
      rawUrl,
      { headers: { 'User-Agent': 'highway38-verify-live-page/2.0' } },
      (res) => {
        if (
          redirectsLeft > 0 &&
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location
        ) {
          res.resume();
          const redirectedUrl = new URL(res.headers.location, rawUrl).toString();
          fetchUrl(redirectedUrl, redirectsLeft - 1).then(resolve, reject);
          return;
        }

        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      },
    );

    req.on('error', reject);
    req.setTimeout(20000, () => {
      req.destroy(new Error('Request timed out'));
    });
  });
}

async function run() {
  console.log('=== Highway 38 Solutions — live page verification ===');
  console.log('URL:', VERIFY_URL);

  let response = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    console.log(`Attempt ${attempt}/${MAX_ATTEMPTS}: fetching live page...`);
    try {
      response = await fetchUrl(VERIFY_URL);
      console.log(`HTTP status: ${response.status}`);
      if (response.status === 200) break;
    } catch (err) {
      console.warn(`Fetch error: ${err.message}`);
    }

    if (attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS);
    }
  }

  if (!response || response.status !== 200) {
    console.error(`FAIL: no HTTP 200 after ${MAX_ATTEMPTS} attempts.`);
    process.exit(1);
  }

  const html = response.body;
  let failed = false;

  for (const required of REQUIRED_STRINGS) {
    if (html.includes(required)) {
      console.log(`PASS required: ${required}`);
    } else {
      console.error(`FAIL missing required string: ${required}`);
      failed = true;
    }
  }

  for (const forbidden of FORBIDDEN_STRINGS) {
    if (html.includes(forbidden)) {
      console.error(`FAIL forbidden string found: ${forbidden}`);
      failed = true;
    } else {
      console.log(`PASS forbidden absent: ${forbidden}`);
    }
  }

  if (failed) {
    console.error('RESULT: FAIL');
    process.exit(1);
  }

  console.log('RESULT: PASS');
}

run().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
