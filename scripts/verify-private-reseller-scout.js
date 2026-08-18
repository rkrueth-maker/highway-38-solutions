'use strict';

const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const includes=(text,value,message)=>assert(text.includes(value),message||`Missing required marker: ${value}`);

const ownerA='ccf25333-47cd-42ca-a20b-cdbc63a8a695';
const ownerB='6dd51b31-5974-4691-b8b8-83e5877528c0';

const app1=read('commercial-app/app-01.js');
const app2=read('commercial-app/app-02.js');
const client=read('commercial-app/reseller-scout.js');
const css=read('commercial-app/reseller-scout.css');
const moduleContract=read('apps-script/business-office/BusinessOffice_ModuleContract.gs');
const legacyGate=read('apps-script/core-engine/owner-portal-next/Portal_Private_Reseller.js');
const migration=read('supabase/migrations/20260818203000_private_reseller_scout.sql');
const grants=read('supabase/migrations/20260818204000_tighten_private_reseller_grants.sql');
const edge=read('supabase/functions/reseller-deal-feed/index.ts');
const supabaseConfig=read('supabase/config.toml');

for(const id of [ownerA,ownerB]){
  includes(app1,id,'Commercial shell lost one approved private user ID.');
  includes(client,id,'Reseller client lost one approved private user ID.');
  includes(migration,id,'RLS migration lost one approved private user ID.');
  includes(edge,id,'Deal feed lost one approved private user ID.');
}

includes(app1,"reseller:['🏷️','Reseller Scout']",'Reseller Scout page is not registered.');
includes(app1,"page!=='reseller'||isPrivateResellerUser()",'Navigation is not private-user gated.');
includes(app2,"reseller:renderResellerScout",'Reseller route renderer is not registered.');
includes(app2,"reseller-scout.js?build=20260818-private-1",'Reseller client is not loaded on demand.');
includes(app2,"reseller-scout.css?build=20260818-private-1",'Reseller styles are not loaded on demand.');
assert(!read('commercial-app/index.html').includes('reseller-scout.js'),'Private module must not be part of normal startup.');
assert(!read('commercial-app/index.html').includes('reseller-scout.css'),'Private module CSS must not be part of normal startup.');

includes(client,"const DEAL_TABLE='reseller_deals'",'Shared reseller deal table is missing.');
includes(client,"const WATCH_TABLE='reseller_watch_rules'",'Shared reseller watch table is missing.');
includes(client,'reseller-deal-feed','Authenticated deal feed is missing.');
includes(client,'BarcodeDetector','Barcode scan path is missing.');
includes(client,"profit>=40&&roi>=75?'BUY'",'BUY/WATCH/SKIP scoring contract changed unexpectedly.');
includes(client,".limit(50)",'Private list reads must remain bounded.');
assert(css.length>200,'Reseller Scout responsive styling is missing.');

includes(moduleContract,"boUnifiedModule_('resellerScout','Reseller Scout'",'Canonical module contract entry is missing.');
includes(moduleContract,"permissionPolicy:'h38PortalPrivateResellerCanView_'",'Canonical module contract lost the private permission policy.');
includes(moduleContract,"loadStrategy:'on-demand'",'Private module must remain on-demand.');
includes(moduleContract,"externalActions:'none'",'Private module must not gain external actions.');
includes(legacyGate,'return false;','Legacy Apps Script shell must fail closed for Reseller Scout.');

for(const table of ['public.reseller_deals','public.reseller_watch_rules']){
  includes(migration,`alter table ${table} enable row level security;`,`${table} does not explicitly enable RLS.`);
  includes(migration,`revoke all on table ${table} from anon;`,`${table} does not explicitly revoke anon access.`);
  includes(grants,`revoke all on table ${table} from authenticated;`,`${table} does not reset inherited authenticated grants.`);
  includes(grants,`grant select, insert, update, delete on table ${table} to authenticated;`,`${table} has the wrong authenticated privilege set.`);
}
includes(migration,'reseller_deals_private_select','Deal SELECT RLS policy is missing.');
includes(migration,'reseller_deals_private_insert','Deal INSERT RLS policy is missing.');
includes(migration,'reseller_deals_private_update','Deal UPDATE RLS policy is missing.');
includes(migration,'reseller_deals_private_delete','Deal DELETE RLS policy is missing.');
includes(migration,'reseller_watch_private_select','Watch SELECT RLS policy is missing.');
includes(migration,'reseller_watch_private_insert','Watch INSERT RLS policy is missing.');
includes(migration,'reseller_watch_private_update','Watch UPDATE RLS policy is missing.');
includes(migration,'reseller_watch_private_delete','Watch DELETE RLS policy is missing.');

includes(supabaseConfig,'[functions.reseller-deal-feed]','Reseller deal feed config block is missing.');
includes(supabaseConfig,'verify_jwt = true','Reseller deal feed must require JWT verification.');
includes(edge,'Supabase Auth session is required.','Edge function must require a signed-in Supabase session.');
includes(edge,'ALLOWED_USER_IDS.has(userId)','Edge function must fail closed to the two-user allowlist.');
assert(!edge.includes('Access-Control-Allow-Origin: *'),'Deal feed must not use wildcard CORS.');

const privateSources=[app1,app2,client,moduleContract,legacyGate,migration,grants,edge];
for(const source of privateSources){
  assert(!source.includes('mandakw55@gmail.com'),'Private branch source must not expose Amanda email.');
}

new Function(client);
new Function(app1);
new Function(app2);

console.log('PASS private Reseller Scout build');
console.log('  two-user gate: PASS');
console.log('  on-demand module loading: PASS');
console.log('  bounded reads: PASS');
console.log('  RLS + least-privilege grants: PASS');
console.log('  JWT-protected feed: PASS');
console.log('  legacy shell fail-closed: PASS');
console.log('  external actions: NONE');
