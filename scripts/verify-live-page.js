#!/usr/bin/env node
/**
 * Fetches the live Highway 38 Sample Library and controlled catalog source.
 * Verifies the current Issue #83 public markers, catalog ID counts, Owner
 * Portal control, proof classification, and prohibited public claims.
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
const CATALOG_URL = new URL('catalog-data.js', VERIFY_URL).toString();

const REQUIRED_STRINGS = [
  'See the kind of finished result before choosing a service.',
  '15 existing service demonstrations',
  'Hypothetical examples',
  'data-owner-link="true"',
  'data-samples="all"',
  'Owner Portal',
  'What you send. What Highway 38 delivers.',
  'Approved outcome bundles',
  'data-bundles',
];

const FORBIDDEN_STRINGS = [
  '25,000+ CNC programs',
  'Rick Krueth',
  'automatically sends customer emails',
  'automatically approves quotes',
  'payment requested automatically',
  'final delivery without owner approval',
  'fully autonomous real-customer automation',
  'Version 5 package ladder add-on',
  'Version 5 package ladder',
  '404: File not found',
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
      { headers: { 'User-Agent': 'highway38-verify-live-page/3.0' } },
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

async function fetchWithRetries(rawUrl, label) {
  let response = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    console.log(`Attempt ${attempt}/${MAX_ATTEMPTS}: fetching ${label}...`);
    try {
      response = await fetchUrl(rawUrl);
      console.log(`${label} HTTP status: ${response.status}`);
      if (response.status === 200) return response.body;
    } catch (err) {
      console.warn(`${label} fetch error: ${err.message}`);
    }
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }
  throw new Error(`${label} did not return HTTP 200 after ${MAX_ATTEMPTS} attempts.`);
}

function uniqueMatches(text, pattern) {
  return new Set(text.match(pattern) || []);
}

async function run() {
  console.log('=== Highway 38 Solutions — live Sample Library verification ===');
  console.log('Sample URL:', VERIFY_URL);
  console.log('Catalog URL:', CATALOG_URL);

  const [html, catalogSource] = await Promise.all([
    fetchWithRetries(VERIFY_URL, 'Sample Library'),
    fetchWithRetries(CATALOG_URL, 'controlled catalog'),
  ]);

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

  const productIds = uniqueMatches(catalogSource, /H38-P(?:00[1-9]|01[0-5])/g);
  const bundleIds = uniqueMatches(catalogSource, /H38-B00[1-9]/g);

  if (productIds.size === 15) {
    console.log('PASS controlled catalog: 15 unique product IDs');
  } else {
    console.error(`FAIL controlled catalog product count: expected 15, found ${productIds.size}`);
    failed = true;
  }

  if (bundleIds.size === 9) {
    console.log('PASS controlled catalog: 9 unique bundle IDs');
  } else {
    console.error(`FAIL controlled catalog bundle count: expected 9, found ${bundleIds.size}`);
    failed = true;
  }

  if (failed) {
    console.error('RESULT: FAIL');
    process.exit(1);
  }

  console.log('RESULT: PASS');
}

run().catch((err) => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
