#!/usr/bin/env node
/**
 * Verifies the current public Highway 38 buyer paths, product structure,
 * interactive quote demonstration, complete new-house package, and all ten
 * public CAD SVG routes.
 *
 * Exit code 0 = PASS, 1 = FAIL.
 */

'use strict';

const https = require('https');
const http = require('http');
const url = require('url');

const DEFAULT_BASE_URL = 'https://rkrueth-maker.github.io/highway-38-solutions/';
const BASE_URL = normalizeBaseUrl(
  process.env.VERIFY_BASE_URL || process.env.VERIFY_URL || DEFAULT_BASE_URL,
);

const PAGE_CHECKS = [
  {
    label: 'homepage',
    path: 'index.html',
    required: [
      'Bring us the problem.',
      'Start a Project',
      'Try the Quote Demo',
      'Choose the kind of help you need',
      'I need better software',
      'I need help solving a project',
      'Implementation and Onboarding',
      'Security and Reliability',
      'Connected Business Office',
    ],
  },
  {
    label: 'software buyer path',
    path: 'software.html',
    required: [
      'Software for real business work',
      'Quote Builder',
      'Business Office',
      'Custom Business System',
      'Try the Quote Demo',
      'AI prepares; people approve',
      'Implementation is documented',
    ],
  },
  {
    label: 'project services buyer path',
    path: 'project-services.html',
    required: [
      'Planning and guided project delivery',
      'Construction and property projects',
      'Manufacturing and CNC work',
      'Automation and business workflows',
      'Planning support does not replace licensed or field verification.',
      'Start a Project Request',
    ],
  },
  {
    label: 'pricing',
    path: 'pricing.html',
    required: [
      'Three software products',
      'Quote Builder',
      '$59',
      'Self-setup included',
      'Assisted setup: $499 one-time',
      'Highway 38 Business Office',
      'Custom Business System',
      'Business Snapshot',
      '$299 one-time',
      'Best for:',
      'This is a one-time business review, not a software subscription.',
    ],
  },
  {
    label: 'interactive Quote Builder demo',
    path: 'quote-builder-demo.html',
    required: [
      'Interactive browser-only demonstration',
      'Nothing leaves this page',
      'Quote inputs',
      'Line items',
      'Print / Save PDF',
      'Nothing was stored or sent.',
      'Not a real customer quote or authorization to proceed.',
    ],
  },
  {
    label: 'implementation and onboarding',
    path: 'implementation.html',
    required: [
      'Implementation that produces a working system',
      'Discover and preserve',
      'Configure and migrate',
      'Verify and train',
      'Launch and hand off',
      'Business Office implementation — $2,500',
      'Acceptance evidence',
    ],
  },
  {
    label: 'security and reliability',
    path: 'security-reliability.html',
    required: [
      'Security, controls and reliability',
      'Identity and role access',
      'Business and customer isolation',
      'Controlled external actions',
      'Backups and rollback',
      'Fail-closed boundaries',
      'H38 AI boundaries',
    ],
  },
  {
    label: 'Quote Builder',
    path: 'quote-builder.html',
    required: [
      'Universal Quote Builder',
      '$59/month',
      'Self-setup included',
      'Assisted setup: $499 one-time',
      'start-request.html?offer=quote-builder',
      'See complete projects, quotes, drawings, and printable packages.',
      'Create professional quotes, attach photos and documents, calculate pricing, track approvals, and produce customer-ready PDFs—all in one place.',
      'Quotes that match the job',
      'Eight built-in AI assistants for professional quoting.',
      'H38 AI included',
    ],
  },
  {
    label: 'Sample Library',
    path: 'sample-library-now.html',
    required: [
      'Complete Project Examples',
      'Representative demonstrations.',
      'data-samples="all"',
      'Universal Quote Builder overview',
      'Complete quote examples matched to their CAD drawings',
      'Public examples only:',
      'data-owner-link="true"',
    ],
  },
  {
    label: 'complete new-house package',
    path: 'whole-house-quote-package.html',
    required: [
      'Complete New-House Construction Package',
      '10-sheet CAD-style coordination set',
      'fourteen independently printable phase quotes',
      'Revision:</strong> E',
      'Print / Save Complete Package',
      'DEMONSTRATION — NOT A CONTRACT',
    ],
  },
  {
    label: 'About',
    path: 'about.html',
    required: [
      'Built on experience.',
      'Experience from the shop floor to the Business Office.',
      'AI with Human Control',
      '30+ years',
    ],
  },
];

const CAD_SHEETS = [
  'G-001',
  'A-101',
  'A-102',
  'A-201',
  'A-301',
  'A-401',
  'M-101',
  'P-101',
  'E-101',
  'C-S-L-101',
];

const COMMON_FORBIDDEN_STRINGS = [
  'Start a $99 Problem Snapshot',
  '$99 Problem Snapshot',
  '15 fixed-price services. 9 approved bundles. 4 scoped systems.',
  '15 existing service demonstrations',
  'Version 5 package ladder add-on',
  'Version 5 package ladder',
  '25,000+ CNC programs',
  'Rick Krueth',
  'automatically sends customer emails',
  'automatically approves quotes',
  'payment requested automatically',
  'final delivery without owner approval',
  'fully autonomous real-customer automation',
  '404: File not found',
];

const CAD_REQUIRED_STRINGS = [
  'NOT FOR CONSTRUCTION',
  'Field verification required',
  'REV E',
  'Ground-Up New-House Construction',
];

const CAD_FORBIDDEN_STRINGS = [
  'Whole-House Renovation',
  'Selective Demolition',
  'Plumbing Renovation',
  '404: File not found',
];

const MAX_ATTEMPTS = 10;
const RETRY_DELAY_MS = 15000;

function normalizeBaseUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  if (!parsed.pathname.endsWith('/')) {
    const lastSegment = parsed.pathname.split('/').pop() || '';
    if (lastSegment.includes('.')) parsed.pathname = parsed.pathname.replace(/[^/]+$/, '');
    else parsed.pathname += '/';
  }
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchUrl(rawUrl, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(rawUrl);
    const lib = parsed.protocol === 'https:' ? https : http;

    const req = lib.get(
      rawUrl,
      { headers: { 'User-Agent': 'highway38-verify-live-page/5.0' } },
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

function verifyRequired(label, body, requiredStrings) {
  let failed = false;
  for (const required of requiredStrings) {
    if (body.includes(required)) {
      console.log(`PASS ${label} required: ${required}`);
    } else {
      console.error(`FAIL ${label} missing required string: ${required}`);
      failed = true;
    }
  }
  return failed;
}

function verifyForbidden(label, body, forbiddenStrings) {
  let failed = false;
  for (const forbidden of forbiddenStrings) {
    if (body.includes(forbidden)) {
      console.error(`FAIL ${label} forbidden string found: ${forbidden}`);
      failed = true;
    } else {
      console.log(`PASS ${label} forbidden absent: ${forbidden}`);
    }
  }
  return failed;
}

async function run() {
  console.log('=== Highway 38 Solutions — current live product, trust, and Quote Builder verification ===');
  console.log('Base URL:', BASE_URL);

  let failed = false;
  const pageBodies = new Map();

  for (const page of PAGE_CHECKS) {
    const pageUrl = new URL(page.path, BASE_URL).toString();
    const body = await fetchWithRetries(pageUrl, page.label);
    pageBodies.set(page.path, body);
    failed = verifyRequired(page.label, body, page.required) || failed;
    failed = verifyForbidden(page.label, body, COMMON_FORBIDDEN_STRINGS) || failed;
  }

  const packageBody = pageBodies.get('whole-house-quote-package.html') || '';
  for (const sheet of CAD_SHEETS) {
    const relativePath = `assets/quote-builder/whole-house-cad/${sheet}.svg`;
    if (packageBody.includes(relativePath)) {
      console.log(`PASS package links CAD sheet: ${sheet}`);
    } else {
      console.error(`FAIL package missing CAD sheet link: ${sheet}`);
      failed = true;
    }

    const sheetUrl = new URL(relativePath, BASE_URL).toString();
    const body = await fetchWithRetries(sheetUrl, `CAD sheet ${sheet}`);
    failed = verifyRequired(`CAD sheet ${sheet}`, body, CAD_REQUIRED_STRINGS) || failed;
    failed = verifyForbidden(`CAD sheet ${sheet}`, body, CAD_FORBIDDEN_STRINGS) || failed;
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
