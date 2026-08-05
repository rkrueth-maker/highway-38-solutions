#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const failures=[];
const checks=[];
function check(condition,message){checks.push(message);if(!condition)failures.push(message);}
function includes(source,markers,label){for(const marker of markers)check(source.includes(marker),`${label}: ${marker}`);}
function excludes(source,markers,label){for(const marker of markers)check(!source.includes(marker),`${label} excludes: ${marker}`);}
function syntax(file){try{new vm.Script(read(file),{filename:file});check(true,`${file} parses`);}catch(error){failures.push(`${file} syntax: ${error.message}`);}}

const config=read('commercial-app/supabase-config.js');
const auth=read('commercial-app/supabase-auth.js');
const db=read('commercial-app/db.js');
const cache=read('commercial-app/auth-cache-guard.js');
const startup=read('commercial-app/supabase-startup.js');
const index=read('commercial-app/index.html');
const migration=read('supabase/migrations/20260805004500_business_office_auth_resolution.sql');
const hardening=read('supabase/migrations/20260805010000_harden_business_office_auth_state.sql');
const databaseTest=read('supabase/tests/database/business_office_auth_resolution.test.sql');

['commercial-app/supabase-config.js','commercial-app/supabase-auth.js','commercial-app/db.js','commercial-app/auth-cache-guard.js','commercial-app/supabase-startup.js'].forEach(syntax);

includes(config,[
  "projectRef: 'uvcqnkjidllhdmjnqshk'",
  "url: 'https://uvcqnkjidllhdmjnqshk.supabase.co'",
  'productionPromotionAuthorized: false',
  'northernLakesEnabled: false',
  'externalActionsEnabled: false'
],'preview config');
excludes(config,['jqukmwtsgcsaruucnqja','service_role','SUPABASE_SERVICE_ROLE_KEY'],'preview config');

includes(index,[
  '<title>Highway 38 Business Office</title>',
  'id="mainContent"',
  'id="businessSelect"',
  'supabase-config.js',
  'supabase-auth.js',
  'auth-cache-guard.js',
  'supabase-startup.js',
  'authSignOutButton'
],'existing shell');
check((index.match(/id="mainContent"/g)||[]).length===1,'one Business Office main shell');
check(index.indexOf('supabase-auth.js')<index.indexOf('app-01.js'),'Auth bridge overrides before app startup');
check(index.indexOf('auth-cache-guard.js')>index.indexOf('app-17.js'),'cache guard loads after legacy cache function');
check(index.indexOf('supabase-startup.js')>index.indexOf('startup-fix.js'),'Supabase startup extends existing startup');
excludes(index,['businesses/northern-lakes','nlpm-office-gateway'],'existing shell');

includes(auth,[
  "client.rpc('business_office_auth_state')",
  "runtime.activeMemberships = runtime.memberships.filter(row => row.membershipStatus === 'active' && row.businessStatus === 'active')",
  "const preferred = readPreferredBusiness(session.user.id)",
  "throw new Error('The selected business is not an active membership.')",
  "flowType: 'pkce'",
  'resetPasswordForEmail',
  "event === 'PASSWORD_RECOVERY'",
  "event === 'SIGNED_OUT'",
  "transport = 'supabase-auth'",
  'productionPromotionAuthorized: false',
  'northernLakesEnabled: false',
  'externalActionsEnabled: false'
],'Auth client');
excludes(auth,['service_role','SUPABASE_SERVICE_ROLE_KEY','user_metadata.role','raw_user_meta_data.role'],'Auth client');
check(!/from\(['"]businesses['"]\).*eq\(['"]id['"],\s*(requested|businessId)/s.test(auth),'browser does not authorize by direct business lookup');

includes(db,[
  "const DB_VERSION=4",
  "activeScope=`user:${normalizedUserId(userId)}`",
  "if(!activeScope)throw new Error('Authenticated user scope is required before storing tenant data.')",
  'value.__h38Scope!==expected',
  'legacyDataPresent',
  'clearCurrentScope'
],'user-scoped IndexedDB');
check(!db.includes("objectStore(store).get(id)"),'raw tenant IDs are not read without scope');

includes(cache,[
  'if(navigator.onLine)return false',
  "authorization.status!=='active'",
  'authorization.businessId!==state.businessId',
  'snapshot.authUserId!==userId',
  "snapshot.authorizationStatus!=='active'"
],'offline cache guard');

includes(startup,[
  'state.requestedBusinessId',
  "startup?.user?.id!==userId",
  "snapshot.user.userId!==userId",
  "snapshot.authorizationStatus!=='active'",
  "['membership-suspended','membership-revoked','membership-invited','no-membership']",
  "state.bridge.request('fullStartupRefresh'",
  'Only active memberships returned by Supabase Auth are listed above.'
],'startup integration');
excludes(startup,["localStorage.getItem('h38-selected-business')",'completionSync'],'startup integration');

includes(migration,[
  'Canonical Business Office Auth foundation is missing',
  'private.claim_current_business_invites()',
  "lower(btrim(membership.invited_email)) = current_email",
  "'membership_invite_claimed'",
  'external_action_occurred',
  'security invoker',
  'grant execute on function public.business_office_auth_state() to authenticated'
],'Auth migration');
includes(hardening,[
  'private.current_business_office_auth_state()',
  'security definer',
  'where membership.auth_user_id = current_user_id',
  'security invoker',
  'select private.current_business_office_auth_state()',
  'No tenant identifier is accepted from the browser'
],'denied-state hardening');
excludes(migration+hardening,['create table public.profiles','create table public.invitations','create table public.tenants'],'canonical schema reuse');

includes(databaseTest,[
  'exact-email invitation is claimed once',
  'two active businesses resolve',
  'suspended membership is visible as denied and not active',
  'revoked membership is visible as denied and not active',
  'no-membership state opens no tenant',
  'invite claim is recorded without an external action',
  'rollback;'
],'database acceptance');

const protectedNorthernLakes=read('businesses/northern-lakes/deploy-request.json');
check(!/supabase|uvcqnkjidllhdmjnqshk|activate/i.test(protectedNorthernLakes),'Northern Lakes deploy request remains untouched and inactive');

if(failures.length){
  console.error(JSON.stringify({status:'FAIL',acceptance:'SUPABASE_BUSINESS_OFFICE_AUTH_SOURCE',failures,checkCount:checks.length},null,2));
  process.exit(1);
}
console.log(JSON.stringify({
  status:'PASS',
  acceptance:'SUPABASE_BUSINESS_OFFICE_AUTH_SOURCE',
  checkCount:checks.length,
  canonicalMemberships:true,
  publicResolverSecurityInvoker:true,
  privateCurrentUserResolver:true,
  userScopedOfflineCache:true,
  legacyUnscopedCacheRefused:true,
  oneBusinessOfficeShell:true,
  serviceRoleInBrowser:false,
  productionPromotionAuthorized:false,
  northernLakesEnabled:false,
  externalActionsEnabled:false
},null,2));
