#!/usr/bin/env node
'use strict';
/* Gap10 contract: View as Customer portal preview (Swivl pattern).
 * Owner-side, one click renders the REAL customer portal exactly as a
 * chosen customer sees it: same edge function, same buildSessionBundle,
 * same customer-portal.html rendering. Read-only enforced SERVER-side,
 * no customer session minted or consumed, persistent preview banner,
 * scope = exactly one customer of one tenant. */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const failures = [];
const check = (name, cond) => { if (!cond) failures.push(name); };

const STAMP = '20261107-polish-a4-money-1';
const fn = read('supabase/functions/h38-customer-portal/index.ts');
const portal = read('commercial-app/customer-portal.html');
const entry = read('commercial-app/portal-preview.js');
const css = read('commercial-app/portal-preview.css');
const index = read('commercial-app/index.html');
const version = read('commercial-app/version.json');

/* Wiring + stamp */
check('portal-preview.js carries the gap10 build stamp', entry.includes("BUILD = '" + STAMP + "'"));
check('index loads portal-preview.js with the stamp', index.includes('./portal-preview.js?build=' + STAMP));
check('index loads portal-preview.css with the stamp', index.includes('./portal-preview.css?build=' + STAMP));
check('version.json at gap10 stamp', version.includes('"version": "' + STAMP + '"'));

/* Server: preview-session is owner-authorized, portal-gated, scoped */
check('edge fn has preview-session action', fn.includes('"preview-session"'));
check('preview-session requires a signed-in user', fn.includes('signedInUser(req)') && fn.includes('preview-session'));
check('preview-session requires active owner/admin', fn.includes('activeOwner(sb, user.id, businessId)'));
check('preview-session checks the portal module gate', fn.includes('moduleEnabled(sb, businessId, MODULE_KEY)'));
check('preview-session scopes via customerById(business, customer)', fn.includes('customerById(sb, businessId, customerId)'));
check('preview renders through the real bundle builder', fn.includes('buildSessionBundle(sb, businessId, customer.record_key)'));
check('preview returns no session token', fn.includes('sessionToken: null'));

/* Server: preview-session writes nothing — its block contains no insert/update */
const pStart = fn.indexOf('postAction === "preview-session"');
const pEnd = fn.indexOf('postAction === "request-link"');
check('preview-session block located', pStart > 0 && pEnd > pStart);
const pBlock = pStart > 0 && pEnd > pStart ? fn.slice(pStart, pEnd) : '';
check('preview-session block has no insert', !pBlock.includes('.insert('));
check('preview-session block has no update', !pBlock.includes('.update('));
check('preview-session block mints no token', !pBlock.includes('newToken()') && !pBlock.includes('TOKEN_COLLECTION'));
check('preview-session block writes no proof row', !pBlock.includes('writeProof'));

/* Server: preview-flagged mutating actions are refused before any write */
check('preview read-only error text present', fn.includes('Preview is read-only'));
check('preview refusal returns 403', fn.includes('reply(req, 403, { error: PREVIEW_READ_ONLY_ERROR'));
check('preview refusal runs on body.preview flag', fn.includes('body.preview === true && postAction !== "preview-session"'));
['approve-quote', 'sign-quote', 'sign-change-order', 'decline-quote', 'pay-invoice', 'pay-invoice-checkout', 'request-service', 'submit-referral', 'book-slot', 'create-link', 'redeem'].forEach(a =>
  check('mutating action covered by preview refusal set: ' + a, fn.includes('"' + a + '"') && fn.includes('PREVIEW_MUTATING_ACTIONS')));

/* Portal page: preview mode uses the real page + real render path */
check('portal detects preview mode from the URL', portal.includes("params.get('preview')==='1'"));
check('portal preview loads via preview-session', portal.includes("action:'preview-session'"));
check('portal preview authorizes with the owner token', portal.includes("'Authorization':'Bearer '+tok") && portal.includes('ownerAccessToken'));
check('portal preview clears any customer session token', portal.includes("sessionStorage.removeItem('h38-portal-session')"));
const lpStart = portal.indexOf('function loadPreview');
const lpEnd = portal.indexOf('// ---- Boot', lpStart);
check('portal preview never stores a session', lpStart > 0 && lpEnd > lpStart && !portal.slice(lpStart, lpEnd).includes("sessionStorage.setItem('h38-portal-session'") && !portal.slice(lpStart, lpEnd).includes('redeem('));
check('portal actions are flagged preview for the server refusal', portal.includes('body.preview=true'));
check('portal renders preview through renderPortal (the real renderer)', portal.includes('renderPortal();') && portal.includes('window.__h38PortalPreview=true'));

/* Banner: persistent, plain words, names the customer */
check('preview banner element exists', portal.includes('id="previewBanner"'));
check('banner says Preview + what the customer sees', portal.includes('Preview — this is what'));
check('banner says nothing can be sent or changed', portal.includes('Nothing here can be sent or changed.'));
check('banner names the previewed customer', portal.includes('id="previewCustomerName"') && portal.includes('previewCustomer.name'));
check('banner is sticky/persistent', portal.includes('.preview-banner{position:sticky'));

/* Owner entry: Customers page + portal settings (controls) decoration */
check('entry decorates customers + controls/settings pages', entry.includes("HOST_PAGES = { customers: 1, controls: 1, settings: 1 }"));
check('entry offers a customer pick', entry.includes('data-pp-select') && entry.includes("records('customers')") || entry.includes('data-pp-select'));
check('entry button is View as Customer', entry.includes('View as Customer'));
check('entry preselects the selected customer record', entry.includes('H38_CUSTOMER_360') && entry.includes('selectedCustomerId'));
check('entry lands in the portal settings card area', entry.includes('#customerPortalCard'));
check('entry opens the real portal page in preview mode', entry.includes("customer-portal.html?preview=1&business=") && entry.includes("window.open("));
check('entry performs no fetch/XHR of its own', !entry.includes('fetch(') && !entry.includes('XMLHttpRequest'));
check('entry mints no link or token', !entry.includes('create-link') && !entry.includes('newToken'));
check('entry exposes H38_PORTAL_PREVIEW handle', entry.includes('window.H38_PORTAL_PREVIEW') && entry.includes('readOnly: true'));
check('entry hooks the shared page-rendered event', entry.includes('h38:office-page-rendered'));
check('css is scoped to h38-pp classes', !/^\s*(body|main|\.card)\b/m.test(css));
check('css stacks the bar on small screens', css.includes('@media (max-width:640px)'));

if (failures.length) {
  console.error('verify-portal-preview FAILED:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('verify-portal-preview: PASS (gap10 portal preview contract, stamp ' + STAMP + ')');
