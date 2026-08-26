'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const fail = message => { throw new Error(message); };
const requireText = (source, text, label) => { if (!source.includes(text)) fail(`${label} is missing: ${text}`); };

const index = read('commercial-app/index.html');
const worker = read('commercial-app/service-worker.js');
const authFix = read('commercial-app/supabase-quote-ai-auth-fix.js');
const photoRestore = read('commercial-app/quote-photo-restore.js');
const photoReview = read('commercial-app/field-visit-photo-review.js');
const jobFlow = read('commercial-app/job-centered-flow.js');
const edge = read('supabase/functions/h38-quote-ai/index.ts');

new Function(authFix); new Function(photoRestore); new Function(photoReview); new Function(jobFlow);

const quoteBase = index.indexOf('./supabase-quote-ai.js');
const authRepair = index.indexOf('./supabase-quote-ai-auth-fix.js');
const mobile = index.indexOf('./quote-mobile-stabilization.js');
const photoRepair = index.indexOf('./quote-photo-restore.js');
if (!(quoteBase >= 0 && authRepair > quoteBase && mobile > authRepair && photoRepair > mobile)) fail('Quote AI auth repair and saved-photo restore scripts are not loaded in the required order.');

requireText(worker, 'supabase-quote-ai-auth-fix.js', 'Service worker');
requireText(worker, 'quote-photo-restore.js', 'Service worker');
requireText(worker, 'job-centered-flow.js', 'Service worker');
const cacheName = worker.match(/const CACHE_NAME='(h38-business-office-\d{8}-(?:\d{4}|nav-core-\d+))'/)?.[1];
if (!cacheName) fail('Service worker cache rotation must use an accepted dated or nav-core h38-business-office cache name.');

requireText(authFix, "'Authorization':`Bearer ${auth.session.access_token}`", 'Direct Quote AI request');
requireText(authFix, "'apikey':config.publishableKey", 'Direct Quote AI request');
requireText(authFix, '/functions/v1/h38-quote-ai', 'Direct Quote AI endpoint');
if (authFix.includes("functions.invoke('h38-quote-ai'")) fail('The Quote AI auth repair must not use functions.invoke for the protected request.');
requireText(authFix, 'api.auth.getUser()', 'Live browser session validation');
requireText(authFix, 'legacyFailClosedPricingRetired:true', 'Retired legacy pricing blocker');
requireText(authFix, 'zeroRateDraftBlocked:false', 'Zero-rate editable fallback');
requireText(authFix, 'manualRequiredLinesRemainEditable:true', 'Manual-required editable fallback');
requireText(authFix, 'policyCannotCreateProjectScope:true', 'Policy/scope separation');
requireText(authFix, 'delete prepared.notes', 'Policy must not travel as project notes');
requireText(authFix, 'systemQuotePolicy:systemPolicy()', 'Separate system policy field');
if (authFix.includes('No zero-quantity, zero-rate, or blended insulation/drywall draft was loaded.')) fail('Physical-phone fail-closed pricing blocker must stay retired.');
if (authFix.includes('zero/non-positive rate:')) fail('Client compatibility layer must not reject manual-required rates.');
if (authFix.includes('scopeRequiresTarget')) fail('Client compatibility layer must not infer project scope from policy text.');

requireText(photoRestore, "val(row,'Source ID','sourceId')", 'Saved quote photo relationship');
requireText(photoRestore, 'createSignedUrl(path,300)', 'Private saved-photo preview');
requireText(photoRestore, 'seen.has(k)', 'Duplicate saved-photo suppression');
requireText(photoRestore, 'Customer quote photos', 'Explicit customer photo section');
requireText(photoRestore, 'automaticSiteVisitPhotoLinking:false', 'No automatic Site Visit photo linking');
requireText(photoRestore, 'explicitCustomerPhotoSelection:true', 'Explicit customer photo contract');
requireText(photoRestore, 'Customer Quote Selected', 'Selected Site Visit photo gate');
requireText(photoRestore, 'selectedPhotosRenderOnCustomerProposal:true', 'Selected photos render on customer proposal');
requireText(photoRestore, 'selectedPhotosRenderInPrintSource:true', 'Selected photos render in print/PDF source');
if (photoRestore.includes('document.documentElement') || photoRestore.includes('document.body,{')) fail('Saved-photo restore must not observe the entire page.');

requireText(photoReview, 'selectedIds=new Set((visit.quotePhotoIds||[])', 'Site Review owner-selected photo ids');
requireText(photoReview, 'selectedSource=source.filter', 'Site Review selected-only quote aliasing');
requireText(photoReview, "'Customer Quote Selected':true", 'Selected quote alias marker');
requireText(photoReview, 'activeVisitPhotosStillAvailableForAiReview:true', 'AI review retains all active private evidence');
requireText(photoReview, 'automaticQuotePhotoLinking:false', 'No automatic AI review quote photo linking');

requireText(jobFlow, "primaryNavigation:['Today','Jobs','Customers','Messages','More']", 'Five-place phone navigation');
requireText(jobFlow, "siteVisitStages:['Walkthrough','Measure','Photos','Review','Quote']", 'Five-stage Site Visit');
requireText(jobFlow, 'quotePhotosExplicitSelection:true', 'Explicit Site Visit quote photo selection');
requireText(jobFlow, 'videoFramesInternalByDefault:true', 'Video frames stay internal by default');
requireText(jobFlow, 'automaticCustomerPhotoSelection:false', 'No random customer photo selection');

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
requireText(edge, 'appendOwnerReviewProblems(draft, afterRepair)', 'Editable owner-review fallback');
requireText(edge, 'A missing or uncertain rate/quantity must not destroy the whole editable draft.', 'Non-blocking draft contract');
requireText(edge, 'Owner review — ${problem}', 'Per-line owner review warning');
requireText(edge, 'clean(entry.itemCode, 160) === requestedIdentity', 'Catalog itemCode identity compatibility');
requireText(edge, 'deterministic_component_recovery', 'Deterministic component catalog recovery');
requireText(edge, 'material_line_cannot_use_labor_catalog', 'Material cannot use labor catalog rows');
requireText(edge, 'labor_line_cannot_use_material_catalog', 'Labor cannot use material catalog rows');
requireText(edge, 'separated_component_cannot_use_installed_assembly', 'Separated components cannot use installed assembly rates');
requireText(edge, 'catalogPricingDiagnostics', 'Pricing validation proof diagnostics');
requireText(edge, 'catalogPricingRecovered', 'Pricing recovery proof counter');
requireText(edge, 'catalogPricingRejected', 'Pricing rejection proof counter');
requireText(edge, 'Do not select an EACH, box, or roll raw purchase-unit row for an SF quote line.', 'SF component Price Book routing');
requireText(edge, 'PRIMARY_COMPONENT_IDS', 'Primary safe material component map');
requireText(edge, 'automaticApproval: false', 'No automatic approval');
requireText(edge, 'automaticCustomerSending: false', 'No automatic customer send');
requireText(edge, 'separateRenderRequest: true', 'Separate render request');

console.log('Quote photo restore, explicit Site Visit photo selection, direct AI auth fallback, editable owner-review pricing, component breakout, and safe catalog pricing verification passed.');
