#!/usr/bin/env node
'use strict';
const fs=require('fs'),vm=require('vm');
function page(path){const s=fs.readFileSync(path,'utf8'),m=s.match(/String\.raw`([\s\S]*?)`;\n(?:Deno|\nDeno)\.serve/);if(!m)throw Error(path+': HTML missing');const html=m[1],scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);scripts.forEach((x,i)=>new vm.Script(x,{filename:path+':script-'+i}));return{s,html};}
const resale=page('supabase/functions/h38-resale-web/index.ts');
const coupon=page('supabase/functions/h38-coupon-web/index.ts');
for(const marker of ['opportunity-hunter-v13','Use phone location','Loading saved H38 buy leads','Show ','h38-resale-location-v1','CANDIDATE · NEEDS SOLD COMPS','LOCATION NEEDS PROOF','Nearby Stores','NEARBY STORE','completed with no current verified or candidate results'])if(!resale.html.includes(marker))throw Error('Resale missing '+marker);
for(const marker of ['All Opportunities','Repairable','Motivated Seller','Underpriced','INSPECT · PROFIT NOT VERIFIED','Screening spread $','NOT PROFIT','profit_verified===true',"q+' needs work'","q+' OBO'",'h38-shopping-location-v1','Deal ready to evaluate','Build coupon stack','not proof that no resale opportunities exist'])if(!resale.html.includes(marker))throw Error('Opportunity Hunter / Connected Resale UX missing '+marker);
for(const marker of ['Sources — ','When:','Where:','distance unknown','Date needs proof'])if(!resale.html.includes(marker))throw Error('Garage/Estate truth UX missing '+marker);
const resaleApi=fs.readFileSync('supabase/functions/h38-resale-api/index.ts','utf8');
for(const marker of ['h38_shared_deal_cache','SAVED DEAL · NEEDS SOLD COMPS','profit_verified','reseller_hunt_cache'])if(!resaleApi.includes(marker))throw Error('Resale API missing truthful saved-deal fallback: '+marker);
for(const marker of ['watch-tracker-v9','Optimize my list','max_stores:max','Delete price','Remove watch','Delete receipt','Scanned list added'])if(!coupon.html.includes(marker))throw Error('Couponing missing '+marker);
for(const marker of ['h38-shopping-location-v1','Shopping location','Deal brought from H38','Add to shopping list','Prepare coupon stack','Nothing is saved until'])if(!coupon.html.includes(marker))throw Error('Connected Couponing UX missing '+marker);
const penny=page('supabase/functions/h38-penny-web/index.ts');
for(const retailer of ["Lowe\\'s",'Ace Hardware'])if(!penny.html.includes(retailer))throw Error('Deals coverage missing '+retailer.replace('\\',''));
if(/if\(ok\)load\(/.test(resale.html))throw Error('Resale must not scan on open');
const resaleScript=[...resale.html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n');
const rowsFn=resaleScript.match(/function rows\([\s\S]*?return \[\];\}/);
if(!rowsFn)throw Error('Resale result normalizer missing');
const rowSandbox={result:null};vm.createContext(rowSandbox);
vm.runInContext(rowsFn[0]+";result={deals:rows({opportunities:[],candidates:[{title:'candidate'}]},'deals'),facebook:rows({results:[],candidates:[{title:'listing'}]},'facebook'),stores:rows({stores:[{store_name:'nearby'}]},'stores')};",rowSandbox);
if(rowSandbox.result.deals.length!==1||rowSandbox.result.facebook.length!==1||rowSandbox.result.stores.length!==1)throw Error('Resale hides candidate or store fallback rows');
for(const x of [resale,coupon]){if(!x.html.includes("h38_product_entitlements"))throw Error('entitlement gate missing');if(/SERVICE_ROLE|service_role/.test(x.html))throw Error('secret key exposed');}
console.log('PASS: Resale Opportunity Hunter and Couponing mobile UX contracts are intact.');
