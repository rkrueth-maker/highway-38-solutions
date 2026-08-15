'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const fail = message => { throw new Error(message); };
const requireText = (source, text, label) => {
  if (!source.includes(text)) fail(`${label} is missing: ${text}`);
};

const index = read('commercial-app/index.html');
const worker = read('commercial-app/service-worker.js');
const authFix = read('commercial-app/supabase-quote-ai-auth-fix.js');
const photoRestore = read('commercial-app/quote-photo-restore.js');
const edge = read('supabase/functions/h38-quote-ai/index.ts');

const quoteBase = index.indexOf('./supabase-quote-ai.js');
const authRepair = index.indexOf('./supabase-quote-ai-auth-fix.js');
const mobile = index.indexOf('./quote-mobile-stabilization.js');
const photoRepair = index.indexOf('./quote-photo-restore.js');
if (!(quoteBase >= 0 && authRepair > quoteBase && mobile > authRepair && photoRepair > mobile)) {
  fail('Quote AI auth repair and saved-photo restore scripts are not loaded in the required order.');
}

requireText(worker, 'supabase-quote-ai-auth-fix.js', 'Service worker');
requireText(worker, 'quote-photo-restore.js', 'Service worker');
const cacheName = worker.match(/const CACHE_NAME='(h38-business-office-\d{8}-\d{4})'/)?.[1];
if (!cacheName) fail('Service worker cache rotation must use a dated h38-business-office cache name.');

requireText(authFix, "'Authorization': `Bearer ${session.access_token}`", 'Direct Quote AI request');
requireText(authFix, "'apikey': config.publishableKey", 'Direct Quote AI request');
requireText(authFix, '/functions/v1/h38-quote-ai', 'Direct Quote AI endpoint');
if (authFix.includes("functions.invoke('h38-quote-ai'")) fail('The Quote AI auth repair must not use functions.invoke for the protected request.');
requireText(authFix, 'api.auth.getUser()', 'Live browser session validation');

requireText(photoRestore, "val(r,'Source ID','sourceId')", 'Saved quote photo relationship');
requireText(photoRestore, 'createSignedUrl(path,300)', 'Private saved-photo preview');
requireText(photoRestore, 'seen.has(k)', 'Duplicate saved-photo suppression');
requireText(photoRestore, 'Saved with this quote', 'Saved photo section');
if (photoRestore.includes('document.documentElement') || photoRestore.includes('document.body,{')) fail('Saved-photo restore must not observe the entire page.');

requireText(edge, '${SUPABASE_URL}/auth/v1/user', 'Edge Auth validation');
requireText(edge, 'authorization: `Bearer ${token}`', 'Edge Auth validation');
requireText(edge, 'apikey: SUPABASE_SERVICE_ROLE_KEY', 'Edge Auth validation');
requireText(edge, '.from("price_book_items")', 'Price Book-first query');
requireText(edge, '.from("price_book_assemblies")', 'Assembly recipe query');
requireText(edge, 'seen.has(key)', 'Edge duplicate photo suppression');
if (edge.includes('service.auth.getUser(token)')) fail('Edge Quote AI must not use the broken service.auth.getUser(token) path.');

requireText(edge, 'costType: { type: "string", enum: ["material", "labor", "equipment", "other"] }', 'Strict line cost type schema');
requireText(edge, 'QUOTE COST BREAKOUT CONTRACT', 'Server component breakout contract');
requireText(edge, 'MATERIAL ORDER ALLOWANCE', 'Material-only 10 percent allowance');
requireText(edge, 'LABOR QUANTITY', 'Net labor quantity contract');
requireText(edge, 'assemblyRecipes(service, businessId)', 'Assembly recipe hydration');
requireText(edge, 'breakoutProblems(draft, context)', 'Server breakout validation');
requireText(edge, 'serverBreakoutRepairApplied', 'Server repair proof');
requireText(edge, 'No blended or zero-quantity draft was returned', 'Fail-closed breakout rule');
requireText(edge, 'automaticApproval: false', 'No automatic approval');
requireText(edge, 'automaticCustomerSending: false', 'No automatic customer send');
requireText(edge, 'separateRenderRequest: true', 'Separate render request');

console.log('Quote photo restore, direct AI auth, assembly recipes, and server component breakout verification passed.');
