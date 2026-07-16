#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const failures=[],passes=[];
const check=(name,condition,detail='')=>condition?passes.push({name,detail}):failures.push({name,detail});
const exists=file=>fs.existsSync(path.join(root,file));
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const required=[
  'index.html','services.html','free-tools.html','free-tools.js','tool-formulas.js','proof.html','proof.js','business-os.html','business-concept-builder.html','business-concept-builder.js','resources.html','portal.html','customer-portal.html','customer-portal-config.js','customer-portal-supabase.js','supabase/migrations/20260716_customer_portal.sql','supabase/migrations/20260716_customer_portal_invite_activation.sql','ecosystem.css','ecosystem-data.js','ecosystem.js','favicon.svg','forgeiq.html','tools.html','sitemap.xml','robots.txt','site.webmanifest',
  'brand/highway-38-mark.svg','brand/highway-38-solutions.svg','brand/highway-38-tools.svg','brand/highway-38-business-os.svg','brand/highway-38-supply-co.svg','brand/BRAND_SYSTEM.md',
  'business-os/configuration-schema.json','business-os/installer-manifest.json','business-os/README.md','customer-portal/SECURITY_MODEL.md','social/30-day-content-bank.json','docs/launch/PROVIDER_CONNECTION_STATUS_2026-07-11.md','docs/launch/EXECUTION_LEDGER_2026-07-11.md'
];
required.forEach(file=>check(`required file: ${file}`,exists(file)));
const catalogContext={window:{}};vm.createContext(catalogContext);vm.runInContext(read('catalog-data.js'),catalogContext,{filename:'catalog-data.js'});const catalog=catalogContext.window.H38_CATALOG;
check('catalog object exists',!!catalog);
if(catalog){
  check('exactly 15 products',catalog.products.length===15,catalog.products.length);
  check('exactly 9 bundles',catalog.bundles.length===9,catalog.bundles.length);
  const productIds=catalog.products.map(x=>x.id),bundleIds=catalog.bundles.map(x=>x.id);
  check('product IDs exact',Array.from({length:15},(_,i)=>`H38-P${String(i+1).padStart(3,'0')}`).every(id=>productIds.includes(id)),productIds.join(','));
  check('bundle IDs exact',Array.from({length:9},(_,i)=>`H38-B${String(i+1).padStart(3,'0')}`).every(id=>bundleIds.includes(id)),bundleIds.join(','));
  check('catalog IDs unique',new Set([...productIds,...bundleIds]).size===24);
  check('controlled product commercial fields',catalog.products.every(p=>p.price>0&&p.payment&&p.turnaround&&p.revisions&&p.boundary));
}
const ecosystemContext={window:{}};vm.createContext(ecosystemContext);vm.runInContext(read('ecosystem-data.js'),ecosystemContext,{filename:'ecosystem-data.js'});const eco=ecosystemContext.window.H38_ECOSYSTEM;
check('ecosystem data exists',!!eco);
if(eco){
  check('13 add-ons',eco.addOns.length===13,eco.addOns.length);
  check('6 bounded contracts',eco.contracts.length===6,eco.contracts.length);
  check('4 Business OS tiers',eco.osTiers.length===4,eco.osTiers.length);
  check('provider blocker registry',eco.providers.length>=7,eco.providers.length);
  check('draft price truth state',eco.addOns.concat(eco.contracts,eco.osTiers).every(x=>x.status==='OWNER_REVIEW'));
  check('proof classifications present',eco.proof.every(x=>x.classification&&x.evidenceStatus));
}
const formulas=require(path.join(root,'tool-formulas.js'));
try{
  const m=formulas.machining({sfm:300,diameter:.5,teeth:4,chip:.003});assert(Math.abs(m.rpm-2292)<.001);assert(Math.abs(m.feed-27.504)<.001);
  const a=formulas.payback({cost:100000,hoursPerWeek:40,loadedRate:45,weeksPerYear:50,otherAnnual:10000});assert(Math.abs(a.paybackMonths-12)<.001);
  const b=formulas.bottleneck({minutesPerDay:45,workingDays:240,loadedRate:55,people:2});assert.strictEqual(b.annualHours,360);assert.strictEqual(b.annualCost,19800);
  const bf=formulas.barfeed({barLength:144,partLength:2,remnant:8,cutoff:.125,cycleSeconds:60,runHours:8,efficiencyPercent:80});assert.strictEqual(bf.partsPerBar,64);assert.strictEqual(bf.runParts,384);
  const pf=formulas.pressfeed({strokesPerMinute:30,feedPitchInches:4,scheduledHours:8,efficiencyPercent:75,usableCoilFeet:3000});assert.strictEqual(pf.goodStrokes,10800);assert.strictEqual(pf.stripFeet,3600);
  assert.strictEqual(formulas.score([3,3,3,3]).percent,60);
  check('formula regression set',true);
}catch(error){check('formula regression set',false,error.message);}
const publicFiles=['index.html','services.html','free-tools.html','proof.html','business-os.html','business-concept-builder.html','resources.html','portal.html','customer-portal.html','customer-portal-config.js','customer-portal-supabase.js','ecosystem-data.js','ecosystem.js','free-tools.js','proof.js','business-concept-builder.js'];
const publicText=publicFiles.map(file=>read(file)).join('\n');
check('no public LLC claim',!/Highway 38[^\n<]{0,30}\bLLC\b/i.test(publicText));
check('no raw card fields',!/cardNumber|\bcvv\b|\bcvc\b|fullCard/i.test(publicText));
check('no private employer names in public package',!/\bClow\b|\bCSC\b/i.test(publicText));
check('no fake testimonials or reviews',!/customer testimonial|five-star review|★★★★★/i.test(publicText));
check('customer portal noindex',/noindex,nofollow/.test(read('customer-portal.html')));
const customerPortal=read('customer-portal.html'),customerConfig=read('customer-portal-config.js'),customerClient=read('customer-portal-supabase.js'),customerSql=read('supabase/migrations/20260716_customer_portal.sql'),customerActivation=read('supabase/migrations/20260716_customer_portal_invite_activation.sql');
check('customer portal active Supabase production state',
  /enabled:\s*true/.test(customerConfig)&&
  /jqukmwtsgcsaruucnqja\.supabase\.co/.test(customerConfig)&&
  /sb_publishable_[A-Za-z0-9_-]{20,}/.test(customerConfig)&&
  !/REPLACE_WITH|YOUR_PROJECT/.test(customerConfig)&&
  /if \(!configured\(\)\)/.test(customerClient)&&
  /signInWithPassword/.test(customerClient)&&
  /shouldCreateUser:\s*false/.test(customerClient)&&
  /enable row level security/i.test(customerSql)&&
  /link_invited_customer_account/.test(customerActivation)
);
check('ForgeIQ redirect',/location\.replace\('free-tools\.html'/.test(read('forgeiq.html')));
check('analytics event queue',/h38AnalyticsQueue/.test(read('ecosystem.js'))&&/tool_calculate/.test(read('free-tools.js')));
const social=JSON.parse(read('social/30-day-content-bank.json'));
check('30-day social bank',social.posts.length===30,social.posts.length);
check('external publication disabled in content bank',social.externalPublication===false);
check('all social posts owner controlled',social.posts.every(p=>p.publishAllowed===false&&p.asset&&p.draft));
const htmlFiles=required.filter(file=>file.endsWith('.html'));
for(const file of htmlFiles){
  const html=read(file);check(`${file}: viewport`,/name="viewport"/.test(html));
  for(const match of html.matchAll(/href="([^"]+)"/g)){
    const href=match[1];if(/^(https?:|mailto:|tel:|#)/.test(href))continue;const clean=href.split(/[?#]/)[0];if(!clean)continue;check(`${file}: local link ${clean}`,exists(clean));
  }
}
const sitemap=read('sitemap.xml');['services.html','free-tools.html','proof.html','business-os.html','business-concept-builder.html','resources.html','start-request.html','portal.html'].forEach(route=>check(`sitemap: ${route}`,sitemap.includes(route)));
const config=JSON.parse(read('business-os/configuration-schema.json')),installer=JSON.parse(read('business-os/installer-manifest.json'));
check('configuration schema version',config.properties.schemaVersion.const==='1.0');
check('selected-record hard const',config.properties.features.properties.selectedRecordOnly.const===true);
check('bulk execution hard const',config.properties.features.properties.bulkExecution.const===false);
check('automatic retry hard const',config.properties.features.properties.automaticRetry.const===false);
check('installer rollback hard stop',installer.hardStops.includes('missing rollback point'));
const result={status:failures.length?'FAIL':'PASS',passed:passes.length,failed:failures.length,failures};
console.log(JSON.stringify(result,null,2));process.exit(failures.length?1:0);