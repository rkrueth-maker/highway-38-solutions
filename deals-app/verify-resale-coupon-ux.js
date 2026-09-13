#!/usr/bin/env node
'use strict';
const fs=require('fs'),vm=require('vm');
function page(path){const s=fs.readFileSync(path,'utf8'),m=s.match(/String\.raw`([\s\S]*?)`;\n(?:Deno|\nDeno)\.serve/);if(!m)throw Error(path+': HTML missing');const html=m[1],scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);scripts.forEach((x,i)=>new vm.Script(x,{filename:path+':script-'+i}));return{s,html};}
const resale=page('supabase/functions/h38-resale-web/index.ts');
const coupon=page('supabase/functions/h38-coupon-web/index.ts');
for(const marker of ['mobile-ux-v7','Use phone location','Search results','Opening Resale does not start a scan','Show ','h38-resale-location-v1','CANDIDATE · NEEDS SOLD COMPS','LOCATION NEEDS PROOF','Nearby Stores','NEARBY STORE','completed with no current verified or candidate results'])if(!resale.html.includes(marker))throw Error('Resale missing '+marker);
const resaleApi=fs.readFileSync('supabase/functions/h38-resale-api/index.ts','utf8');
for(const marker of ['h38_shared_deal_cache','SAVED DEAL · NEEDS SOLD COMPS','profit_verified','reseller_hunt_cache'])if(!resaleApi.includes(marker))throw Error('Resale API missing truthful saved-deal fallback: '+marker);
for(const marker of ['mobile-ux-v6','Optimize my list','max_stores:max','Delete price','Remove watch','Delete receipt','Scanned list added'])if(!coupon.html.includes(marker))throw Error('Couponing missing '+marker);
if(/if\(ok\)load\(/.test(resale.html))throw Error('Resale must not scan on open');
const resaleScript=[...resale.html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n');
const rowsFn=resaleScript.match(/function rows\([\s\S]*?return \[\];\}/);
if(!rowsFn)throw Error('Resale result normalizer missing');
const rowSandbox={result:null};vm.createContext(rowSandbox);
vm.runInContext(rowsFn[0]+";result={deals:rows({opportunities:[],candidates:[{title:'candidate'}]},'deals'),facebook:rows({results:[],candidates:[{title:'listing'}]},'facebook'),stores:rows({stores:[{store_name:'nearby'}]},'stores')};",rowSandbox);
if(rowSandbox.result.deals.length!==1||rowSandbox.result.facebook.length!==1||rowSandbox.result.stores.length!==1)throw Error('Resale hides candidate or store fallback rows');
for(const x of [resale,coupon]){if(!x.html.includes("h38_product_entitlements"))throw Error('entitlement gate missing');if(/SERVICE_ROLE|service_role/.test(x.html))throw Error('secret key exposed');}
console.log('PASS: Resale and Couponing mobile UX contracts are intact.');
