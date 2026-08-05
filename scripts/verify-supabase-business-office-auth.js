#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const exists=file=>fs.existsSync(path.join(root,file));
const failures=[];
const check=(condition,message)=>{if(!condition)failures.push(message);};
const has=(source,tokens)=>tokens.every(token=>source.includes(token));
const syntax=file=>{try{new vm.Script(read(file),{filename:file});}catch(error){failures.push(`${file} syntax: ${error.message}`);}};

const config=read('commercial-app/supabase-config.js');
const auth=read('commercial-app/supabase-auth.js');
const noLegacy=read('commercial-app/supabase-no-legacy-office.js');
const sessionGuard=read('commercial-app/auth-session-guard.js');
const db=read('commercial-app/db.js');
const cache=read('commercial-app/auth-cache-guard.js');
const startup=read('commercial-app/supabase-startup.js');
const index=read('commercial-app/index.html');
const launcher=read('open-business-office.html');
const portal=read('portal.html');
const migration=read('supabase/migrations/20260805004500_business_office_auth_resolution.sql');
const hardening=read('supabase/migrations/20260805010000_harden_business_office_auth_state.sql');
const databaseTest=read('supabase/tests/database/business_office_auth_resolution.test.sql');
const runtimeTest=read('scripts/verify-supabase-business-office-auth-runtime.js');

[
  'commercial-app/supabase-config.js','commercial-app/supabase-auth.js',
  'commercial-app/supabase-no-legacy-office.js','commercial-app/auth-session-guard.js',
  'commercial-app/db.js','commercial-app/auth-cache-guard.js',
  'commercial-app/supabase-startup.js','scripts/verify-supabase-business-office-auth-runtime.js'
].forEach(syntax);

check(has(config,[
  "stage: 'supabase-production-only'",
  'standardOffice: true',
  "projectRef: 'jqukmwtsgcsaruucnqja'",
  "url: 'https://jqukmwtsgcsaruucnqja.supabase.co'",
  "authRedirectUrl: 'https://rkrueth-maker.github.io/highway-38-solutions/commercial-app/'",
  'clientTenantsEnabled: true',
  'legacyOfficeEnabled: false',
  'externalActionsEnabled: false'
]),'Supabase-only production configuration is incomplete.');
check(!config.includes('fallbackUrl'),'Supabase configuration must not contain a legacy fallback URL.');
check(!/service_role|SUPABASE_SERVICE_ROLE_KEY/.test(config),'Privileged Supabase credentials must not be in browser config.');

check(!exists('legacy-business-office.html'),'The legacy Business Office route must be removed.');
check(has(launcher,['Supabase is the only supported Office runtime.','location.replace(destination.toString())']),'Standard launcher must open only Supabase.');
check(!/script\.google\.com\/macros|legacy-business-office/i.test(launcher),'Standard launcher must not expose a legacy Office.');
check(has(noLegacy,['publicRouteRemoved: true','automaticFallback: false','manualFallback: false',"supportedRuntime: 'supabase'"]),'Supabase-only runtime guard is incomplete.');
check(index.includes('supabase-no-legacy-office.js'),'Supabase-only runtime guard must load in the Office.');
check(index.indexOf('supabase-no-legacy-office.js')>index.indexOf('app-20.js'),'Supabase-only guard must load after runtime adapters.');
check(portal.includes('url=open-business-office.html')&&portal.includes('location.replace(target)'),'Portal must route to the standard Supabase launcher.');

check(has(index,[
  'id="mainContent"','id="businessSelect"','supabase-config.js','supabase-auth.js',
  'auth-session-guard.js','auth-cache-guard.js','supabase-startup.js','authSignOutButton'
]),'Business Office shell or Auth scripts are incomplete.');
check((index.match(/id="mainContent"/g)||[]).length===1,'Only one Business Office shell is allowed.');
check(index.indexOf('supabase-auth.js')<index.indexOf('auth-session-guard.js'),'Session guard must load after Auth.');
check(index.indexOf('auth-session-guard.js')<index.indexOf('app-01.js'),'Auth guard must load before application startup.');

check(has(auth,[
  "client.rpc('business_office_auth_state')",
  "runtime.activeMemberships = runtime.memberships.filter(row => row.membershipStatus === 'active' && row.businessStatus === 'active')",
  "throw new Error('The selected business is not an active membership.')",
  "flowType: 'pkce'",'resetPasswordForEmail',"event === 'PASSWORD_RECOVERY'",
  "event === 'SIGNED_OUT'","transport = 'supabase-auth'",'externalActionsEnabled: false'
]),'Supabase Auth membership controls are incomplete.');
check(!/service_role|SUPABASE_SERVICE_ROLE_KEY|user_metadata\.role|raw_user_meta_data\.role/.test(auth),'Auth client contains a forbidden authorization source or privileged credential.');

check(has(sessionGuard,['activeBusinessCount > 0',"window.H38DB?.getUserScope?.()"]),'Auth session guard is incomplete.');
check(has(db,[
  "const DB_VERSION=4","const nextScope=`user:${normalizedUserId(userId)}`",
  "new CustomEvent('h38:auth-cleared')",
  "if(!activeScope)throw new Error('Authenticated user scope is required before storing tenant data.')",
  'value.__h38Scope!==expected','legacyDataPresent','clearCurrentScope'
]),'User-scoped IndexedDB controls are incomplete.');
check(has(cache,[
  'if(navigator.onLine)return false',"authorization.status!=='active'",
  'authorization.businessId!==state.businessId','snapshot.authUserId!==userId',
  "snapshot.authorizationStatus!=='active'"
]),'Offline authorization cache guard is incomplete.');
check(has(startup,[
  'state.requestedBusinessId',"startup?.user?.id!==userId",
  "snapshot.authorizationStatus!=='active'",
  "['membership-suspended','membership-revoked','membership-invited','no-membership']",
  "state.bridge.request('fullStartupRefresh'",'h38SetAuthorizedChrome(false)','h38SetAuthorizedChrome(true)'
]),'Supabase startup authorization integration is incomplete.');

check(has(migration,[
  'private.claim_current_business_invites()',
  "lower(btrim(membership.invited_email)) = current_email",
  "'membership_invite_claimed'",'external_action_occurred',
  'grant execute on function public.business_office_auth_state() to authenticated'
]),'Auth migration is incomplete.');
check(has(hardening,[
  'private.current_business_office_auth_state()','security definer',
  'where membership.auth_user_id = current_user_id','No tenant identifier is accepted from the browser'
]),'Auth-state hardening is incomplete.');
check(has(databaseTest,[
  'exact-email invitation is claimed once','two active businesses resolve',
  'suspended membership is visible as denied and not active',
  'revoked membership is visible as denied and not active',
  'no-membership state opens no tenant','rollback;'
]),'Database Auth acceptance is incomplete.');
check(has(runtimeTest,[
  "acceptance:'SUPABASE_BUSINESS_OFFICE_AUTH_RUNTIME'",
  'oneBusinessAutomaticSelection:true','forgedBusinessRejected:true',
  'suspendedMembershipDenied:true','userSwitchClearsVisibleTenant:true',
  'selectedBusinessNamespacedByUser:true','signOutClearsScope:true'
]),'Runtime Auth acceptance is incomplete.');

if(failures.length){
  console.error(JSON.stringify({status:'FAIL',acceptance:'SUPABASE_ONLY_BUSINESS_OFFICE_AUTH',failures},null,2));
  process.exit(1);
}
console.log(JSON.stringify({
  status:'PASS',acceptance:'SUPABASE_ONLY_BUSINESS_OFFICE_AUTH',
  standardOffice:'supabase-only',legacyOfficeRoute:false,legacyFallback:false,
  canonicalMemberships:true,userScopedOfflineCache:true,serviceRoleInBrowser:false,
  clientTenantsEnabled:true,externalActionsEnabled:false
},null,2));
