#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const edge=read('supabase/functions/h38-quote-ai/index.ts');
const provider=read('commercial-app/supabase-quote-ai.js');
const live=read('commercial-app/quote-ai-live-fix.js');
const mobile=read('commercial-app/quote-mobile-stabilization.js');
const index=read('commercial-app/index.html');
const worker=read('commercial-app/service-worker.js');
const pricingSchema=read('supabase/migrations/20260812154632_contractor_pricing_system.sql');
const assemblySync=read('supabase/migrations/20260812155839_contractor_assembly_catalog_sync.sql');
const catalogSeed=read('supabase/migrations/20260812160306_highway38_contractor_catalog_seed.sql');
const captureSelector=live.includes("closest('#h38AiQuoteDraftButton')")||live.includes("closest?.('#h38AiQuoteDraftButton')");
const checks=[
 ['OpenAI key remains server-side',edge.includes('Deno.env.get("OPENAI_API_KEY")')&&!provider.includes('OPENAI_API_KEY')],
 ['Responses API receives image inputs',edge.includes('https://api.openai.com/v1/responses')&&edge.includes('input_image')],
 ['Structured quote schema is required',edge.includes('type: "json_schema"')&&edge.includes('h38_quote_draft')],
 ['Price Book is searched before local research',edge.includes('priceBookEntries')&&edge.includes('Search the supplied Price Book first')&&edge.includes('local_research')],
 ['Contractor assemblies have a hard ten-percent waste floor',pricingSchema.includes('material_waste_pct numeric not null default 0.10')&&pricingSchema.includes('material_waste_pct >= 0.10')],
 ['H38 seed preserves minimum ten-percent waste',catalogSeed.includes("'MATERIAL_WASTE_FLOOR'")&&catalogSeed.includes("'ASM-DRYWALL-WALL-L4'")&&catalogSeed.includes("'ASM-RETAINING-FABRIC'")&&catalogSeed.includes('greatest(excluded.material_waste_pct,0.10)')],
 ['Assembly waste is separate from customer installed quantity',assemblySync.includes('Internal material waste=')&&assemblySync.includes('do not inflate customer installed quantity')],
 ['Installed assemblies sync into the existing Quote AI catalog',assemblySync.includes('sync_price_book_assembly_catalog')&&assemblySync.includes("'INSTALLED ASSEMBLY | '")&&assemblySync.includes('new.sell_rate')],
 ['Raw materials are explicitly material-only',assemblySync.includes("'RAW MATERIAL ONLY — '")&&assemblySync.includes("category like 'RAW MATERIAL |%'")&&catalogSeed.includes("'RAW MATERIAL ONLY — 1/2 in. x 4 ft. x 8 ft. standard drywall panel'")],
 ['Assembly catalog sync preserves owner review state',assemblySync.includes('approval_status = excluded.approval_status')&&pricingSchema.includes("default 'owner_review_required'")&&catalogSeed.includes("approval_status='owner_review_required'"))],
 ['Linked Site Visit measurements are hydrated structurally',provider.includes('linkedMeasurementEvidence')&&provider.includes("snapshotRows('siteMeasurements')")&&provider.includes('measurementEvidence=evidence')&&provider.includes('linkedSiteVisitMeasurementHydration:true')],
 ['Structured measurement authority reaches the server',edge.includes('function measurementEvidence')&&edge.includes('authorityRank: measurementRank(status)')&&edge.includes('structuredMeasurementEvidence: true')],
 ['Catalog pricing requires identity description and unit validation',edge.includes('function validateCatalogPricing')&&edge.includes('sameUnit(line.unit, matched.unit)')&&edge.includes('sameDescription(line.description, matched.description)')&&edge.includes('catalogPriceValidation: true')],
 ['Stored researched allowances are not mislabeled as approved catalog truth',edge.includes('stored_researched_allowance')&&edge.includes('const normalizedSource')&&edge.includes('? "local_research" : "price_book"')],
 ['Stale learned pricing is forced back through current research',edge.includes('LOCAL_RESEARCH_REFRESH_DAYS = 30')&&edge.includes('requiresWebRefresh')&&edge.includes('staleLocalResearchRefreshDays: LOCAL_RESEARCH_REFRESH_DAYS')],
 ['Private photos use short signed URLs',edge.includes('createSignedUrl(path, 600)')&&edge.includes('path.startsWith(`${businessId}/`)')],
 ['Membership and role are validated',edge.includes('business_memberships')&&edge.includes('auth_user_id')&&edge.includes('administrator')],
 ['Provider uses Supabase Functions invoke',provider.includes("functions.invoke('h38-quote-ai'")&&provider.includes('functions.setAuth(session.access_token)')],
 ['Saved quote syncs before AI',provider.includes("await window.sync(false)")],
 ['Capture-phase click bypasses stale onclick handlers',live.includes("document.addEventListener('click'")&&live.includes('stopImmediatePropagation')&&captureSelector],
 ['Every build tap gets persistent inline status',live.includes('h38QuoteBuildStatus')&&live.includes('Build Quote started.')&&live.includes('aria-live')],
 ['Silent safeAction dependency is no longer used by final handler',!live.includes('safeAction')&&live.includes("HANDLER='quote-ai-v4-measure-price-addons'")],
 ['Recursive page observer is forbidden',!live.includes('MutationObserver')&&live.includes('recursiveObserver:false')],
 ['Browser preflight reflects requested headers',edge.includes('access-control-request-headers')&&edge.includes('quote-ai-cors-preflight')&&edge.includes('preflight: true')],
 ['Preflight returns an observable success response',edge.includes('request.method === "OPTIONS"')&&edge.includes('return json(request, 200')],
 ['AI provider loads after fallback',index.indexOf('supabase-ai-fallback.js')<index.indexOf('supabase-quote-ai.js')],
 ['AI provider loads before mobile build wrapper',index.indexOf('supabase-quote-ai.js')<index.indexOf('quote-mobile-stabilization.js')],
 ['Capture click guard loads last',index.indexOf('quote-mobile-stabilization.js')<index.indexOf('quote-ai-live-fix.js')],
 ['AI assets remain cached',worker.includes("'./supabase-quote-ai.js'")&&worker.includes("'./quote-ai-live-fix.js'")],
 ['Owner safeguards remain explicit',edge.includes('automaticApproval: false')&&edge.includes('automaticSending: false')&&edge.includes('ownerReviewRequired: true')],
 ['Retired Apps Script is not used',!edge.includes('script.google.com')&&!provider.includes('script.google.com')]
];
let failures=0;
for(const[name,pass]of checks){console.log(`${pass?'PASS':'FAIL'} ${name}`);if(!pass)failures++;}
if(failures){console.error(`${failures} Quote AI verification checks failed.`);process.exit(1);}
console.log('Authenticated Supabase Quote AI measurement, contractor assembly, waste-floor, catalog-price, click, CORS, provider, and freeze checks passed.');